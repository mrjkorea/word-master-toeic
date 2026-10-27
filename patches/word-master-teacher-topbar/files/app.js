(function () {
  "use strict";

  const Algo = window.WordFactoryAlgo;
  const LS_STATE_LEGACY = "mrj.word_factory.state";
  const LS_STATE_PREFIX = "mrj.word_factory.state.";
  const LS_STATE_BACKUP = "mrj.word_factory.state.shared_backup";
  const LS_LEGACY_CLAIMED = "mrj.word_factory.legacy_claimed_by";
  const LS_EVENTS_LEGACY = "mrj.word_factory.events";
  const LS_EVENTS_PREFIX = "mrj.word_factory.events.";
  const DEMO_PACK_ID = "nouns100";
  const PACK_IDS = [
    "nouns100", "verbs100", "adjectives100", "nouns200", "little100",
    "verbs200", "adjectives200", "adverbs100", "nouns300", "verbs300",
    "adjectives300", "nouns400", "adverbs200", "nouns500", "verbs400",
    "adjectives400", "nouns600", "little210", "adverbs300", "nouns700",
    "verbs500", "adjectives500", "nouns800", "verbs600", "adjectives600",
    "nouns900", "adverbs427", "nouns1000", "verbs700", "adjectives700",
    "verbs800", "adjectives800", "verbs900", "adjectives900", "verbs1000",
    "ielts01", "ielts02", "ielts03", "ielts04", "ielts05",
    "ielts06", "ielts07", "ielts08", "ielts09", "ielts10",
    "ielts11", "ielts12", "ielts13", "ielts14", "ielts15",
    "culture_m08",
  ];

  const DEMO_FALLBACK = {
    id: DEMO_PACK_ID,
    title: "A1 Nouns 1–100",
    words: [
      { id: "time", en: "time", ko: "시간" },
      { id: "year", en: "year", ko: "년" },
      { id: "people", en: "people", ko: "사람들" },
      { id: "way", en: "way", ko: "길" },
      { id: "day", en: "day", ko: "날" },
      { id: "man", en: "man", ko: "남자" },
      { id: "thing", en: "thing", ko: "물건" },
      { id: "woman", en: "woman", ko: "여자" },
      { id: "life", en: "life", ko: "삶" },
      { id: "child", en: "child", ko: "아이" },
    ],
  };

  const $ = function (sel, root) {
    return (root || document).querySelector(sel);
  };
  const $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  const I18n = window.WordFactoryI18n;
  const t = function (key, vars) { return I18n ? I18n.t(key, vars) : key; };

  function localeCode() {
    if (I18n && I18n.getLocale) return I18n.getLocale();
    return state.locale || "en";
  }

  function meaning(w) {
    if (!w) return "";
    const loc = localeCode();
    const l1 = w.l1 && typeof w.l1 === "object" ? w.l1 : {};
    if (loc === "en") {
      const ww = w.ww && typeof w.ww === "object" ? w.ww : null;
      const enExplanation = (ww && ww.def ? wwEn(ww.def) : "") || String(l1.en || "").trim();
      if (enExplanation) return enExplanation;
      // Packs without an English definition (Day 2 packs: ko only) used to echo
      // the English word here, so Learn choices matched the prompt and Write
      // showed the answer. Show the Korean meaning instead.
      const koWord = String(l1.ko || w.ko || "").trim();
      if (koWord) return koWord;
      return String(w.en || "").trim();
    }
    let nativeWord = String(l1[loc] || "").trim();
    if (!nativeWord && loc === "ko") nativeWord = String(w.ko || "").trim();
    return nativeWord;
  }

  function rockLabel(w) {
    if (!w) return "";
    const loc = localeCode();
    if (loc === "en") return String(w.en || "").trim();
    const l1 = w.l1 && typeof w.l1 === "object" ? w.l1 : {};
    let native = String(l1[loc] || "").trim();
    if (!native && loc === "ko") native = String(w.ko || "").trim();
    return native;
  }

  function packWord(w, i) {
    const l1 = w.l1 && typeof w.l1 === "object" ? w.l1 : null;
    return {
      id: String(w.id || w.en || "w" + (i + 1)),
      en: String(w.en || w.word || ""),
      ko: String(w.ko || (l1 && l1.ko) || w.meaning || ""),
      l1: l1,
      ww: w.ww && typeof w.ww === "object" ? w.ww : null,
    };
  }

  const LS_ROLE = "mrj.word_factory.role";
  let armedGame = "";

  function savedRole() {
    try { return localStorage.getItem(LS_ROLE) || ""; } catch (e) { return ""; }
  }

  function rememberRole() {
    if (isPublicMode()) return;
    try {
      if (!window.PathLock) return;
      const search = window.location && window.location.search ? String(window.location.search) : "";
      if (window.PathLock.isTeacher(search, "")) localStorage.setItem(LS_ROLE, "teacher");
      else if (/(?:^|[?&])mode=student(?:&|$)/.test(search)) localStorage.setItem(LS_ROLE, "student");
    } catch (e) {}
  }

  function teacherNow() {
    try {
      if (window.MRJTeacherUnlock && window.MRJTeacherUnlock.isMrjTeacher()) return true;
      const api = window.MRJSignin || window.MRJ_AUTH;
      return !!(api && typeof api.isTeacher === "function" && api.isTeacher());
    } catch (e) {
      return false;
    }
  }

  function syncPathRound(set) {
    if (!set || !window.PathLock || typeof window.PathLock.syncRound !== "function") return;
    try { window.PathLock.syncRound(set); } catch (e) {}
  }

  function studentLocked(set, step) {
    if (teacherNow()) return false;
    if (!set || !window.PathLock) return true;
    if (allRoundActive(set) && (step === "intro" || step === "A")) return true;
    if (step === "games" && roundReadyForGame(set)) return false;
    try { return !window.PathLock.can(set, step, pathOpts()).ok; } catch (e) { return true; }
  }

  function showPathLock(gate) {
    const order = { intro: 1, A: 2, B: 3, C: 4, games: 5, test: 6 };
    const need = (gate && gate.need) || "intro";
    const n = order[need] || 1;
    const text = t("finish_step_first", { n: n });
    const note = $("#path-lock-note");
    if (note) {
      note.hidden = false;
      note.textContent = text;
    }
    const gamesNote = $("#games-lock-note");
    if (gamesNote) {
      gamesNote.hidden = false;
      gamesNote.textContent = text;
    }
    const jump = $("#btn-games-need");
    if (jump) {
      jump.hidden = false;
      jump.textContent = text;
      jump.setAttribute("data-need", need);
    }
  }

  function hideGamesLock() {
    const gamesNote = $("#games-lock-note");
    if (gamesNote) {
      gamesNote.hidden = true;
      gamesNote.textContent = "";
    }
    const jump = $("#btn-games-need");
    if (jump) jump.hidden = true;
  }

  function pathOpen(step) {
    if (teacherNow()) return true;
    const set = currentSet();
    if (!set || !window.PathLock) return false;
    if (allRoundActive(set) && (step === "intro" || step === "A")) return false;
    try {
      if (step === "games" && roundReadyForGame(set)) {
        rememberFinishedMeet(set);
        hideGamesLock();
        return true;
      }
      rememberFinishedMeet(set);
      const gate = window.PathLock.can(set, step, pathOpts());
      if (gate && gate.ok) {
        if (step === "games") hideGamesLock();
        return true;
      }
      showPathLock(gate);
      return false;
    } catch (e) {
      return false;
    }
  }

  function mergeScoreRows(a, b) {
    const mergeFn = window.MRJ_WM_mergeScoreRows;
    if (mergeFn) return mergeFn(a, b);
    const rows = (Array.isArray(a) ? a : []).concat(Array.isArray(b) ? b : []);
    const seen = {};
    const out = [];
    rows.forEach(function (row) {
      if (!row || typeof row !== "object") return;
      const key = String(row.at || 0) + "|" + String(row.kind || "") + "|" + String(row.pack || "");
      if (seen[key]) return;
      seen[key] = true;
      out.push(row);
    });
    out.sort(function (x, y) { return (Number(y.at) || 0) - (Number(x.at) || 0); });
    return out;
  }

  function scoreRowHasRealScore(row) {
    if (!row || typeof row !== "object") return false;
    const score = Number(row.score);
    const total = Number(row.total);
    return isFinite(score) && isFinite(total) && total > 0;
  }

  function activityLabelForKind(kind, extra) {
    const k = String(kind || "");
    if (k === "final") return "All-pack test";
    if (k === "check") return "Checkup";
    if (k === "test_easy") return "Easy test";
    if (k === "test_hard") return "Hard test";
    if (k === "game") return (extra && extra.game) ? String(extra.game) + " game" : "Game";
    if (extra && extra.activity) return String(extra.activity);
    return "Activity";
  }

  const recordDateFormatters = {};

  function recordDateFormatter() {
    const loc = state.locale || "en";
    if (!Object.prototype.hasOwnProperty.call(recordDateFormatters, loc)) {
      try {
        recordDateFormatters[loc] = new Intl.DateTimeFormat(loc, {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
      } catch (e) {
        recordDateFormatters[loc] = null;
      }
    }
    return recordDateFormatters[loc];
  }

  function formatRecordDate(at) {
    const d = new Date(Number(at) || Date.now());
    const fmt = recordDateFormatter();
    if (fmt) {
      try {
        return fmt.format(d);
      } catch (e) {}
    }
    try {
      return d.toLocaleDateString(state.locale || "en", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch (e2) {
      return d.toISOString().slice(0, 10);
    }
  }

  function formatScoreRecordLine(row) {
    if (!row || typeof row !== "object") return "";
    const date = formatRecordDate(row.at);
    const pack = String(row.pack || "").trim();
    const act = String(row.activity || activityLabelForKind(row.kind, row)).trim();
    let line = date;
    if (pack) line += " · " + pack;
    if (act) line += " · " + act;
    if (scoreRowHasRealScore(row)) {
      const pct = Math.round((100 * Number(row.score)) / Number(row.total));
      line += " · " + pct + "%";
    }
    return line;
  }

  function recordScoreDayWords(packId, words, at) {
    const SDL = window.MRJ_WM_scoreDayLog;
    if (!SDL || !packId || !words || !words.length) return;
    const set = Object.keys(state.sets || {})
      .map(function (k) { return state.sets[k]; })
      .filter(function (s) { return s && s.packId === packId; })[0];
    const packWords = (set && set.words) || [];
    SDL.recordWords(state, packId, words, packWords, at || Date.now());
  }

  function appendScoreRow(row) {
    if (!row || !row.pack || !row.kind) return;
    const entry = {
      at: Number(row.at) || Date.now(),
      pack: String(row.pack),
      kind: String(row.kind),
      activity: String(row.activity || activityLabelForKind(row.kind, row)),
    };
    if (scoreRowHasRealScore(row)) {
      entry.score = Number(row.score);
      entry.total = Number(row.total);
    }
    if (row.wordIds && row.wordIds.length) entry.wordIds = row.wordIds.slice();
    if (row.wordEns && row.wordEns.length) entry.wordEns = row.wordEns.slice();
    if (row.wordFrom != null) entry.wordFrom = row.wordFrom;
    if (row.wordTo != null) entry.wordTo = row.wordTo;
    if (row.words && row.words.length) {
      recordScoreDayWords(row.pack, row.words, entry.at);
    }
    if (!state.scoreRows || !Array.isArray(state.scoreRows)) state.scoreRows = [];
    state.scoreRows = mergeScoreRows(state.scoreRows, [entry]);
  }

  function bookProgressProgramOk(row) {
    const prog = String(
      row.program || row.curriculum_program || row.app_name || row.appName || row.app || ""
    ).toLowerCase().replace(/\s+/g, "-");
    return !prog || prog === "word-master" || prog === "word_factory";
  }

  function rowFromBookProgress(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (!bookProgressProgramOk(raw)) return null;
    const pack = String(
      raw.pack || raw.pack_id || raw.packId || raw.unit_title || raw.unitTitle || ""
    ).trim();
    if (!pack) return null;
    const kind = String(raw.kind || raw.item_type || raw.itemType || raw.event_kind || "book").trim();
    const at = Number(raw.at || raw.ended_at || raw.when || raw.ts) || 0;
    if (!at) return null;
    const row = {
      at: at,
      pack: pack,
      kind: kind,
      activity: String(raw.activity || raw.item_type || raw.itemType || activityLabelForKind(kind, raw)).trim(),
    };
    const score = raw.score != null ? Number(raw.score) : Number(raw.score_value);
    const total = raw.total != null ? Number(raw.total) : Number(raw.score_max);
    if (isFinite(score) && isFinite(total) && total > 0) {
      row.score = score;
      row.total = total;
    }
    return row;
  }

  function ingestBookProgress(raw) {
    if (!raw) return;
    let list = raw;
    if (!Array.isArray(list)) {
      if (Array.isArray(raw.rows)) list = raw.rows;
      else if (Array.isArray(raw.events)) list = raw.events;
      else if (Array.isArray(raw.progress)) list = raw.progress;
      else return;
    }
    const kept = [];
    list.forEach(function (item) {
      const row = rowFromBookProgress(item);
      if (row) kept.push(row);
    });
    if (!kept.length) return;
    if (!state.scoreRows || !Array.isArray(state.scoreRows)) state.scoreRows = [];
    state.scoreRows = mergeScoreRows(state.scoreRows, kept);
  }

  function rowsFromSetScores() {
    const out = [];
    Object.keys(state.sets || {}).forEach(function (k) {
      const s = state.sets[k];
      if (!s || !s.packId) return;
      const fin = s.final;
      if (fin && isFinite(Number(fin.score)) && isFinite(Number(fin.total)) && Number(fin.total) > 0) {
        out.push({
          at: Number(fin.at) || 0,
          pack: s.packId,
          kind: "final",
          activity: "All-pack test",
          score: Number(fin.score),
          total: Number(fin.total),
        });
      }
      const chk = s.check;
      if (chk && isFinite(Number(chk.score)) && isFinite(Number(chk.total)) && Number(chk.total) > 0) {
        out.push({
          at: Number(chk.at) || 0,
          pack: s.packId,
          kind: "check",
          activity: "Checkup",
          score: Number(chk.score),
          total: Number(chk.total),
        });
      }
    });
    return out;
  }

  function collectScoreRecordRows() {
    const base = state.scoreRows && Array.isArray(state.scoreRows) ? state.scoreRows : [];
    return mergeScoreRows(base, rowsFromSetScores());
  }

  let scoreRecordRenderGen = 0;
  const SCORE_RECORD_RENDER_BATCH = 200;

  function renderScoreRecord() {
    const list = $("#score-record-list");
    const empty = $("#score-record-empty");
    if (!list) return;
    scoreRecordRenderGen += 1;
    const gen = scoreRecordRenderGen;
    list.innerHTML = "";
    const SDL = window.MRJ_WM_scoreDayLog;
    const daySummaries = SDL ? SDL.summariesByDate(state.dailyWordLog, { limit: 60 }) : [];
    if (daySummaries.length) {
      daySummaries.forEach(function (day) {
        const head = document.createElement("li");
        head.className = "score-record-day";
        head.textContent = day.date;
        list.appendChild(head);
        (day.packs || []).forEach(function (p) {
          const li = document.createElement("li");
          li.className = "score-record-day-words";
          li.textContent = (p.pack ? p.pack + " · " : "") + p.line;
          list.appendChild(li);
        });
      });
    }
    const rows = collectScoreRecordRows();
    if (!rows.length && !daySummaries.length) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = "No scores yet.";
      }
      return;
    }
    if (empty) empty.hidden = true;
    let idx = 0;
    function appendBatch(count) {
      if (gen !== scoreRecordRenderGen) return;
      const end = Math.min(idx + count, rows.length);
      for (; idx < end; idx += 1) {
        const li = document.createElement("li");
        li.textContent = formatScoreRecordLine(rows[idx]);
        list.appendChild(li);
      }
      if (idx < rows.length) {
        const raf = window.requestAnimationFrame
          || function (fn) { return setTimeout(fn, 0); };
        raf(function () { appendBatch(SCORE_RECORD_RENDER_BATCH); });
      }
    }
    appendBatch(SCORE_RECORD_RENDER_BATCH);
  }

  function openScoreRecord() {
    if (!currentStudentId()) return; /* sign-in only */
    renderScoreRecord();
    showScreen("record");
  }

  function paintStudentNameBtn() {
    const btn = $("#btn-student-name");
    if (!btn) return;
    const id = currentStudentId();
    if (id) {
      btn.hidden = false;
      btn.textContent = id;
      btn.title = "Score record";
    } else {
      btn.hidden = true;
      btn.textContent = "";
      btn.title = "";
    }
    paintTeacherUnlockBtn();
  }

  function paintTeacherUnlockBtn() {
    const btn = $("#btn-teacher-unlock");
    if (!btn) return;
    const id = currentStudentId();
    const show = !!id && !isPublicMode();
    btn.hidden = !show;
    if (!show) return;
    const unlock = window.MRJTeacherUnlock;
    const on = unlock && typeof unlock.isMrjTeacher === "function" && unlock.isMrjTeacher();
    btn.textContent = unlock && typeof unlock.topbarLabel === "function" ? unlock.topbarLabel() : "Teacher";
    btn.classList.toggle("is-unlocked", !!on);
    btn.title = on ? "Teacher mode (tap to lock)" : "Teacher unlock";
  }

  function refreshTeacherChrome() {
    paintTeacherUnlockBtn();
    const teacher = teacherNow();
    document.body.classList.toggle("is-teacher", teacher);
    document.body.classList.toggle("is-student", !teacher);
    const tb = $("#teacher-bar");
    if (tb) {
      const quiet = currentScreen === "boot" || currentScreen === "name" || currentScreen === "home";
      const typing = currentScreen === "learn" || currentScreen === "test";
      tb.hidden = !teacher || quiet || typing || currentScreen === "playgame";
    }
    if (currentScreen === "set") renderSetHome();
    else if (currentScreen === "home") renderHome();
  }
  let currentScreen = "boot";
  let speechUnlocked = false;
  let voices = [];
  let linuxTts = false;
  let ttsProbe = null;

  let state = loadState();
  let learn = blankLearn();
  let quiz = blankQuiz();
  let matchGame = null;
  let listenGame = null;
  let externalPackSrc = null;
  let externalPack = null;

  function initPackSrcParam() {
    const PackSrc = window.PackSrc;
    if (!PackSrc) return;
    const raw = PackSrc.readPackSrcFromLocation(window.location);
    if (raw && PackSrc.isAllowedPackSrc(raw)) {
      externalPackSrc = raw;
      externalPack = {
        src: raw,
        folder: PackSrc.mediaFolderFromSrc(raw),
        pictureExt: PackSrc.pictureExtFromSrc(raw),
        sharedLetters: PackSrc.defaultSharedLetters(raw),
      };
    }
  }

  function isExternalPackMode() {
    return !!externalPackSrc;
  }

  function uid(prefix) {
    return (
      (prefix || "id") +
      "_" +
      Math.random().toString(36).slice(2, 10) +
      Date.now().toString(36).slice(-4)
    );
  }

  function studentStorageKey(id) {
    return String(id || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function stateStorageKey(id) {
    const k = studentStorageKey(id);
    return k ? LS_STATE_PREFIX + k : LS_STATE_LEGACY;
  }

  function eventsStorageKey(id) {
    const k = studentStorageKey(id);
    return k ? LS_EVENTS_PREFIX + k : LS_EVENTS_LEGACY;
  }

  function freshState(forId) {
    return {
      studentId: forId || uid("stu"),
      sessionId: uid("ses"),
      voice: "us_m",
      displayName: "",
      accountName: "",
      accountPin: "",
      testKind: "easy",
      studySize: 10,
      locale: "en",
      currentSetId: null,
      sets: {},
      scoreRows: [],
    };
  }

  function normalizeStoredState(parsed) {
    if (!parsed || typeof parsed !== "object") return freshState();
    if (!parsed.displayName) parsed.displayName = "";
    if (!parsed.accountName) parsed.accountName = "";
    if (!parsed.accountPin) parsed.accountPin = "";
    if (!parsed.testKind) parsed.testKind = "easy";
    var ss = Number(parsed.studySize);
    if (!(ss === 0 || ss === 5 || ss === 10 || ss === 15 || ss === 20)) parsed.studySize = 10;
    if (!parsed.voice || parsed.voice === "man") parsed.voice = "us_m";
    if (parsed.voice === "woman") parsed.voice = "us_f";
    if (parsed.voice === "maya" || parsed.voice === "wizard") {
      parsed.voice = parsed.voice === "wizard" ? "grandpa" : "grandma";
    }
    if (!parsed.sets || typeof parsed.sets !== "object") parsed.sets = {};
    if (!Array.isArray(parsed.scoreRows)) parsed.scoreRows = [];
    return parsed;
  }

  function loadStateForStudent(id) {
    try {
      const raw = localStorage.getItem(stateStorageKey(id));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed) return normalizeStoredState(parsed);
      }
    } catch (e) {}
    return freshState(id);
  }

  function legacyHasPlayableSets(parsed) {
    if (!parsed || !parsed.sets || typeof parsed.sets !== "object") return false;
    return Object.keys(parsed.sets).length > 0;
  }

  /** Real sign-in id on the blob, if any (not an anonymous stu_* device id). */
  function legacyOwnerStorageKey(parsed) {
    if (!parsed || typeof parsed !== "object") return "";
    const acct = studentStorageKey(parsed.accountName || "");
    if (acct) return acct;
    const sid = String(parsed.studentId || "").trim();
    const sidKey = studentStorageKey(sid);
    const disp = studentStorageKey(parsed.displayName || "");
    if (sidKey && !/^stu[_-]/i.test(sid)) return sidKey;
    if (disp && !/^stu[_-]/i.test(parsed.displayName || "")) return disp;
    return "";
  }

  function slimFromStateObj(st) {
    const saved = state;
    state = normalizeStoredState(st);
    const slim = slimProgress();
    state = saved;
    return slim;
  }

  /**
   * Moves shared legacy localStorage into this sign-in when allowed.
   * Ownerless blobs go to the first student on this tablet only (see PR).
   */
  function consumeLegacyIfEligible(id) {
    const key = studentStorageKey(id);
    if (!key) return null;
    let legacy = "";
    try {
      legacy = localStorage.getItem(LS_STATE_LEGACY) || "";
    } catch (e) {
      return null;
    }
    if (!legacy) return null;
    let parsed = null;
    try {
      parsed = JSON.parse(legacy);
    } catch (e) {
      return null;
    }
    if (!legacyHasPlayableSets(parsed)) return null;
    const owner = legacyOwnerStorageKey(parsed);
    if (owner) {
      if (owner !== key) return null;
    } else {
      let claimed = "";
      try {
        claimed = localStorage.getItem(LS_LEGACY_CLAIMED) || "";
      } catch (e) {
        return null;
      }
      const claimedKey = studentStorageKey(claimed);
      if (claimedKey && claimedKey !== key) return null;
      try {
        localStorage.setItem(LS_LEGACY_CLAIMED, id);
      } catch (e) {}
    }
    try {
      localStorage.setItem(LS_STATE_BACKUP, legacy);
      localStorage.removeItem(LS_STATE_LEGACY);
    } catch (e) {}
    return parsed;
  }

  function recoveryBlobAllowedForStudent(parsed, id) {
    if (!parsed || !legacyHasPlayableSets(parsed)) return false;
    const owner = legacyOwnerStorageKey(parsed);
    const key = studentStorageKey(id);
    if (owner) return owner === key;
    let claimed = "";
    try {
      claimed = localStorage.getItem(LS_LEGACY_CLAIMED) || "";
    } catch (e) {}
    const claimedKey = studentStorageKey(claimed);
    return !claimedKey || claimedKey === key;
  }

  /** Max-merge shared_backup and per-student snapshots (never deletes backup). */
  function mergeRecoverySnapshots(id) {
    const blobs = [];
    try {
      const backup = localStorage.getItem(LS_STATE_BACKUP);
      if (backup) blobs.push(JSON.parse(backup));
    } catch (e) {}
    try {
      const per = localStorage.getItem(stateStorageKey(id));
      if (per) blobs.push(JSON.parse(per));
    } catch (e) {}
    blobs.forEach(function (parsed) {
      if (!recoveryBlobAllowedForStudent(parsed, id)) return;
      mergeRemoteProgress(slimFromStateObj(parsed));
    });
    dedupeSetsByPackId();
  }

  function saveStateToStorage(forId) {
    if (isPublicMode()) return;
    const id = forId != null ? String(forId).trim() : currentStudentId();
    const key = id ? stateStorageKey(id) : LS_STATE_LEGACY;
    try {
      if (id && !forId) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const existing = JSON.parse(raw);
            if (existing && existing.sets) mergeRemoteProgress(slimFromStateObj(existing));
          } catch (e) {}
        }
      }
      localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {}
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(LS_STATE_LEGACY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.studentId) return normalizeStoredState(parsed);
      }
    } catch (e) {}
    return freshState();
  }

  let progressTimer = null;
  let notedKnown = null;
  let authStudentId = "";
  let pullGen = 0;

  function currentStudentId() {
    let id = String(authStudentId || "").trim();
    if (!id && window.MRJ_AUTH && typeof window.MRJ_AUTH.student === "function") {
      id = String(window.MRJ_AUTH.student() || "").trim();
    }
    return id;
  }

  function onAuthReady(event) {
    const detail = event && event.detail ? event.detail : {};
    let id = detail.id != null ? String(detail.id).trim() : "";
    if (!id && window.MRJ_AUTH && typeof window.MRJ_AUTH.student === "function") {
      id = String(window.MRJ_AUTH.student() || "").trim();
    }
    const prev = authStudentId;
    const reauth = !!(prev && id && prev === id);
    if (prev && prev !== id) saveStateToStorage(prev);
    authStudentId = id;
    setProgressTooLargeWarn(false);
    state.accountName = "";
    state.accountPin = "";
    if (!id) {
      state.displayName = "";
      if (window.MRJTeacherUnlock && typeof window.MRJTeacherUnlock.lockPinSession === "function") {
        window.MRJTeacherUnlock.lockPinSession();
      }
      showSharedDoor();
      showScreen("boot");
      return;
    }
    let memorySlim = null;
    if (reauth) {
      try {
        memorySlim = slimProgress();
      } catch (e) {
        memorySlim = null;
      }
    }
    const legacyBlob = consumeLegacyIfEligible(id);
    state = loadStateForStudent(id);
    state.studentId = id;
    state.displayName = id;
    if (detail.progress) ingestBookProgress(detail.progress);
    if (memorySlim && memorySlim.sets && Object.keys(memorySlim.sets).length) {
      mergeRemoteProgress(memorySlim);
    }
    if (legacyBlob) {
      mergeRemoteProgress(slimFromStateObj(legacyBlob));
      saveStateToStorage();
    }
    mergeRecoverySnapshots(id);
    dedupeSetsByPackId();
    saveStateToStorage();
    if (window.MRJ_WM_progress && typeof window.MRJ_WM_progress.resetSession === "function") {
      window.MRJ_WM_progress.resetSession();
    }
    pullSheet();
    paintStudentNameBtn();
    if (currentScreen === "home") renderHome();
  }

  if (window.addEventListener) {
    window.addEventListener("mrj-auth-ready", onAuthReady);
    document.addEventListener("mrj-teacher", function () {
      refreshTeacherChrome();
    });
    if (window.MRJTeacherUnlock && typeof window.MRJTeacherUnlock.installRefresh === "function") {
      window.MRJTeacherUnlock.installRefresh(refreshTeacherChrome);
    }
    window.addEventListener("mrj-wm-save-status", function (ev) {
      const ok = !!(ev && ev.detail && ev.detail.ok);
      const err = ev && ev.detail && ev.detail.error ? String(ev.detail.error) : "";
      if (ok) {
        setProgressTooLargeWarn(false);
      } else if (err === "too_large") {
        setProgressTooLargeWarn(true);
        noteSheetLocalOnly();
        paintSaveWarn(false);
        return;
      }
      noteSheetSync(ok);
      paintSaveWarn(!ok);
    });
  }

  function isSignedIn() {
    return !!currentStudentId();
  }

  /** Public news pack (js/public-pack.js): play with no sign-in, save nothing. */
  function isPublicMode() {
    return !!window.WM_PUBLIC_PACK && !!externalPackSrc
      && !!(window.PackSrc && window.PackSrc.isPublicPackSrc && window.PackSrc.isPublicPackSrc(externalPackSrc));
  }

  function canPlay() {
    return !!currentStudentId() || isPublicMode();
  }

  function showSharedDoor() {
    const gate = document.getElementById("mrj-auth-gate");
    if (gate) gate.hidden = false;
    if (document.documentElement) document.documentElement.classList.add("mrj-auth-locked");
  }

  function currentWordId() {
    if (learn && learn.cur && learn.cur.id) return learn.cur.id;
    if (quiz && quiz.items && quiz.items[quiz.index] && quiz.items[quiz.index].id) {
      return quiz.items[quiz.index].id;
    }
    const set = currentSet();
    if (set && set.words && set.words[0]) return set.words[0].id;
    return "";
  }

  function copyPassed(src) {
    const out = {};
    if (!src || typeof src !== "object") return out;
    Object.keys(src).forEach(function (id) {
      out[id] = src[id];
    });
    return out;
  }

  function mergePackSlim(a, b) {
    const mergeFn = window.MRJ_WM_mergePack;
    if (mergeFn) return mergeFn(a, b);
    return b || a || {};
  }

  function packSlimFromSet(s) {
    if (!s) return {};
    return {
      title: s.title || "",
      winsA: s.winsA || {},
      winsB: s.winsB || {},
      winsC: s.winsC || {},
      intro: s.intro || {},
      meetLock: Array.isArray(s.meetLock) ? s.meetLock.slice() : [],
      startNumber: (Number(s.startNumber) >= 1) ? Number(s.startNumber) : null,
      testPassed: copyPassed(s.testPassed),
      tapmapKey: s.tapmapKey || "",
      lastPlayedAt: s.lastPlayedAt || 0,
      srsTrying: !!s.srsTrying,
      srsForever: !!s.srsForever,
      srsStage: s.srsStage || 0,
      srsNextAt: s.srsNextAt || null,
      final: s.final || null,
      check: s.check || null,
      finalMiss: Array.isArray(s.finalMiss) ? s.finalMiss.slice() : [],
      roundGames: s.roundGames && typeof s.roundGames === "object" ? s.roundGames : {},
      pathHeld: s.pathHeld && typeof s.pathHeld === "object" ? s.pathHeld : {},
      externalPackSrc: s.externalPackSrc || "",
    };
  }

  function applySlimPackToSet(set, slim) {
    if (!set || !slim) return;
    const merged = mergePackSlim(packSlimFromSet(set), slim);
    set.title = merged.title || set.title;
    set.winsA = merged.winsA || {};
    set.winsB = merged.winsB || {};
    set.winsC = merged.winsC || {};
    set.intro = merged.intro || {};
    set.meetLock = merged.meetLock || [];
    dropStaleMeetLock(set);
    set.startNumber = (Number(merged.startNumber) >= 1) ? Number(merged.startNumber) : null;
    set.testPassed = copyPassed(merged.testPassed);
    set.tapmapKey = merged.tapmapKey || "";
    set.lastPlayedAt = merged.lastPlayedAt || set.lastPlayedAt || 0;
    set.srsTrying = !!merged.srsTrying;
    set.srsForever = !!merged.srsForever;
    set.srsStage = merged.srsStage || 0;
    set.srsNextAt = merged.srsNextAt != null ? merged.srsNextAt : set.srsNextAt;
    set.final = merged.final || set.final;
    set.check = merged.check || set.check;
    set.finalMiss = Array.isArray(merged.finalMiss) ? merged.finalMiss.slice() : set.finalMiss;
    set.roundGames = merged.roundGames && typeof merged.roundGames === "object" ? merged.roundGames : set.roundGames;
    set.pathHeld = merged.pathHeld && typeof merged.pathHeld === "object" ? merged.pathHeld : set.pathHeld;
    if (slim.externalPackSrc && !set.externalPackSrc) set.externalPackSrc = slim.externalPackSrc;
  }

  function findSetByPackId(pid) {
    const keys = Object.keys(state.sets || {});
    for (let i = 0; i < keys.length; i++) {
      const s = state.sets[keys[i]];
      if (s && s.packId === pid) return s;
    }
    return null;
  }

  function dedupeSetsByPackId() {
    const seen = {};
    const keys = Object.keys(state.sets || {});
    keys.forEach(function (k) {
      const s = state.sets[k];
      if (!s || !s.packId) return;
      const pid = s.packId;
      if (!seen[pid]) {
        seen[pid] = s;
        return;
      }
      const keep = seen[pid];
      const drop = s;
      applySlimPackToSet(keep, packSlimFromSet(drop));
      if ((!keep.words || !keep.words.length) && drop.words && drop.words.length) {
        keep.words = drop.words;
      }
      if (drop.externalPackSrc && !keep.externalPackSrc) keep.externalPackSrc = drop.externalPackSrc;
      delete state.sets[drop.id];
      if (state.currentSetId === drop.id) state.currentSetId = keep.id;
    });
  }

  function slimProgress() {
    const sets = {};
    Object.keys(state.sets || {}).forEach(function (k) {
      const s = state.sets[k];
      const pid = s && s.packId;
      if (!pid) return;
      const slim = packSlimFromSet(s);
      if (sets[pid]) {
        sets[pid] = mergePackSlim(sets[pid], slim);
      } else {
        sets[pid] = slim;
      }
    });
    const cur = currentSet();
    const out = {
      v: 1,
      studentId: state.studentId,
      voice: state.voice,
      voiceAt: state.voiceAt || 0,
      locale: state.locale,
      studySize: state.studySize,
      testKind: state.testKind,
      currentPackId: cur ? (cur.packId || "") : "",
      sets: sets,
      scoreRows: mergeScoreRows(state.scoreRows || [], []),
    };
    if (state.dailyWordLog && state.dailyWordLog.days && Object.keys(state.dailyWordLog.days).length) {
      out.dailyWordLog = state.dailyWordLog;
    }
    return out;
  }

  function mergeRemoteProgress(raw) {
    if (!raw) return;
    let remote = raw;
    if (typeof raw === "string") {
      try { remote = JSON.parse(raw); } catch (e) { return; }
    }
    if (!remote || typeof remote !== "object" || !remote.sets) return;
    const local = slimProgress();
    const mergeFn = window.MRJ_WM_merge
      || (window.MRJ_WM_progress && window.MRJ_WM_progress.merge);
    const merged = mergeFn ? mergeFn(local, remote) : remote;
    applyRemote(merged);
  }

  function applyRemote(raw) {
    if (!raw) return;
    let obj = raw;
    if (typeof raw === "string") {
      try { obj = JSON.parse(raw); } catch (e) { return; }
    }
    if (!obj || typeof obj !== "object" || !obj.sets) return;
    if (Array.isArray(obj.scoreRows)) {
      state.scoreRows = mergeScoreRows(state.scoreRows || [], obj.scoreRows);
    }
    if (obj.dailyWordLog && window.MRJ_WM_scoreDayLog) {
      state.dailyWordLog = window.MRJ_WM_scoreDayLog.mergeDailyLogs(state.dailyWordLog, obj.dailyWordLog);
    } else if (obj.dailyWordLog) {
      state.dailyWordLog = obj.dailyWordLog;
    }
    if (obj.voice) state.voice = obj.voice;
    if (obj.voiceAt != null) state.voiceAt = Number(obj.voiceAt) || 0;
    if (obj.locale) state.locale = obj.locale;
    if (obj.studySize != null) {
      var ss = Number(obj.studySize);
      if (ss === 0 || ss === 5 || ss === 10 || ss === 15 || ss === 20) state.studySize = ss;
    }
    if (obj.testKind) state.testKind = obj.testKind;
    if (!obj.v && obj.currentSetId) {
      state.sets = obj.sets;
      state.currentSetId = obj.currentSetId;
      dedupeSetsByPackId();
      return;
    }
    Object.keys(obj.sets).forEach(function (pid) {
      const incoming = obj.sets[pid] || {};
      let set = findSetByPackId(pid);
      if (!set) {
        const id = "set_" + pid;
        set = {
          id: id,
          packId: pid,
          title: incoming.title || pid,
          words: incoming.words || [],
          externalPackSrc: incoming.externalPackSrc || "",
          winsA: {},
          winsB: {},
          winsC: {},
          intro: {},
          meetLock: [],
          createdAt: incoming.lastPlayedAt || Date.now(),
          lastPlayedAt: incoming.lastPlayedAt || 0,
        };
        state.sets[id] = set;
      }
      applySlimPackToSet(set, incoming);
      if (obj.currentPackId === pid) state.currentSetId = set.id;
    });
    dedupeSetsByPackId();
  }

  function pullSheet() {
    const id = currentStudentId();
    if (!id) return;
    if (!window.MRJ_WM_progress || !window.MRJ_WM_progress.load) return;
    const gen = ++pullGen;
    window.MRJ_WM_progress.load().then(function (res) {
      if (gen !== pullGen || currentStudentId() !== id) return;
      if (res && res.found && res.progress_json) mergeRemoteProgress(res.progress_json);
      dedupeSetsByPackId();
      state.studentId = id;
      saveStateToStorage();
      if (
        window.MRJ_WM_progress
        && typeof window.MRJ_WM_progress.isReadyToSave === "function"
        && window.MRJ_WM_progress.isReadyToSave()
      ) {
        persist();
      }
      if (res && res.ok) {
        noteSheetSync(true);
      } else if (res && res.error === "load_failed") {
        noteSheetLocalOnly();
      } else {
        noteSheetSync(false);
      }
      if (currentScreen === "home") renderHome();
      if (currentScreen === "set") renderSetHome();
    }).catch(function () {
      if (gen !== pullGen) return;
      noteSheetLocalOnly();
    });
  }

  function progressPayload() {
    const set = currentSet();
    const screen = currentScreen || "";
    const packId = set ? (set.packId || set.id || "") : "";
    const out = {
      pack_id: packId,
      pack_title: set ? (set.title || "") : "",
      screen: screen,
      word_id: currentWordId(),
      study_size: state.studySize || 10,
      locale: state.locale || "en",
      progress_json: JSON.stringify(slimProgress()),
    };
    return out;
  }

  function studyIds(set) {
    if (!set) return [];
    dropStaleMeetLock(set);
    if (Array.isArray(set.meetLock) && set.meetLock.length) return set.meetLock.slice();
    return playWords(set).map(function (w) { return w && w.id; }).filter(function (id) {
      return id != null && id !== "";
    });
  }

  function wordKnown(set, id) {
    const passed = (set && set.testPassed) || {};
    if (Object.prototype.hasOwnProperty.call(passed, id) && Number(passed[id]) >= PASS_PCT) return true;
    const intro = (set && set.intro) || {};
    if (!intro[id]) return false;
    const winsA = (set && set.winsA) || {};
    const winsB = (set && set.winsB) || {};
    const winsC = (set && set.winsC) || {};
    return (winsA[id] || 0) >= 2 && (winsB[id] || 0) >= 2 && (winsC[id] || 0) >= 2;
  }

  function catchKnown(set) {
    if (!set) return;
    const ids = studyIds(set);
    const total = ids.length;
    let known = 0;
    ids.forEach(function (id) {
      if (wordKnown(set, id)) known += 1;
    });
    const pack = set.packId || set.id || "";
    const prev = notedKnown;
    if (prev && prev.pack === pack && total > 0 && known > prev.count) {
      if (window.MRJ_WM_progress && typeof window.MRJ_WM_progress.logResult === "function") {
        window.MRJ_WM_progress.logResult({
          packId: pack,
          packTitle: set.title || "",
          kind: "known",
          score: known,
          total: total,
        });
      }
    }
    notedKnown = { pack: pack, count: known, total: total };
  }

  function stampCheck(set, score, total) {
    const value = Number(score);
    const max = Number(total);
    if (!set || !isFinite(value) || !isFinite(max) || !(max > 0)) return;
    set.check = { score: value, total: max, at: Date.now() };
  }

  function logActivityResult(r) {
    if (window.MRJ_WM_progress && typeof window.MRJ_WM_progress.logResult === "function") {
      window.MRJ_WM_progress.logResult(r);
    }
  }

  function persist() {
    catchKnown(currentSet());
    saveStateToStorage();
    if (progressTimer) clearTimeout(progressTimer);
    if (!currentStudentId()) {
      progressTimer = null;
      return;
    }
    progressTimer = setTimeout(function () {
      progressTimer = null;
      if (window.MRJ_WM_progress && typeof window.MRJ_WM_progress.save === "function") {
        if (window.MRJ_WM_progress.isReadyToSave && !window.MRJ_WM_progress.isReadyToSave()) {
          return;
        }
        const payload = progressPayload();
        if (payload.screen === "boot" && !payload.pack_id) return;
        try {
          const pending = window.MRJ_WM_progress.save(payload);
          if (pending && typeof pending.then === "function") {
            pending.then(function (res) {
              const ok = !!(res && typeof res === "object" && res.ok !== false && !res.error);
              noteSheetSync(ok);
              paintSaveWarn(!ok);
            }).catch(function () {
              noteSheetSync(false);
              paintSaveWarn(true);
            });
          }
        } catch (e) {
          noteSheetSync(false);
          paintSaveWarn(true);
        }
      }
    }, 1000);
  }

  function loadEvents() {
    try {
      const raw = localStorage.getItem(eventsStorageKey(currentStudentId()));
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function logEvent(partial) {
    if (isPublicMode()) return;
    const set = currentSet();
    const ev = {
      student_id: currentStudentId(),
      session_id: state.sessionId,
      module_id: "word_factory",
      activity_id: partial.activity_id || "",
      item_id: partial.item_id || "",
      skill_tags: partial.skill_tags || ["vocab"],
      set_id: set ? set.id : "",
      mode: partial.mode || "",
      response: partial.response == null ? "" : String(partial.response),
      correct: !!partial.correct,
      latency_ms: partial.latency_ms || 0,
      wins_toward_2: partial.wins_toward_2 || 0,
      points: partial.points || 0,
      errors: partial.errors || 0,
      started_at: partial.started_at || Date.now(),
      ended_at: Date.now(),
      ui_locale: state.locale || "en",
    };
    const events = loadEvents();
    events.push(ev);
    try {
      localStorage.setItem(eventsStorageKey(currentStudentId()), JSON.stringify(events));
    } catch (e) {}
  }

  function currentSet() {
    return state.sets[state.currentSetId] || null;
  }

  function winsState(set) {
    return { winsA: set.winsA, winsB: set.winsB, winsC: set.winsC };
  }

  function factoryCleared(set) {
    return Algo.startMode(set.words, winsState(set)) === null;
  }

  function syncPack() {
    const set = currentSet();
    window.MRJ_WORD_FACTORY_PACK = set
      ? { words: set.words.map(function (w) { return { id: w.id, en: w.en, ko: w.ko }; }) }
      : { words: [] };
  }

  function blankLearn() {
    return {
      mode: "A",
      queue: [],
      cur: null,
      typed: "",
      startedAt: 0,
      locking: false,
      missTeach: false,
      // Copy-back state for Write (C) misses. Reset here so a stale flag can
      // never survive a part change (bug: Dictation froze and never reached Write).
      mustCopy: false,
      pendingNxt: null,
    };
  }

  function blankQuiz() {
    return {
      kind: "easy",
      items: [],
      index: 0,
      typed: "",
      score: 0,
      startedAt: 0,
      locking: false,
    };
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z]/g, "");
  }

  function setRangeBannerText(set) {
    set = set || currentSet();
    const el = $("#set-range-banner");
    if (!el) return "";
    if (!set || !set.packId || !(set.words || []).length) {
      el.hidden = true;
      el.textContent = "";
      return "";
    }
    const round = playWords(set);
    if (!round.length) {
      el.hidden = true;
      el.textContent = "";
      return "";
    }
    const SDL = window.MRJ_WM_scoreDayLog;
    const base = SDL && SDL.packWordBase ? SDL.packWordBase(set.packId) : 1;
    const wordIndex = SDL && SDL.wordIndexInPack
      ? function (id) { return SDL.wordIndexInPack(set.words, id); }
      : function (id) {
        for (let i = 0; i < set.words.length; i++) {
          if (set.words[i] && set.words[i].id === id) return i + 1;
        }
        return 0;
      };
    const globalNum = SDL && SDL.globalWordNumber
      ? function (idx) { return SDL.globalWordNumber(set.packId, idx); }
      : function (idx) { return base + idx - 1; };
    const firstIdx = wordIndex(round[0].id);
    const lastIdx = wordIndex(round[round.length - 1].id);
    if (!(firstIdx >= 1) || !(lastIdx >= 1)) {
      el.hidden = true;
      el.textContent = "";
      return "";
    }
    const from = globalNum(firstIdx);
    const to = globalNum(lastIdx);
    const rawTitle = String(set.title || "");
    const shortTitle = (rawTitle.indexOf("·") >= 0 ? rawTitle.trim() : rawTitle.replace(/\s+\d+.*$/, "").trim()) || set.title || "";
    const text = shortTitle + " " + from + "–" + to;
    el.textContent = text;
    el.hidden = false;
    return text;
  }

  function paintSetRangeBanner(screenName) {
    const quiet = screenName === "boot" || screenName === "home" || screenName === "name";
    if (quiet || !currentSet()) {
      const el = $("#set-range-banner");
      if (el) {
        el.hidden = true;
        el.textContent = "";
      }
      return;
    }
    setRangeBannerText();
  }

  function showScreen(name) {
    if (currentScreen === "playgame" && name !== "playgame") closeGameFrame();
    currentScreen = name;
    $$(".screen").forEach(function (el) {
      el.classList.toggle("active", el.getAttribute("data-screen") === name);
    });
    paintSetRangeBanner(name);
    const back = $("#btn-back");
    const voice = $("#voice-toggle");
    const topbar = $("#topbar");
    const typing = name === "learn" || name === "test";
    const quiet = name === "boot" || name === "name" || name === "home";
    if (topbar) {
      topbar.hidden = false;
      topbar.classList.toggle("no-back", name === "home" || name === "boot");
    }
    paintStudentNameBtn();
    back.hidden = name === "boot" || name === "home";
    voice.hidden = false;
    paintTeacherUnlockBtn();
    const tb = $("#teacher-bar");
    const teacher = teacherNow();
    document.body.classList.toggle("is-teacher", teacher);
    document.body.classList.toggle("is-student", !teacher);
    if (tb) tb.hidden = !teacher || quiet || typing || name === "playgame";
    document.querySelector(".phone").classList.toggle("play", typing || name === "playgame");
    if (name !== "learn") {
      const cap = $("#caption-fallback");
      if (cap) cap.hidden = true;
    }
  }
  window.MRJ_WM_showScreen = showScreen;

  function setVoice(code) {
    const ok = { us_m: 1, us_f: 1, uk_m: 1, uk_f: 1, grandma: 1, leo: 1, grandpa: 1, robot: 1 };
    state.voice = ok[code] ? code : "us_m";
    state.voiceAt = Date.now();
    persist();
    $$(".voice-btn").forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-voice") === state.voice ? "true" : "false");
    });
  }

  function refreshVoices() {
    if (!window.speechSynthesis) return;
    voices = speechSynthesis.getVoices() || [];
  }

  function pickVoice() {
    refreshVoices();
    if (!voices.length) return null;
    const wantMan = state.voice !== "woman";
    const femaleRe = /female|woman|samantha|karen|victoria|zira|moira|kyoko|yuna|nicky|tessa|fiona|veena|zuzana|susan|martha|princess|bella|siri|allison|ava|kathy|paulina|meijia|tingting/i;
    const maleRe = /\bmale\b|\bman\b|daniel|alex|fred|david|tom|ravi|arthur|aaron|gordon|jorge|diego|ralph|bruce|albert|puck|fred|whisper|bad news|good news|trinoids|boing|zarvox|cellos|nicky male|google us english male|english united states male|microsoft david|microsoft mark|microsoft guy/i;
    let best = null;
    let bestScore = -9999;
    voices.forEach(function (v) {
      const blob = ((v.name || "") + " " + (v.voiceURI || "") + " " + (v.lang || "")).toLowerCase();
      let score = 0;
      const en = /^en\b|en[-_]/.test(v.lang || "") || /english/.test(blob);
      if (en) score += 8;
      const isF = femaleRe.test(blob) && !/\bmale\b/.test(blob.replace("female", ""));
      const isM = maleRe.test(blob) && !/female/.test(blob);
      if (wantMan) {
        if (isM) score += 24;
        if (isF) score -= 30;
      } else {
        if (isF) score += 24;
        if (isM) score -= 30;
      }
      if (v.localService) score += 2;
      if (score > bestScore) {
        bestScore = score;
        best = v;
      }
    });
    if (wantMan && best) {
      const blob = ((best.name || "") + " " + (best.voiceURI || "")).toLowerCase();
      const isF = femaleRe.test(blob) && !/\bmale\b/.test(blob.replace("female", ""));
      if (isF) {
        const maleOnly = voices.filter(function (v) {
          const b = ((v.name || "") + " " + (v.voiceURI || "") + " " + (v.lang || "")).toLowerCase();
          return maleRe.test(b) && !/female/.test(b);
        });
        if (maleOnly.length) best = maleOnly[0];
      }
    }
    return best;
  }

  function hasSpeech() {
    return typeof window !== "undefined" && "speechSynthesis" in window && !!window.speechSynthesis;
  }

  function probeLinuxTts() {
    ttsProbe = fetch("/__mrj/tts", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        linuxTts = !!(j && j.linux_tts);
        return linuxTts;
      })
      .catch(function () {
        linuxTts = false;
        return false;
      });
    return ttsProbe;
  }

  let currentAudio = null;

  function audioBox() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioBox.ctx) audioBox.ctx = new AC();
    if (audioBox.ctx.state === "suspended") audioBox.ctx.resume();
    return audioBox.ctx;
  }

  function blip(freq, when, dur, gain) {
    const c = audioBox();
    if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(freq, when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain || 0.08, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start(when);
    o.stop(when + dur + 0.02);
  }

  function dingOk() {
    const c = audioBox();
    if (!c) {
      try { new Audio("audio/ding.wav").play().catch(function () {}); } catch (e) {}
      confetti(24);
      return;
    }
    const t = c.currentTime;
    blip(523.25, t, 0.11, 0.07);
    blip(659.25, t + 0.08, 0.13, 0.07);
    blip(783.99, t + 0.16, 0.18, 0.06);
    confetti(26);
  }

  function cheerBig() {
    const c = audioBox();
    if (c) {
      const t = c.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
        blip(f, t + i * 0.09, 0.22, 0.09);
      });
    }
    confetti(64);
  }

  function confetti(n) {
    const canvas = $("#confetti");
    if (!canvas || !canvas.getContext) return;
    const box = canvas.parentElement.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(box.width));
    canvas.height = Math.max(1, Math.floor(box.height));
    canvas.hidden = false;
    const g = canvas.getContext("2d");
    const colors = ["#f5c400", "#ff4d6d", "#3d8bfd", "#30d158", "#ff8a00", "#b44dff"];
    const bits = [];
    const count = n || 24;
    for (let i = 0; i < count; i++) {
      const left = i % 2 === 0;
      bits.push({
        x: left ? 8 : canvas.width - 8,
        y: canvas.height * 0.42 + Math.random() * 30,
        w: 7 + Math.random() * 6,
        h: 4 + Math.random() * 3,
        vx: (left ? 1 : -1) * (2.2 + Math.random() * 2.4),
        vy: -3.2 - Math.random() * 2.6,
        rot: Math.random() * 6,
        vr: -0.25 + Math.random() * 0.5,
        color: colors[i % colors.length],
      });
    }
    let frames = 0;
    function tick() {
      frames += 1;
      g.clearRect(0, 0, canvas.width, canvas.height);
      bits.forEach(function (b) {
        b.x += b.vx;
        b.y += b.vy;
        b.vy += 0.12;
        b.rot += b.vr;
        g.save();
        g.translate(b.x, b.y);
        g.rotate(b.rot);
        g.fillStyle = b.color;
        g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        g.restore();
      });
      if (frames < 72) requestAnimationFrame(tick);
      else {
        g.clearRect(0, 0, canvas.width, canvas.height);
        canvas.hidden = true;
      }
    }
    requestAnimationFrame(tick);
  }

  function packIdForSet(set) {
    return (set && set.packId) || DEMO_PACK_ID;
  }

  function currentPackId() {
    return packIdForSet(currentSet());
  }

  function mediaSrcForSet(set) {
    const src = (set && set.externalPackSrc) || "";
    if (src && window.PackSrc && window.PackSrc.isAllowedPackSrc(src)) return src;
    return "";
  }

  function packBase() {
    const set = currentSet();
    const src = mediaSrcForSet(set);
    if (src) return window.PackSrc.mediaFolderFromSrc(src);
    if (!set && externalPack && externalPack.folder) return externalPack.folder;
    return "packs/" + currentPackId();
  }

  function mediaUrl(path) {
    try {
      return new URL(path, window.location.href).href;
    } catch (e) {
      return path;
    }
  }

  function wordFromHint(hint) {
    if (hint && typeof hint === "object") return hint;
    const words = (currentSet() && currentSet().words) || [];
    const raw = String(hint || "");
    const lower = raw.toLowerCase();
    const letters = lower.replace(/[^a-z]/g, "");
    let i;
    for (i = 0; i < words.length; i++) {
      const w = words[i];
      if (w && String(w.id || "").toLowerCase() === lower) return w;
    }
    if (!letters) return null;
    for (i = 0; i < words.length; i++) {
      const w = words[i];
      if (!w) continue;
      const enLetters = String(w.en || "").toLowerCase().replace(/[^a-z]/g, "");
      const idLetters = String(w.id || "").toLowerCase().replace(/[^a-z]/g, "");
      if (enLetters === letters || idLetters === letters) return w;
    }
    return null;
  }

  function mediaFile(hint) {
    const word = wordFromHint(hint);
    let id = "";
    if (word && word.id != null && String(word.id) !== "") id = String(word.id);
    else if (hint && typeof hint === "object") id = String(hint.id || hint.en || "");
    else id = String(hint || "");
    id = id.toLowerCase();
    if (!id) return "";
    return encodeURIComponent(id);
  }

  function playClip(src, capMs) {
    const token = window.SpellStop.bump();
    const audio = new Audio();
    window.SpellStop.bind(audio);
    currentAudio = audio;
    const done = waitAudioEnd(audio, token, capMs);
    audio.src = src;
    let p = null;
    try {
      p = audio.play();
    } catch (e) {
      if (typeof audio.onerror === "function") audio.onerror();
    }
    if (p && typeof p.then === "function") {
      p.then(function () {
        window.SpellStop.settle(audio, token);
      }, function () {
        window.SpellStop.settle(audio, token);
        if (typeof audio.onerror === "function") audio.onerror();
      });
    }
    return done;
  }

  /* Day 2 packs only ship us_m, us_f, grandma, grandpa, robot audio. A saved UK or
     Teenager voice made every word silent there (404), so fall back to a voice the pack has. */
  const DAY2_VOICES = ["us_m", "us_f", "grandma", "grandpa", "robot"];
  function playVoice() {
    const v = state.voice || "us_m";
    const set = currentSet();
    let list = set && Array.isArray(set.voices) && set.voices.length ? set.voices : null;
    if (!list && String(packBase()).indexOf("/day2-words/") >= 0) list = DAY2_VOICES;
    if (!list || list.indexOf(v) >= 0) return v;
    return v === "uk_f" && list.indexOf("us_f") >= 0 ? "us_f" : "us_m";
  }

  function speak(str) {
    const id = mediaFile(str);
    if (!id) return Promise.resolve();
    const v = playVoice();
    return playClip(packBase() + "/audio/" + v + "/" + id + ".mp3", 8000);
  }

  function speakWW(w) {
    const id = mediaFile(w);
    if (!id) return Promise.resolve();
    return playClip(packBase() + "/audio/ww_us_m/" + id + ".mp3", 8000);
  }

  function wwLoc(blob) {
    if (!blob) return "";
    if (typeof blob === "string") return blob;
    const loc = localeCode();
    return String(blob[loc] || blob.en || "").trim();
  }

  function wwEn(blob) {
    if (!blob) return "";
    if (typeof blob === "string") return String(blob).trim();
    return String(blob.en || "").trim();
  }

  function fillWW(w) {
    const box = $("#meet-ww");
    if (!box) return;
    const ww = w && w.ww;
    if (!ww) {
      box.hidden = true;
      return;
    }
    const def = wwEn(ww.def);
    const ex = wwLoc(ww.example);
    const exEn = wwEn(ww.example);
    const origin = wwLoc(ww.origin);
    const syn = wwEn(ww.syn);
    const ant = wwEn(ww.ant);
    const bits = wwEn(ww.bits);
    if (!def && !exEn && !origin && !syn && !ant && !bits) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const posEl = $("#ww-pos");
    if (posEl) posEl.textContent = ww.pos === "n" ? t("ww_noun") : (ww.pos || "");
    const defEl = $("#ww-def");
    if (defEl) {
      defEl.textContent = def;
      defEl.hidden = !def;
    }
    const exBtn = $("#ww-ex");
    if (exBtn) {
      exBtn.textContent = (ww.example && ww.example.en) || exEn || "";
      exBtn.hidden = !exBtn.textContent;
    }
    const exL1 = $("#ww-ex-l1");
    if (exL1) {
      const loc = localeCode();
      const shown = loc === "en" ? "" : ex;
      exL1.textContent = shown;
      exL1.hidden = !shown;
    }
    const chips = $("#ww-chips");
    if (chips) {
      chips.innerHTML = "";
      function addChip(label, value) {
        if (!value) return;
        const span = document.createElement("span");
        span.className = "ww-chip";
        span.textContent = label + ": " + value;
        chips.appendChild(span);
      }
      addChip(t("ww_bits"), bits);
      addChip(t("ww_origin"), origin);
      addChip(t("ww_like"), syn);
      addChip(t("ww_unlike"), ant);
    }
  }

  function waitAudioEnd(audio, token, capMs) {
    return new Promise(function (resolve) {
      if (!audio || (token != null && window.SpellStop.stale(token))) {
        resolve();
        return;
      }
      var settled = false;
      var safety = null;
      var watch = null;
      function finish() {
        if (settled) return;
        settled = true;
        if (safety) clearTimeout(safety);
        if (watch) clearInterval(watch);
        try {
          audio.onended = null;
          audio.onerror = null;
        } catch (e) {}
        resolve();
      }
      safety = setTimeout(finish, capMs == null ? 4000 : capMs);
      if (token != null) {
        watch = setInterval(function () {
          if (window.SpellStop.stale(token)) finish();
        }, 40);
      }
      audio.onended = finish;
      audio.onerror = finish;
    });
  }

  async function tryPlayLetterSrc(audio, src, token) {
    if (!audio || window.SpellStop.stale(token)) return false;
    try {
      audio.pause();
    } catch (e) {}
    for (var attempt = 0; attempt < 2; attempt++) {
      if (window.SpellStop.stale(token)) return false;
      audio.src = src;
      try {
        var p = audio.play();
        if (p && typeof p.then === "function") {
          p.then(function () {
            window.SpellStop.settle(audio, token);
          }, function () {
            window.SpellStop.settle(audio, token);
          });
        }
        await p;
      } catch (e) {
        if (window.SpellStop.stale(token)) {
          window.SpellStop.settle(audio, token);
          return false;
        }
        continue;
      }
      if (window.SpellStop.stale(token)) {
        window.SpellStop.settle(audio, token);
        return false;
      }
      return true;
    }
    return false;
  }

  async function speakLetter(ch, token) {
    const id = String(ch || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (!id) return;
    if (window.SpellStop.stale(token)) return;
    var audio = currentAudio;
    if (!audio) {
      audio = new Audio();
      currentAudio = audio;
      window.SpellStop.bind(audio);
    }
    var ok = await tryPlayLetterSrc(audio, packBase() + "/audio/letters/" + id + ".mp3", token);
    if (window.SpellStop.stale(token)) {
      window.SpellStop.settle(audio, token);
      return;
    }
    if (!ok && externalPack && externalPack.sharedLetters) {
      ok = await tryPlayLetterSrc(audio, externalPack.sharedLetters + "/" + id + ".mp3", token);
    } else if (!ok && !isExternalPackMode()) {
      ok = await tryPlayLetterSrc(audio, "packs/nouns100/audio/letters/" + id + ".mp3", token);
    }
    if (window.SpellStop.stale(token)) {
      window.SpellStop.settle(audio, token);
      return;
    }
    if (!ok) return;
    await waitAudioEnd(audio, token);
  }

  function unlockSpeech() {
    if (speechUnlocked) return;
    speechUnlocked = true;
    if (!hasSpeech()) return;
    refreshVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = refreshVoices;
    }
    try {
      const u = new SpeechSynthesisUtterance("ready");
      u.volume = 0.01;
      u.rate = 2;
      u.lang = "en-US";
      speechSynthesis.speak(u);
    } catch (e) {}
    setInterval(function () {
      try {
        if (speechSynthesis.paused) speechSynthesis.resume();
      } catch (e2) {}
    }, 400);
  }

  function flashMark(ok) {
    const el = $("#flash");
    const mark = $("#flash-mark");
    if (!el) return wait(ok ? 650 : 850);
    mark.textContent = ok ? "✓" : "✕";
    el.className = "flash " + (ok ? "ok" : "bad");
    el.hidden = false;
    return wait(ok ? 650 : 850).then(function () {
      el.hidden = true;
    });
  }

  const STUDY_SIZES = [5, 10, 15, 20];
  const PASS_PCT = 80;
  let sheetSync = { ok: null, at: 0, localOnly: false };
  let tap = blankTap();

  function studySize(set) {
    set = set || currentSet();
    const raw = Number(state.studySize);
    if (raw === 0) {
      const total = set && set.words ? set.words.length : 0;
      return total > 0 ? total : 0;
    }
    return STUDY_SIZES.indexOf(raw) >= 0 ? raw : 10;
  }

  function allStudyMode() {
    return Number(state.studySize) === 0;
  }

  function allRoundActive(set) {
    set = set || currentSet();
    if (!allStudyMode() || !set || !set.words || !set.words.length) return false;
    return playWords(set).length >= set.words.length;
  }

  function sliceCount(set, startNumber) {
    set = set || currentSet();
    const total = set && set.words ? set.words.length : 0;
    const start = Math.max(1, Math.floor(Number(startNumber)) || 1);
    if (Number(state.studySize) === 0) return Math.max(0, total - start + 1);
    return studySize(set);
  }

  function batchWords(set) {
    set = set || currentSet();
    if (!set || !set.words || !set.words.length) return [];
    const n = Math.min(studySize(), set.words.length);
    const ids = window.MeetLock.batchIds(
      set.words,
      set.intro || {},
      set.winsA || {},
      set.winsB || {},
      set.winsC || {},
      n,
      2
    );
    if (ids.length) return window.MeetLock.wordsForLock(set.words, ids);
    return set.words.slice(0, n);
  }

  function wordMap(set) {
    const map = {};
    ((set && set.words) || []).forEach(function (w) {
      if (w && w.id != null) map[w.id] = w;
    });
    return map;
  }

  // wm-2 / wm-4: a saved Meet lock whose ids are not all in the current pack
  // (pack edited, renamed ids, other pack's round) must not leave an empty
  // round that counts as finished. Drop it so the normal batch words are used.
  function dropStaleMeetLock(set) {
    if (!set || !Array.isArray(set.meetLock) || !set.meetLock.length) return false;
    const ids = Object.create(null);
    (set.words || []).forEach(function (w) { if (w && w.id != null) ids[w.id] = true; });
    const stale = set.meetLock.some(function (id) { return !ids[id]; });
    if (stale) set.meetLock = [];
    return stale;
  }

  function meetLockHeld(set) {
    dropStaleMeetLock(set);
    if (!set || !Array.isArray(set.meetLock) || !set.meetLock.length) return false;
    return !window.MeetLock.lockCleared(
      wordMap(set),
      set.meetLock,
      set.intro || {},
      set.winsA || {},
      set.winsB || {},
      set.winsC || {},
      2
    );
  }

  function playWords(set) {
    set = set || currentSet();
    if (!set) return [];
    dropStaleMeetLock(set);
    if (set.meetLock && set.meetLock.length) {
      return window.MeetLock.wordsForLock(set.words || [], set.meetLock);
    }
    return batchWords(set);
  }

  function lockOrigin(set) {
    if (!set || !Array.isArray(set.words) || !set.words.length) return 1;
    const lock = set.meetLock || [];
    if (!lock.length) return 1;
    const first = lock[0];
    for (let i = 0; i < set.words.length; i++) {
      if (set.words[i] && set.words[i].id === first) return i + 1;
    }
    return 1;
  }

  function migrateRoundProgress(set, fromKey, toKey) {
    if (!set || !fromKey || !toKey || fromKey === toKey) return;
    if (set.roundGames && set.roundGames[fromKey]) {
      if (!set.roundGames) set.roundGames = {};
      const saved = set.roundGames[fromKey];
      const dest = set.roundGames[toKey];
      if (!dest || (saved && saved.done && !dest.done)) set.roundGames[toKey] = saved;
      delete set.roundGames[fromKey];
    }
    if (set.pathHeld && set.pathHeld[fromKey]) {
      if (!set.pathHeld) set.pathHeld = {};
      if (!set.pathHeld[toKey]) set.pathHeld[toKey] = {};
      const from = set.pathHeld[fromKey];
      const into = set.pathHeld[toKey];
      Object.keys(from).forEach(function (k) {
        if (from[k]) into[k] = true;
      });
      delete set.pathHeld[fromKey];
    }
    if (set.roundGameKey === fromKey && set.roundGame && set.roundGame.done) {
      set.roundGameKey = toKey;
    }
  }

  function resetRoundProgress(set) {
    if (!set) return;
    set.tapmapKey = "";
    const key = (set.meetLock || []).join(",");
    if (set.pathHeld && key) delete set.pathHeld[key];
    if (set.roundGames && key) delete set.roundGames[key];
    set.roundGame = { done: false, game: "", at: 0 };
    set.roundGameKey = key;
    syncPathRound(set);
  }

  function expectedRoundIds(set) {
    set = set || currentSet();
    if (!set || !set.words || !set.words.length) return [];
    if (Number(set.startNumber) >= 1) {
      return window.StartSlice.sliceFrom(
        set.words,
        set.startNumber,
        sliceCount(set, set.startNumber)
      ).ids.slice();
    }
    const n = studySize(set);
    const ids = window.MeetLock.batchIds(
      set.words,
      set.intro || {},
      set.winsA || {},
      set.winsB || {},
      set.winsC || {},
      n,
      2
    );
    if (ids.length) return ids;
    return set.words.slice(0, Math.min(n, set.words.length)).map(function (w) { return w.id; });
  }

  function chooseStart(set, startNumber) {
    set = set || currentSet();
    if (!set) return null;
    const slice = window.StartSlice.sliceFrom(set.words || [], startNumber, sliceCount(set, startNumber));
    set.startNumber = slice.startNumber;
    set.meetLock = slice.ids.slice();
    set.lastPlayedAt = Date.now();
    resetRoundProgress(set);
    persist();
    return slice;
  }

  function ensureMeetLock(set) {
    set = set || currentSet();
    if (!set) return;
    if (set.startNumber) {
      if (!Array.isArray(set.meetLock) || !set.meetLock.length) {
        const slice = window.StartSlice.sliceFrom(set.words || [], set.startNumber, sliceCount(set, set.startNumber));
        set.startNumber = slice.startNumber;
        set.meetLock = slice.ids.slice();
        syncPathRound(set);
        persist();
      }
      return;
    }
    if (!Array.isArray(set.meetLock) || !set.meetLock.length) {
      set.meetLock = batchWords(set).map(function (w) { return w.id; });
      syncPathRound(set);
      persist();
    }
  }

  function batchKey(set) {
    return playWords(set).map(function (w) { return w.id; }).join(",");
  }

  function pathOpts() {
    return {
      playWords: playWords,
      introDone: function (set) {
        return introDone(set);
      },
      partDone: function (words, wins) { return Algo.partDone(words, wins); },
      bucket: function (set, step) { return Algo.bucket(winsState(set), step); },
      allRound: function (set) { return allRoundActive(set); },
    };
  }

  function introFlagsDone(set) {
    const words = playWords(set);
    if (!words.length) return false;
    const intro = (set && set.intro) || {};
    return words.every(function (w) { return !!intro[w.id]; });
  }

  function sliceReady(set, words) {
    if (!set || !words || !words.length) return false;
    const intro = set.intro || {};
    const a = set.winsA || {};
    const b = set.winsB || {};
    const c = set.winsC || {};
    if (allRoundActive(set)) {
      return words.every(function (w) {
        return (b[w.id] || 0) >= 2 && (c[w.id] || 0) >= 2;
      });
    }
    return words.every(function (w) {
      return !!intro[w.id] && (a[w.id] || 0) >= 2 && (b[w.id] || 0) >= 2 && (c[w.id] || 0) >= 2;
    });
  }

  function currentRoundReadyForGame(set) {
    if (!set) return false;
    const words = playWords(set);
    if (!words.length) return false;
    return sliceReady(set, words);
  }

  function roundReadyForGame(set) {
    if (!set) return false;
    dropStaleMeetLock(set);
    if (set.meetLock && set.meetLock.length) {
      const locked = window.MeetLock.wordsForLock(set.words || [], set.meetLock);
      if (locked.length && sliceReady(set, locked)) return true;
    }
    const words = set.words || [];
    const n = studySize(set);
    if (!n || !words.length) return false;
    for (let i = 0; i < words.length; i += n) {
      const slice = words.slice(i, i + n);
      if (slice.length && sliceReady(set, slice)) return true;
    }
    return false;
  }

  function rememberFinishedMeet(set) {
    if (!tapmapDone(set)) return;
    const key = batchKey(set);
    if (!key || set.tapmapKey === key) return;
    set.tapmapKey = key;
    persist();
  }

  function tapmapDone(set) {
    if (!set) return true;
    const key = batchKey(set);
    if (!key) return true;
    return set.tapmapKey === key;
  }

  function introDone(set) {
    if (!set || !set.intro) set.intro = {};
    const words = playWords(set);
    if (!words.length) return false; // an empty word list is never "finished"
    return tapmapDone(set) && words.every(function (w) { return !!set.intro[w.id]; });
  }

  function blankTap() {
    return {
      phase: "explore",
      words: [],
      found: {},
      queue: [],
      cur: null,
      started: 0,
      locking: false,
    };
  }

  function burst(msg) {
    const el = $("#burst");
    $("#burst-msg").textContent = "🎉 " + msg;
    el.hidden = false;
    cheerBig();
    clearTimeout(burst._t);
    burst._t = setTimeout(function () {
      el.hidden = true;
    }, 1100);
    return wait(900);
  }

  function shakeCard() {
    const card = $("#prompt-card");
    card.classList.remove("shake");
    void card.offsetWidth;
    card.classList.add("shake");
  }

  function makeSet(title, words, packId) {
    const empty = Algo.emptyWins();
    return {
      id: uid("set"),
      packId: packId || null,
      title: title,
      words: words,
      winsA: empty.winsA,
      winsB: empty.winsB,
      winsC: empty.winsC,
      createdAt: Date.now(),
      lastPlayedAt: Date.now(),
      intro: {},
      rememberForever: false,
      nextReviewAt: null,
    };
  }

  function activateSet(set) {
    state.sets[set.id] = set;
    state.currentSetId = set.id;
    set.lastPlayedAt = Date.now();
    syncPathRound(set);
    persist();
    syncPack();
  }

  function parseList(text) {
    const lines = String(text || "")
      .split(/\r?\n/)
      .map(function (l) { return l.trim(); })
      .filter(Boolean);
    const words = [];
    const seen = {};
    lines.forEach(function (line, idx) {
      if (/^word\s*[,|\t]/i.test(line)) return;
      let parts;
      if (line.indexOf("\t") >= 0) parts = line.split("\t");
      else parts = line.split(",");
      if (parts.length < 2) return;
      const en = parts[0].trim().replace(/^["']|["']$/g, "");
      const ko = parts.slice(1).join(",").trim().replace(/^["']|["']$/g, "");
      if (!en || !ko) return;
      const key = norm(en);
      if (!key || seen[key]) return;
      seen[key] = true;
      words.push({ id: "w" + (idx + 1) + "_" + key, en: en, ko: ko });
    });
    return words;
  }

  async function loadPackFile(pid) {
    try {
      const res = await fetch("packs/" + pid + ".json", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data && data.words && data.words.length) {
          return {
            id: data.id || pid,
            title: data.title || pid,
            words: data.words.map(packWord).filter(function (w) { return w.en && w.ko; }),
          };
        }
      }
    } catch (e) {}
    return null;
  }

  async function loadDemoPack() {
    return (await loadPackFile(DEMO_PACK_ID)) || DEMO_FALLBACK;
  }

  async function loadExternalPackFromSrc(src) {
    const PackSrc = window.PackSrc;
    if (!PackSrc || !PackSrc.isAllowedPackSrc(src)) return false;
    try {
      const res = await fetch(src, { cache: "no-store" });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data || !data.words || !data.words.length) return false;
      const pid = String(data.id || PackSrc.packIdFromSrc(src) || "external");
      externalPack = {
        src: src,
        folder: PackSrc.mediaFolderFromSrc(src),
        pictureExt: PackSrc.pictureExtFromSrc(src),
        sharedLetters: PackSrc.resolveSharedLettersBase(src, data) || PackSrc.defaultSharedLetters(src),
      };
      const words = data.words.map(packWord).filter(function (w) { return w.en && w.ko; });
      if (!words.length) return false;
      const existing = Object.keys(state.sets)
        .map(function (k) { return state.sets[k]; })
        .find(function (s) {
          return s && (s.externalPackSrc === src || s.packId === pid);
        });
      if (existing) {
        existing.title = data.title || pid;
        existing.words = words;
        existing.packId = pid;
        existing.externalPackSrc = src;
        activateSet(existing);
      } else {
        const set = makeSet(data.title || pid, words, pid);
        set.externalPackSrc = src;
        activateSet(set);
      }
      const lanes = document.querySelector(".index-lanes");
      if (lanes) lanes.hidden = true;
      return true;
    } catch (e) {
      return false;
    }
  }

  async function openPack(pid) {
    const pack = await loadPackFile(pid);
    if (!pack || !pack.words.length) return;
    const existing = Object.keys(state.sets)
      .map(function (k) { return state.sets[k]; })
      .find(function (s) { return s.packId === pid; });
    if (existing) {
      existing.title = pack.title;
      existing.words = pack.words;
      activateSet(existing);
      renderSetHome();
      showScreen("set");
      persist();
      return;
    }
    const set = makeSet(pack.title, pack.words, pid);
    activateSet(set);
    renderSetHome();
    showScreen("set");
  }

  async function openDemo() {
    const existing = Object.keys(state.sets)
      .map(function (k) { return state.sets[k]; })
      .find(function (s) { return s.packId === DEMO_PACK_ID; });
    if (existing) {
      const pack = await loadDemoPack();
      existing.title = pack.title;
      existing.words = pack.words;
      activateSet(existing);
      renderSetHome();
      showScreen("set");
      persist();
      return;
    }
    const pack = await loadDemoPack();
    const set = makeSet(pack.title, pack.words, DEMO_PACK_ID);
    activateSet(set);
    renderSetHome();
    showScreen("set");
  }

  let progressTooLargeWarn = false;

  function setProgressTooLargeWarn(on) {
    progressTooLargeWarn = !!on;
    paintProgressTooLargeWarn();
  }

  function paintProgressTooLargeWarn() {
    const el = $("#progress-too-large-warn");
    if (!el) return;
    el.hidden = !progressTooLargeWarn;
  }

  function renderHome() {
    paintProgressTooLargeWarn();
    const btn = $("#btn-continue");
    const set = currentSet();
    const hello = $("#hello-line");
    const signed = isSignedIn();
    const studentId = currentStudentId();
    if (hello) hello.textContent = signed ? t("hello", { name: studentId }) : "";
    const signOut = $("#btn-signout");
    if (signOut) signOut.hidden = !signed;
    let forever = 0;
    let trying = 0;
    Object.keys(state.sets).forEach(function (k) {
      const s = state.sets[k];
      if (s.srsForever) forever += (s.words || []).length;
      else if (s.srsTrying) trying += (s.words || []).length;
    });
    const sl = $("#stats-line");
    if (sl) sl.textContent = t("stats_line", { forever: forever, trying: trying });
    const due = $("#due-line");
    if (due) {
      const now = Date.now();
      const dueSet = Object.keys(state.sets).map(function (k) { return state.sets[k]; }).find(function (s) {
        return s.srsTrying && !s.srsForever && s.srsNextAt && s.srsNextAt <= now;
      });
      due.hidden = !dueSet;
      if (dueSet) due.textContent = t("due_line", { title: dueSet.title });
    }
    markIndexNext();
    if (!canPlay() || !set) {
      if (btn) btn.hidden = true;
      return;
    }
    btn.hidden = false;
    $("#continue-title").textContent = set.title;
    if (factoryCleared(set)) {
      $("#continue-meta").textContent = t("cleared_meta");
    } else {
      const mode = Algo.startMode(set.words, winsState(set));
      $("#continue-meta").textContent = t("continue_meta", { mode: I18n.partName(mode) });
    }
  }

  function markIndexNext() {
    const path = PACK_IDS;
    function setFor(pid) {
      return Object.keys(state.sets).map(function (k) { return state.sets[k]; }).find(function (s) {
        return s.packId === pid;
      });
    }
    function done(pid) {
      const s = setFor(pid);
      if (!s || !(s.words || []).length) return false;
      return factoryCleared(s);
    }
    const next = path.filter(function (pid) { return !done(pid); })[0] || path[0];
    $$(".pack-tile").forEach(function (el) {
      const pid = el.getAttribute("data-pack");
      el.classList.toggle("is-next", pid === next);
      el.classList.toggle("is-done", done(pid));
    });
  }

  function repairStaleLock(set) {
    if (!set || !Array.isArray(set.meetLock) || !set.meetLock.length) return;
    if (!set.words || !set.words.length || !window.MeetLock) return;
    const locked = window.MeetLock.wordsForLock(set.words, set.meetLock);
    if (locked.length) return;
    set.meetLock = [];
    set.startNumber = null;
    persist();
  }

  function ensurePackWords(set) {
    if (!set || (set.words && set.words.length)) return;
    if (set.externalPackSrc) {
      loadExternalPackFromSrc(set.externalPackSrc);
      return;
    }
    if (set.packId) openPack(set.packId);
  }

  function renderSetHome() {
    const set = currentSet();
    if (!set) return;
    repairStaleLock(set);
    ensurePackWords(set);
    $("#set-title").textContent = set.title;
    const ws = winsState(set);
    const pct = Algo.factoryProgress(set.words, ws);
    $("#set-pct").textContent = t("pct", { n: pct });
    renderStudySize(set);
    renderPackStanding(set);
    const held = window.PathLock ? window.PathLock.hold(set, pathOpts()) : {};
    $$("#progress-ribbon .rib").forEach(function (el) {
      const jump = el.getAttribute("data-jump");
      const locked = studentLocked(set, jump);
      el.classList.toggle("locked", locked);
      el.classList.toggle("done", !!held[jump]);
      if (jump === "A" || jump === "B" || jump === "C") {
        const wins = Algo.bucket(ws, jump);
        const round = playWords(set);
        el.classList.toggle("now", !locked && Algo.startMode(round, ws) === jump);
      } else {
        el.classList.remove("now");
      }
    });
    const chips = $("#word-chips");
    chips.innerHTML = "";
    const roundWords = playWords(set);
    roundWords.forEach(function (w) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "word-row";
      btn.setAttribute("aria-label", t("speak_word") + " " + w.en);
      btn.innerHTML = '<span class="en"></span><span class="meaning"></span><span class="ear" aria-hidden="true">🔊</span>';
      btn.querySelector(".en").textContent = w.en;
      btn.querySelector(".meaning").textContent = meaning(w);
      btn.addEventListener("click", function () {
        unlockSpeech();
        speak(w.en);
      });
      chips.appendChild(btn);
    });
    const cleared = factoryCleared(set);
    const met = introDone(set);
    const allRound = allRoundActive(set);
    const testLocked = studentLocked(set, "test");
    const sliceTestsHidden = allRound;
    ["#btn-easy", "#btn-hard"].forEach(function (sel) {
      const btn = $(sel);
      if (!btn) return;
      btn.hidden = sliceTestsHidden;
      btn.disabled = testLocked;
      btn.classList.toggle("locked", testLocked);
    });
    ["#btn-final-easy", "#btn-final-hard"].forEach(function (sel) {
      const btn = $(sel);
      if (!btn) return;
      btn.hidden = false;
      btn.disabled = false;
      btn.classList.remove("locked");
    });
    $("#btn-easy").classList.toggle("picked", !allRound && state.testKind === "easy");
    $("#btn-hard").classList.toggle("picked", !allRound && state.testKind === "hard");
    const easyMeta = $("#final-easy-meta");
    const hardMeta = $("#final-hard-meta");
    const nWords = (set.words || []).length;
    const easyLabel = $("#final-easy-label");
    const hardLabel = $("#final-hard-label");
    if (easyLabel) easyLabel.textContent = "All " + nWords + " easy";
    if (hardLabel) hardLabel.textContent = "All " + nWords + " hard";
    if (easyMeta) easyMeta.textContent = "See English · tap the meaning · every word";
    if (hardMeta) hardMeta.textContent = "See the meaning · type English · every word";
    const learnBtn = $("#btn-learn");
    if (learnBtn) {
      const learnStep = allRound ? "B" : "A";
      learnBtn.disabled = studentLocked(set, learnStep);
      learnBtn.classList.toggle("locked", studentLocked(set, learnStep));
    }
    const gamesBtn = $("#btn-games-set");
    if (gamesBtn) {
      gamesBtn.disabled = studentLocked(set, "games");
      gamesBtn.classList.toggle("locked", studentLocked(set, "games"));
    }
    $("#intro-label").textContent = met ? t("intro_again") : t("intro_go");
    if (allRound) {
      $("#learn-label").textContent = studentLocked(set, "B") ? t("continue_learn") : t("part_b");
    } else if (cleared) {
      $("#learn-label").textContent = t("relearn");
    } else {
      const mode = Algo.startMode(roundWords, ws);
      $("#learn-label").textContent = mode === "A" && Algo.factoryProgress(roundWords, ws) === 0
        ? t("start_learn")
        : t("continue_learn");
    }
    const introBtn = $("#btn-intro");
    if (introBtn) {
      introBtn.disabled = allRound || studentLocked(set, "intro");
      introBtn.classList.toggle("locked", allRound || studentLocked(set, "intro"));
    }
    syncPack();
    if (currentScreen === "set" || currentScreen === "intro" || currentScreen === "learn" ||
        currentScreen === "test" || currentScreen === "games" || currentScreen === "playgame" ||
        currentScreen === "match" || currentScreen === "listen") {
      paintSetRangeBanner(currentScreen);
    }
  }

  function renderStudySize(set) {
    const host = $("#study-size");
    if (!host) return;
    host.innerHTML = "";
    const max = set && set.words ? set.words.length : 20;
    STUDY_SIZES.forEach(function (n) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = String(n);
      btn.disabled = n > max;
      btn.classList.toggle("on", Number(state.studySize) === n);
      btn.addEventListener("click", function () {
        if (n > max) return;
        state.studySize = n;
        const live = currentSet();
        if (live) {
          const start = (Number(live.startNumber) >= 1) ? Number(live.startNumber) : lockOrigin(live);
          chooseStart(live, start);
        } else {
          persist();
        }
        renderSetHome();
      });
      host.appendChild(btn);
    });
    const note = document.createElement("p");
    note.className = "study-from";
    note.id = "study-from";
    const start = (set && Number(set.startNumber) >= 1) ? Number(set.startNumber) : lockOrigin(set);
    note.textContent = studySize() + " words from " + start;
    host.appendChild(note);
  }

  function kstStamp(ts) {
    const shifted = new Date((Number(ts) || Date.now()) + (9 * 60 * 60 * 1000));
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const day = String(shifted.getUTCDate()).padStart(2, "0");
    const month = months[shifted.getUTCMonth()];
    const hh = String(shifted.getUTCHours()).padStart(2, "0");
    const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
    return { day: day + " " + month, time: day + " " + month + " " + hh + ":" + mm };
  }

  function noteSheetSync(ok) {
    sheetSync = { ok: !!ok, at: ok ? Date.now() : 0, localOnly: false };
    paintSheetSync();
    if (ok) paintSaveWarn(false);
  }

  function noteSheetLocalOnly() {
    sheetSync = { ok: null, at: 0, localOnly: true };
    paintSheetSync();
    paintSaveWarn(false);
  }

  function paintSheetSync() {
    const el = $("#stand-sync");
    if (!el) return;
    if (sheetSync.localOnly) {
      el.textContent = "Your words are on this tablet. We will sync when the internet is back.";
      return;
    }
    if (sheetSync.ok) el.textContent = "Saved to Mr. Jay's book · " + kstStamp(sheetSync.at).time;
    else if (sheetSync.ok === false) el.textContent = "Saving to Mr. Jay's book…";
    else el.textContent = "";
  }

  function paintSaveWarn(show) {
    const el = $("#save-warn");
    if (!el) return;
    if (!show) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent =
      "Still saving to Mr. Jay's book — keep going! Your words are safe on this tablet.";
  }

  function sliceLine(set, words) {
    const ids = (set && set.meetLock) || [];
    if (!ids.length) return "";
    const locked = window.MeetLock.wordsForLock(words, ids);
    if (!locked.length) return "";
    let start = Number(set && set.startNumber);
    if (!(start >= 1)) {
      start = 1;
      const firstId = locked[0].id;
      for (let i = 0; i < words.length; i++) {
        if (words[i] && words[i].id === firstId) {
          start = i + 1;
          break;
        }
      }
    }
    const n = locked.length;
    const ens = locked.map(function (w) { return w.en; }).join(" · ");
    return "Starting at " + start + " · " + n + (n === 1 ? " word: " : " words: ") + ens;
  }

  function packStandingData(set) {
    const words = (set && set.words) || [];
    const doingIds = (set && set.meetLock && set.meetLock.length) ? set.meetLock.slice() : [];
    const doingSet = {};
    doingIds.forEach(function (id) { doingSet[id] = true; });
    const seats = words.map(function (w, i) {
      const id = w.id;
      const green = window.StartSlice.isGreen(w, set);
      const doing = !!doingSet[id];
      let seatState = "todo";
      if (green && doing) seatState = "done doing";
      else if (green) seatState = "done";
      else if (doing) seatState = "doing";
      return { n: i + 1, id: id, en: w.en, state: seatState };
    });
    const doneCount = seats.filter(function (s) { return s.state.indexOf("done") !== -1; }).length;
    const doingCount = seats.filter(function (s) { return s.state.indexOf("doing") !== -1; }).length;
    const total = words.length;
    const nextIds = [];
    const allMode = Number(state.studySize) === 0;
    const nextLimit = studySize(set);
    for (let ni = 0; ni < words.length && (allMode || nextIds.length < nextLimit); ni++) {
      if (!window.StartSlice.isGreen(words[ni], set)) nextIds.push(words[ni].id);
    }
    const nextWords = window.MeetLock.wordsForLock(words, nextIds);
    const countText = doneCount + " / " + total + (total ? " (" + Math.round((100 * doneCount) / total) + "%)" : "") + " words finished";
    let leftText = (total - doneCount) + " to go";
    if (set && set.final && set.final.pct != null) {
      leftText += " · last all-" + total + ": " + set.final.pct + "%";
    }
    const nextText = !words.length
      ? "This pack did not load. Open it again."
      : (nextWords.length
      ? ("Next " + nextWords.length + ": " + nextWords.map(function (w) { return w.en; }).join(" · "))
      : "This pack is finished. Try the All 100 test.");
    return {
      total: total,
      doneCount: doneCount,
      doingCount: doingCount,
      seats: seats,
      nextIds: nextIds,
      nextWords: nextWords,
      countText: countText,
      leftText: leftText,
      nextText: nextText,
      sliceText: sliceLine(set, words),
    };
  }

  function renderPackStanding(set) {
    set = set || currentSet();
    if (!set) return null;
    repairStaleLock(set);
    const data = packStandingData(set);
    const countEl = $("#stand-count");
    if (countEl) countEl.textContent = data.countText;
    const leftEl = $("#stand-left");
    if (leftEl) leftEl.textContent = data.leftText;
    const fill = $("#stand-fill");
    if (fill) fill.style.width = (data.total ? (100 * data.doneCount / data.total) : 0) + "%";
    const nextEl = $("#stand-next");
    if (nextEl) nextEl.textContent = data.nextText;
    const sliceEl = $("#stand-slice");
    if (sliceEl) sliceEl.textContent = data.sliceText || "";
    const host = $("#stand-seats");
    if (host) {
      host.innerHTML = "";
      data.seats.forEach(function (seat) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "seat " + seat.state;
        btn.textContent = String(seat.n);
        btn.title = seat.en || "";
        btn.setAttribute("aria-label", "Start at word " + seat.n + ", " + (seat.en || ""));
        btn.addEventListener("click", function () {
          chooseStart(set, seat.n);
          const w = ((set.words) || []).filter(function (word) { return word.id === seat.id; })[0];
          if (w) {
            unlockSpeech();
            speak(w.en);
          }
          if (currentSet() === set) renderSetHome();
          else renderPackStanding(set);
        });
        host.appendChild(btn);
      });
    }
    renderAllTile();
    paintSheetSync();
    return data;
  }

  function renderAllTile() {
    const slot = $("#seat-all-slot");
    if (!slot) return;
    const set = currentSet();
    slot.innerHTML = "";
    const all = document.createElement("button");
    all.type = "button";
    all.className = "seat seat-all";
    all.textContent = "All";
    all.title = "Study every word in the pack";
    all.setAttribute("aria-label", "All words");
    all.classList.toggle("on", Number(state.studySize) === 0);
    all.addEventListener("click", function () {
      if (!canPlay()) return;
      if (!set) return;
      state.studySize = 0;
      chooseStart(set, 1);
      renderSetHome();
    });
    slot.appendChild(all);
  }

  function markRoundGameDone(kind) {
    const set = currentSet();
    if (!set || !window.PathLock) return;
    window.PathLock.markGameDone(set, kind);
    persist();
    if (currentSet() === set) renderSetHome();
  }

  let introCurId = null;
  let meetPool = [];
  let meetBuilt = [];
  let introTyped = "";

  function wordPic(w) {
    const id = mediaFile(w);
    return packBase() + "/" + id + "." + ((externalPack && externalPack.pictureExt) || "jpg");
  }

  function scramble(en) {
    const chars = String(en || "").replace(/[^a-zA-Z]/g, "").toUpperCase().split("");
    let pool = chars.map(function (ch, i) { return { id: i, ch: ch }; });
    for (let n = 0; n < 12; n++) {
      pool = shuffle(pool);
      if (pool.map(function (x) { return x.ch; }).join("") !== chars.join("")) break;
    }
    return pool;
  }

  function startMeet() {
    startTapmap();
  }

  function ensureRoundLock(set) {
    if (!set) return;
    if (!set.intro) set.intro = {};
    dropStaleMeetLock(set);
    if (Number(set.startNumber) >= 1) {
      const expected = expectedRoundIds(set);
      const cur = (set.meetLock || []).join(",");
      const exp = expected.join(",");
      if (exp && cur !== exp) {
        const slice = window.StartSlice.sliceFrom(set.words || [], set.startNumber, sliceCount(set, set.startNumber));
        set.startNumber = slice.startNumber;
        const oldKey = cur;
        set.meetLock = expected.slice();
        migrateRoundProgress(set, oldKey, exp);
        syncPathRound(set);
        persist();
        return;
      }
      if (!Array.isArray(set.meetLock) || !set.meetLock.length) {
        const slice = window.StartSlice.sliceFrom(set.words || [], set.startNumber, sliceCount(set, set.startNumber));
        set.startNumber = slice.startNumber;
        set.meetLock = slice.ids.slice();
        syncPathRound(set);
        persist();
      }
      return;
    }
    if (Array.isArray(set.meetLock) && set.meetLock.length) {
      const locked = window.MeetLock.wordsForLock(set.words || [], set.meetLock);
      if (locked.length && sliceReady(set, locked)) return;
      if (meetLockHeld(set)) return;
    }
    if (!meetLockHeld(set)) {
      const oldKey = (set.meetLock || []).join(",");
      set.meetLock = batchWords(set).map(function (w) { return w.id; });
      migrateRoundProgress(set, oldKey, set.meetLock.join(","));
      syncPathRound(set);
      persist();
    }
  }

  function startTapmap() {
    const set = currentSet();
    if (!set) return;
    repairStaleLock(set);
    if (!set.words || !set.words.length) {
      ensurePackWords(set);
      renderSetHome();
      showScreen("set");
      return;
    }
    ensureRoundLock(set);
    if (allRoundActive(set)) {
      startLearnAt("B");
      return;
    }
    if (tapmapDone(set)) {
      const roundWords = playWords(set);
      const mode = Algo.startMode(roundWords, winsState(set)) || "A";
      learn = blankLearn();
      showScreen("learn");
      beginPart(mode);
      return;
    }
    const words = playWords(set);
    if (!words.length) {
      ensurePackWords(set);
      renderSetHome();
      showScreen("set");
      return;
    }
    tap = blankTap();
    tap.words = words.slice();
    tap.phase = "explore";
    tap.started = Date.now();
    const card = $("#meet-card");
    const map = $("#tapmap");
    if (card) card.hidden = true;
    if (map) map.hidden = false;
    renderTapmap();
    showScreen("intro");
  }

  function tapPhaseIndex() {
    if (tap.phase === "listen") return 2;
    if (tap.phase === "read") return 3;
    return 1;
  }

  function tapFoundCount() {
    if (tap.phase === "explore") return Object.keys(tap.found).length;
    return tap.words.length - tap.queue.length - (tap.cur ? 1 : 0);
  }

  function renderTapmap() {
    const map = $("#tapmap");
    if (map) map.hidden = false;
    const card = $("#meet-card");
    if (card) card.hidden = true;
    const n = tap.words.length;
    $("#tap-round-n").textContent = String(tapPhaseIndex());
    $("#tap-round-name").textContent = t("tap_" + tap.phase);
    $("#tap-hint").textContent = t("tap_hint_" + tap.phase);
    const found = tap.phase === "explore"
      ? Object.keys(tap.found).length
      : Math.max(0, n - tap.queue.length - (tap.cur ? 1 : 0));
    $("#tap-prog").textContent = t("tap_prog", { found: found, total: n });
    const speakBtn = $("#btn-tap-speak");
    const wordEl = $("#tap-word");
    if (tap.phase === "explore") {
      speakBtn.hidden = true;
      wordEl.hidden = true;
    } else if (tap.phase === "listen") {
      speakBtn.hidden = false;
      wordEl.hidden = true;
    } else {
      speakBtn.hidden = true;
      wordEl.hidden = false;
      wordEl.textContent = tap.cur ? tap.cur.en : "";
    }
    const grid = $("#tap-grid");
    grid.setAttribute("data-n", String(n <= 5 ? 5 : n <= 10 ? 10 : n <= 15 ? 15 : 20));
    grid.innerHTML = "";
    tap.words.forEach(function (w) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tap-tile";
      btn.setAttribute("data-id", w.id);
      if (tap.phase === "explore" && tap.found[w.id]) btn.classList.add("found");
      if (tap.cur && tap.cur.id === w.id && tap.phase !== "explore") {
        /* don't highlight target */
      }
      const img = document.createElement("img");
      img.src = wordPic(w);
      img.alt = tap.phase === "explore" && tap.found[w.id] ? w.en : "";
      img.draggable = false;
      btn.appendChild(img);
      if (tap.phase === "explore" && tap.found[w.id]) {
        const lab = document.createElement("span");
        lab.className = "lab";
        lab.textContent = w.en;
        btn.appendChild(lab);
      }
      btn.addEventListener("click", function () { onTapTile(w, btn); });
      grid.appendChild(btn);
    });
    showScreen("intro");
  }

  function pulseTile(el, cls) {
    if (!el) return;
    el.classList.remove("on", "wrong", "shake");
    void el.offsetWidth;
    el.classList.add(cls);
    if (cls === "wrong") el.classList.add("shake");
    setTimeout(function () {
      el.classList.remove("on", "wrong", "shake");
    }, 450);
  }

  function tileEl(id) {
    return $("#tap-grid [data-id=\"" + id + "\"]") || null;
  }

  function onTapTile(w, el) {
    if (tap.locking) return;
    unlockSpeech();
    if (tap.phase === "explore") {
      tap.found[w.id] = true;
      const spoken = speak(w.en);
      pulseTile(el, "on");
      logEvent({
        activity_id: "tapmap_explore",
        item_id: w.id,
        skill_tags: ["vocab", "tapmap", "explore"],
        mode: "explore",
        response: w.en,
        correct: true,
        latency_ms: Date.now() - (tap.started || Date.now()),
        started_at: tap.started,
      });
      renderTapmap();
      if (Object.keys(tap.found).length >= tap.words.length) {
        tap.locking = true;
        Promise.resolve(spoken).then(function () {
          return wait(400);
        }).then(function () { beginTapQuiz("listen"); });
      }
      return;
    }
    const want = tap.cur;
    if (!want) return;
    const ok = w.id === want.id;
    pulseTile(el, ok ? "on" : "wrong");
    logEvent({
      activity_id: tap.phase === "listen" ? "tapmap_listen" : "tapmap_read",
      item_id: want.id,
      skill_tags: ["vocab", "tapmap", tap.phase],
      mode: tap.phase,
      response: w.en,
      correct: ok,
      latency_ms: Date.now() - (tap.started || Date.now()),
      started_at: tap.started,
      errors: ok ? 0 : 1,
    });
    if (!ok) {
      flashMark(false);
      if (tap.phase === "listen") speak(want.en);
      return;
    }
    dingOk();
    flashMark(true).then(function () { advanceTapQuiz(); });
  }

  function beginTapQuiz(phase) {
    tap.phase = phase;
    tap.found = {};
    tap.queue = shuffle(tap.words.slice());
    tap.cur = tap.queue.shift() || null;
    tap.started = Date.now();
    tap.locking = false;
    renderTapmap();
    if (phase === "listen" && tap.cur) speak(tap.cur.en);
  }

  function advanceTapQuiz() {
    if (tap.queue.length) {
      tap.cur = tap.queue.shift();
      tap.started = Date.now();
      tap.locking = false;
      renderTapmap();
      if (tap.phase === "listen" && tap.cur) speak(tap.cur.en);
      return;
    }
    if (tap.phase === "listen") {
      beginTapQuiz("read");
      return;
    }
    finishTapmap();
  }

  function finishTapmap() {
    const set = currentSet();
    if (!set) return;
    set.tapmapKey = batchKey(set);
    if (!set.intro) set.intro = {};
    tap.words.forEach(function (w) { set.intro[w.id] = true; });
    persist();
    burst(t("tap_done"));
    tap.locking = true;
    wait(700).then(function () {
      learn = blankLearn();
      showScreen("learn");
      beginPart("A");
    });
  }

  function skipTapTarget() {
    if (tap.phase === "explore") {
      const miss = tap.words.find(function (w) { return !tap.found[w.id]; });
      if (miss) onTapTile(miss, tileEl(miss.id));
      return;
    }
    if (tap.cur) advanceTapQuiz();
  }

  function skipTapmap() {
    const set = currentSet();
    if (!set) return;
    set.tapmapKey = batchKey(set);
    if (!set.intro) set.intro = {};
    playWords(set).forEach(function (w) { set.intro[w.id] = true; });
    persist();
    learn = blankLearn();
    showScreen("learn");
    beginPart("A");
  }

  function currentMeetWord() {
    const set = currentSet();
    if (!set) return null;
    return set.words.find(function (w) { return w.id === introCurId; }) || null;
  }

  function renderMeet() {
    const w = currentMeetWord();
    if (!w) return;
    const pic = $("#meet-pic");
    pic.src = wordPic(w);
    pic.alt = w.en;
    $("#meet-en").textContent = w.en;
    $("#meet-ko").textContent = meaning(w);
    fillWW(w);
    const built = $("#meet-built");
    const pool = $("#meet-pool");
    built.innerHTML = "";
    pool.innerHTML = "";
    meetBuilt.forEach(function (tile, idx) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tile";
      b.textContent = tile.ch;
      b.addEventListener("click", function () {
        meetBuilt.splice(idx, 1);
        meetPool.push(tile);
        renderMeet();
      });
      built.appendChild(b);
    });
    meetPool.forEach(function (tile, idx) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tile";
      b.textContent = tile.ch;
      b.addEventListener("click", function () {
        meetPool.splice(idx, 1);
        meetBuilt.push(tile);
        const got = meetBuilt.map(function (x) { return x.ch; }).join("");
        const want = String(w.en).replace(/[^a-zA-Z]/g, "").toUpperCase();
        if (got.length === want.length) {
          const ok = got === want;
          flashMark(ok).then(function () {
            if (ok) {
              dingOk();
              const set = currentSet();
              set.intro[w.id] = true;
              persist();
              const nxt = playWords(set).find(function (x) { return !set.intro[x.id]; });
              if (nxt) {
                introCurId = nxt.id;
                meetBuilt = [];
                meetPool = scramble(nxt.en);
                renderMeet();
                speak(nxt.en);
              } else {
                startLearnAt("A");
              }
            }
          });
        }
        renderMeet();
      });
      pool.appendChild(b);
    });
    showScreen("intro");
  }

  function startLearnAt(mode) {
    const set = currentSet();
    if (!set) return;
    if (allRoundActive(set) && mode === "A") mode = "B";
    if (!allRoundActive(set) && !tapmapDone(set)) return startTapmap();
    learn = blankLearn();
    showScreen("learn");
    beginPart(mode);
  }

  function jumpTo(step) {
    const go = function () {
      if (step === "intro") return startMeet();
      if (step === "A" || step === "B" || step === "C") return startLearnAt(step);
      if (step === "test") return showTestPick();
      if (step === "games") return goGames();
    };
    if (!currentSet()) {
      openDemo().then(go);
      return;
    }
    go();
  }

  function skipMeetWord() {
    if (currentScreen === "intro" && $("#tapmap") && !$("#tapmap").hidden) {
      return skipTapTarget();
    }
    const set = currentSet();
    const w = currentMeetWord();
    if (!set || !w) return;
    set.intro[w.id] = true;
    persist();
    const nxt = playWords(set).find(function (x) { return !set.intro[x.id]; });
    if (nxt) {
      introCurId = nxt.id;
      meetBuilt = [];
      meetPool = scramble(nxt.en);
      renderMeet();
    } else startLearnAt("A");
  }

  function skipStep() {
    if (currentScreen === "intro") return skipTapmap();
    if (currentScreen === "learn") {
      if (learn.mode === "A") return startLearnAt("B");
      if (learn.mode === "B") return startLearnAt("C");
      renderSetHome();
      showScreen("set");
      return;
    }
    goGames();
  }

  function distractors(correct, n) {
    const set = currentSet();
    const pool = (quiz && quiz.wide) ? ((set && set.words) || []) : playWords(set);
    const others = shuffle(pool.filter(function (w) { return w.id !== correct.id; }));
    const pick = others.slice(0, Math.max(0, n - 1));
    return shuffle([correct].concat(pick));
  }

  function fillChoices(host, items, kind, onPick) {
    host.innerHTML = "";
    host.hidden = false;
    items.forEach(function (w) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "choice" + (kind === "en" ? " en" : "");
      b.textContent = kind === "en" ? w.en : meaning(w);
      b.addEventListener("click", function () { onPick(w, b); });
      host.appendChild(b);
    });
  }

  function buildPad(host) {
    host.innerHTML = "";
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(function (ch) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "az-key";
      b.textContent = ch;
      b.addEventListener("click", function () { onAz(ch); });
      host.appendChild(b);
    });
  }

  function onAz(ch) {
    if (currentScreen === "intro") {
      const set = currentSet();
      if (!introCurId && set && playWords(set)[0]) introCurId = playWords(set)[0].id;
      if (!set || !introCurId || set.intro[introCurId]) return;
      introTyped += ch;
      renderIntro();
      return;
    }
    if (currentScreen === "learn") {
      if (learn.locking || learn.mode === "A") return;
      learn.typed += ch;
      $("#typed-text").textContent = learn.typed;
    } else if (currentScreen === "test") {
      if (quiz.locking || quiz.kind !== "hard") return;
      quiz.typed += ch;
      $("#test-typed-text").textContent = quiz.typed;
    }
  }

  function delAz() {
    if (currentScreen === "intro") {
      introTyped = introTyped.slice(0, -1);
      renderIntro();
      return;
    }
    if (currentScreen === "learn") {
      if (learn.locking) return;
      learn.typed = learn.typed.slice(0, -1);
      $("#typed-text").textContent = learn.typed;
    } else if (currentScreen === "test") {
      if (quiz.locking) return;
      quiz.typed = quiz.typed.slice(0, -1);
      $("#test-typed-text").textContent = quiz.typed;
    }
  }

  function isHardwareKeyboardDesk() {
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
      !window.matchMedia("(pointer: coarse)").matches;
  }

  function updateKbDeskClass() {
    document.body.classList.toggle("kb-desk", isHardwareKeyboardDesk());
  }

  function bindKbDeskMedia() {
    updateKbDeskClass();
    function onMqChange() { updateKbDeskClass(); }
    const mqFine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const mqCoarse = window.matchMedia("(pointer: coarse)");
    if (mqFine.addEventListener) {
      mqFine.addEventListener("change", onMqChange);
      mqCoarse.addEventListener("change", onMqChange);
    } else if (mqFine.addListener) {
      mqFine.addListener(onMqChange);
      mqCoarse.addListener(onMqChange);
    }
  }

  function isTypingScreenActive() {
    if (currentScreen === "learn" && learn && (learn.mode === "B" || learn.mode === "C")) return true;
    if (currentScreen === "test" && quiz && quiz.kind === "hard") return true;
    return false;
  }

  function azLetterFromCode(code) {
    if (!code || code.length !== 4 || code.slice(0, 3) !== "Key") return null;
    const ch = code.charAt(3);
    if (ch >= "A" && ch <= "Z") return ch;
    return null;
  }

  function keydownInFormField() {
    const ae = document.activeElement;
    if (!ae) return false;
    const tag = ae.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  function startLearn(reset) {
    const set = currentSet();
    if (!set) return;
    if (!teacherNow() && !introDone(set)) {
      startTapmap();
      return;
    }
    ensureMeetLock(set);
    if (reset || factoryCleared(set)) {
      const empty = Algo.emptyWins();
      set.winsA = empty.winsA;
      set.winsB = empty.winsB;
      set.winsC = empty.winsC;
      persist();
    }
    const mode = Algo.startMode(playWords(set), winsState(set));
    if (!mode) {
      renderSetHome();
      showScreen("set");
      return;
    }
    learn = blankLearn();
    showScreen("learn");
    const testerBar = $("#tester-bar");
    if (testerBar) testerBar.hidden = !teacherNow();
    beginPart(mode);
  }

  function beginPart(mode) {
    const set = currentSet();
    ensureMeetLock(set);
    const words = playWords(set);
    const wins = Algo.bucket(winsState(set), mode);
    learn.mode = mode;
    learn.queue = Algo.makeQueue(words, wins);
    const nxt = Algo.nextWord(learn.queue, words, wins);
    learn.queue = nxt.queue;
    learn.cur = nxt.cur || words[0];
    learn.typed = "";
    learn.missTeach = false;
    learn.locking = false;
    // A part change must always start clean. Stale copy-back state would
    // consume the next check and skip a part, so the path never reaches Write.
    learn.mustCopy = false;
    learn.pendingNxt = null;
    renderLearn(true);
  }

  function renderLearn(doSpeak) {
    updateKbDeskClass();
    const set = currentSet();
    if (!set) return;
    if (!learn.cur) {
      // Never show an empty Dictation/Write screen. If the current word is
      // missing, rebuild it from the part queue before drawing.
      const words = playWords(set);
      if (!words.length) return;
      const wins = Algo.bucket(winsState(set), learn.mode);
      const nxt = Algo.nextWord(learn.queue || [], words, wins);
      learn.queue = nxt.queue || [];
      learn.cur = nxt.cur || words[0];
      if (!learn.cur) return;
    }
    const ws = winsState(set);
    const wins = Algo.bucket(ws, learn.mode);
    const metaName = I18n.partName(learn.mode);
    const words = playWords(set);
    const rem = Algo.remaining(words, wins).length;
    const streak = wins[learn.cur.id] || 0;
    const pct = Algo.factoryProgress(words, ws);

    document.body.setAttribute("data-factory-mode", learn.mode);
    $("#mode-letter").textContent = learn.mode;
    $("#mode-ko").textContent = metaName;
    $("#mode-hint").textContent = I18n.partHint(learn.mode);
    $("#prog-text").textContent = t("prog", { pct: pct, left: rem, streak: streak });

    const en = $("#prompt-en");
    const ko = $("#prompt-ko");
    const typed = $("#typed-line");
    const choices = $("#choices");
    const az = $("#az-wrap");
    const rail = $("#letter-rail");
    const cap = $("#caption-fallback");
    rail.hidden = true;
    if (cap) cap.hidden = true;
    $("#typed-text").textContent = learn.typed;
    const card = $("#prompt-card");
    if (card) {
      card.setAttribute("data-en", learn.cur.en);
      card.setAttribute("data-ko", meaning(learn.cur));
    }

    if (learn.mode === "A") {
      en.hidden = false;
      en.textContent = learn.cur.en;
      ko.hidden = true;
      typed.hidden = true;
      az.hidden = true;
      fillChoices(choices, distractors(learn.cur, 4), "ko", onLearnChoice);
      if (doSpeak) speak(learn.cur.en);
      if (!hasSpeech() && cap) {
        cap.hidden = false;
        cap.textContent = learn.cur.en;
      }
    } else if (learn.mode === "B") {
      en.hidden = true;
      en.textContent = "";
      ko.hidden = true;
      typed.hidden = false;
      az.hidden = false;
      choices.hidden = true;
      choices.innerHTML = "";
      if (rail) {
        rail.hidden = true;
        rail.innerHTML = "";
      }
      if (cap) {
        cap.hidden = true;
        cap.textContent = "";
      }
      if (doSpeak) speak(learn.cur.en);
    } else {
      en.hidden = true;
      ko.hidden = false;
      ko.textContent = meaning(learn.cur);
      typed.hidden = false;
      az.hidden = false;
      choices.hidden = true;
      choices.innerHTML = "";
    }
    learn.startedAt = Date.now();
  }

  function onLearnChoice(word, btn) {
    if (learn.locking || learn.mode !== "A") return;
    const ok = word.id === learn.cur.id;
    $$("#choices .choice").forEach(function (el) { el.disabled = true; });
    btn.classList.add(ok ? "good" : "bad");
    if (!ok) {
      $$("#choices .choice").forEach(function (el) {
        if (el.textContent === meaning(learn.cur)) el.classList.add("good");
      });
    }
    gradeLearn(ok, meaning(word));
  }

  function onLearnCheck() {
    if (learn.locking || learn.mode === "A") return;
    if (!learn.typed) return;
    if (learn.mustCopy) {
      // Copy-back only applies in Write (C). A stale flag anywhere else must
      // be cleared instead of swallowing the check.
      if (learn.mode !== "C" || !learn.pendingNxt) {
        learn.mustCopy = false;
        learn.pendingNxt = null;
      } else {
        if (norm(learn.typed) !== norm(learn.cur.en)) {
          shakeCard();
          return;
        }
        learn.mustCopy = false;
        const nxt = learn.pendingNxt;
        learn.pendingNxt = null;
        learn.typed = "";
        advanceLearn(nxt, false, false);
        return;
      }
    }
    const ok = norm(learn.typed) === norm(learn.cur.en);
    gradeLearn(ok, learn.typed);
  }

  async function gradeLearn(ok, response) {
    if (learn.locking) return;
    learn.locking = true;
    try {
      await gradeLearnInner(ok, response);
    } finally {
      // A thrown audio or vision error must never freeze the student on a step.
      learn.locking = false;
    }
  }

  async function gradeLearnInner(ok, response) {
    const set = currentSet();
    const ws = winsState(set);
    const wins = Algo.bucket(ws, learn.mode);
    const before = wins[learn.cur.id] || 0;
    const latency = Date.now() - learn.startedAt;
    const activity =
      learn.mode === "A" ? "learn_a" : learn.mode === "B" ? "learn_b" : "learn_c";
    const startedAt = learn.startedAt;
    const cur = learn.cur;

    if (learn.mode === "B" && !ok) {
      wins[cur.id] = 0;
      persist();
      logEvent({
        activity_id: activity,
        item_id: cur.id,
        mode: learn.mode,
        response: response,
        correct: false,
        latency_ms: latency,
        wins_toward_2: 0,
        points: 0,
        errors: 1,
        started_at: startedAt,
      });
      shakeCard();
      await teachSpelling(cur.en);
      learn.typed = "";
      $("#typed-text").textContent = "";
      learn.locking = false;
      learn.startedAt = Date.now();
      return;
    }

    if (learn.mode === "C" && !ok) {
      const nxt = Algo.applyGrade(learn.queue, playWords(set), wins, cur, false);
      persist();
      logEvent({
        activity_id: activity,
        item_id: cur.id,
        mode: learn.mode,
        response: response,
        correct: false,
        latency_ms: latency,
        wins_toward_2: wins[cur.id] || 0,
        points: 0,
        errors: 1,
        started_at: startedAt,
      });
      shakeCard();
      await replayEnglish(cur.en, 3);
      learn.mustCopy = true;
      learn.pendingNxt = nxt;
      learn.typed = "";
      $("#typed-text").textContent = "";
      const en = $("#prompt-en");
      en.hidden = false;
      en.textContent = cur.en;
      learn.locking = false;
      return;
    }

    const hitTwo = ok && before + 1 >= Algo.NEED;
    const nxt = Algo.applyGrade(learn.queue, playWords(set), wins, cur, ok);
    persist();
    logEvent({
      activity_id: activity,
      item_id: cur.id,
      mode: learn.mode,
      response: response,
      correct: ok,
      latency_ms: latency,
      wins_toward_2: wins[cur.id] || 0,
      points: ok ? 1 : 0,
      errors: ok ? 0 : 1,
      started_at: startedAt,
    });
    if (ok) dingOk();
    await advanceLearn(nxt, hitTwo, ok);
  }

  async function advanceLearn(nxt, hitTwo, ok) {
    window.SpellStop.bump();
    const set = currentSet();
    if (!nxt || typeof nxt !== "object") {
      // Never leave the student stranded on a step. Rebuild from the wins
      // already saved, so the path always moves forward.
      const words = playWords(set);
      const wins = Algo.bucket(winsState(set), learn.mode);
      nxt = Algo.nextWord([], words, wins);
      hitTwo = false;
      ok = false;
    }
    const meta = Algo.MODE_META[learn.mode];
    if (nxt.partDone) {
      await burst(hitTwo ? t("two_clean") + " · " + t("part_done", { mode: I18n.partName(learn.mode) }) : t("part_done", { mode: I18n.partName(learn.mode) }));
      if (learn.mode === "A") {
        beginPart("B");
        return;
      }
      if (learn.mode === "B") {
        beginPart("C");
        return;
      }
      if (learn.mode === "C") {
        goGames();
        return;
      }
      return;
    }
    if (hitTwo) await burst(t("two_clean"));
    else await wait(ok ? 380 : 520);
    learn.queue = nxt.queue;
    learn.cur = nxt.cur;
    learn.typed = "";
    learn.locking = false;
    learn.missTeach = false;
    renderLearn(true);
  }

  async function teachSpelling(word) {
    learn.missTeach = true;
    const typed = String(learn.typed || "").toUpperCase();
    const want = String(word).replace(/[^a-zA-Z]/g, "").toUpperCase();
    const en = $("#prompt-en");
    en.hidden = false;
    en.textContent = word;
    const rail = $("#letter-rail");
    rail.hidden = false;
    rail.innerHTML = "";
    want.split("").forEach(function (ch, i) {
      const s = document.createElement("span");
      s.textContent = ch;
      if (typed[i] !== ch) s.classList.add("bad");
      rail.appendChild(s);
    });
    speak(word);
    const spellToken = window.SpellStop.token();
    function spellAborted() {
      if (!window.SpellStop.stale(spellToken)) return false;
      const box = $("#letter-rail");
      if (box) {
        box.hidden = true;
        box.innerHTML = "";
      }
      return true;
    }
    await waitAudioEnd(currentAudio, spellToken);
    if (spellAborted()) return;
    const spans = $$("#letter-rail span");
    for (let i = 0; i < spans.length; i++) {
      if (spellAborted()) return;
      spans[i].classList.add("on");
      await speakLetter(spans[i].textContent, spellToken);
      if (spellAborted()) return;
    }
    await wait(250);
    if (spellAborted()) return;
  }

  async function replayEnglish(word, times) {
    const en = $("#prompt-en");
    en.hidden = false;
    en.textContent = word;
    for (let i = 0; i < times; i++) {
      speak(word);
      await wait(1100);
    }
  }

  function skipWord() {
    if (currentScreen === "intro") return skipMeetWord();
    if (!learn.cur) return;
    const set = currentSet();
    const wins = Algo.bucket(winsState(set), learn.mode);
    Algo.testerSkipWord(wins, learn.cur);
    const nxt = Algo.nextWord(learn.queue, playWords(set), wins);
    persist();
    learn.locking = true;
    advanceLearn(nxt, false, true);
  }

  function skipPart() {
    if (!teacherNow()) return;
    const set = currentSet();
    const wins = Algo.bucket(winsState(set), learn.mode);
    Algo.testerSkipPart(playWords(set), wins);
    persist();
    learn.locking = true;
    advanceLearn({ queue: [], cur: null, partDone: true }, false, true);
  }

  function showTestPick() {
    showScreen("test");
    const pick = $("#test-pick");
    const play = $("#test-play");
    if (pick) pick.hidden = false;
    if (play) play.hidden = true;
    $("#test-score").hidden = true;
    if (I18n) I18n.applyDom(document);
  }

  function startEasy(wide) {
    const set = currentSet();
    if (!set) return;
    wide = !!wide;
    ensureMeetLock(set);
    quiz = blankQuiz();
    quiz.kind = wide ? "final" : "easy";
    quiz.wide = wide;
    quiz.items = shuffle((wide ? (set.words || []) : playWords(set)).slice());
    quiz.index = 0;
    quiz.score = 0;
    quiz.mistakes = [];
    if (!wide) state.finalTest = false;
    const pick = $("#test-pick");
    const play = $("#test-play");
    if (pick) pick.hidden = true;
    if (play) play.hidden = false;
    showScreen("test");
    $("#test-score").hidden = true;
    renderQuiz();
  }

  function startHard(wide) {
    const set = currentSet();
    if (!set) return;
    wide = !!wide;
    ensureMeetLock(set);
    quiz = blankQuiz();
    quiz.kind = "hard";
    quiz.wide = wide;
    quiz.items = shuffle((wide ? (set.words || []) : playWords(set)).slice());
    quiz.index = 0;
    quiz.score = 0;
    quiz.typed = "";
    quiz.mistakes = [];
    if (!wide) state.finalTest = false;
    const pick = $("#test-pick");
    const play = $("#test-play");
    if (pick) pick.hidden = true;
    if (play) play.hidden = false;
    showScreen("test");
    $("#test-score").hidden = true;
    renderQuiz();
  }

  function renderQuiz() {
    updateKbDeskClass();
    const item = quiz.items[quiz.index];
    if (!item) return finishQuiz();
    const choiceRound = quiz.kind === "easy" || quiz.kind === "final";
    const allPack = !!quiz.wide;
    $("#test-kind").textContent = allPack ? "ALL" : (quiz.kind === "easy" ? "EASY" : "HARD");
    $("#test-ko").textContent = allPack
      ? ("All " + quiz.items.length + " test")
      : (quiz.kind === "easy" ? t("easy_name") : t("hard_name"));
    $("#test-prog").textContent = quiz.index + 1 + " / " + quiz.items.length;
    $("#test-score").hidden = true;
    const en = $("#test-en-word");
    const ko = $("#test-ko-word");
    const typed = $("#test-typed");
    const choices = $("#test-choices");
    const az = $("#test-az-wrap");
    quiz.startedAt = Date.now();
    quiz.locking = false;
    if (choiceRound) {
      en.hidden = false;
      en.textContent = item.en;
      ko.hidden = true;
      typed.hidden = true;
      az.hidden = true;
      $("#btn-test-speak").hidden = false;
      fillChoices(choices, distractors(item, 4), "ko", onEasyPick);
      speak(item.en);
    } else {
      en.hidden = true;
      ko.hidden = false;
      ko.textContent = meaning(item);
      typed.hidden = false;
      quiz.typed = "";
      $("#test-typed-text").textContent = "";
      az.hidden = false;
      choices.hidden = true;
      choices.innerHTML = "";
      $("#btn-test-speak").hidden = true;
    }
  }

  function onEasyPick(word, btn) {
    if (quiz.locking) return;
    quiz.locking = true;
    const item = quiz.items[quiz.index];
    const ok = word.id === item.id;
    btn.classList.add(ok ? "good" : "bad");
    if (ok) {
      quiz.score += 1;
      dingOk();
    } else {
      quiz.mistakes = quiz.mistakes || [];
      quiz.mistakes.push({ id: item.id, en: item.en, ko: item.ko });
    }
    logEvent({
      activity_id: quiz.kind === "final" ? "final_test" : "easy_test",
      item_id: item.id,
      mode: quiz.kind === "final" ? "final" : "easy",
      response: word.ko,
      correct: ok,
      latency_ms: Date.now() - quiz.startedAt,
      wins_toward_2: 0,
      points: ok ? 1 : 0,
      errors: ok ? 0 : 1,
      started_at: quiz.startedAt,
    });
    setTimeout(function () {
      quiz.index += 1;
      renderQuiz();
    }, 450);
  }

  function onHardCheck() {
    if (quiz.locking || quiz.kind !== "hard") return;
    if (!quiz.typed) return;
    quiz.locking = true;
    const item = quiz.items[quiz.index];
    const ok = norm(quiz.typed) === norm(item.en);
    if (ok) quiz.score += 1;
    else {
      quiz.mistakes = quiz.mistakes || [];
      quiz.mistakes.push({ id: item.id, en: item.en, ko: item.ko });
    }
    logEvent({
      activity_id: "hard_test",
      item_id: item.id,
      mode: "hard",
      response: quiz.typed,
      correct: ok,
      latency_ms: Date.now() - quiz.startedAt,
      wins_toward_2: 0,
      points: ok ? 1 : 0,
      errors: ok ? 0 : 1,
      started_at: quiz.startedAt,
    });
    if (ok) dingOk();
    setTimeout(function () {
      quiz.index += 1;
      renderQuiz();
    }, ok ? 400 : 900);
  }

  function finishWideQuiz() {
    $("#test-choices").hidden = true;
    $("#test-az-wrap").hidden = true;
    $("#test-score").hidden = false;
    const total = quiz.items.length || 1;
    const pct = Math.round((100 * quiz.score) / total);
    const passed = pct >= PASS_PCT;
    const misses = quiz.mistakes || [];
    $("#test-score-title").textContent = pct + "%";
    $("#test-score-line").textContent = quiz.score + " / " + total + " right  ·  " + (passed
      ? "Passed ✅ Pack finished."
      : "Needs work — keep learning the words in red.");
    const box = $("#forever-box");
    if (box) box.hidden = true;
    const list = $("#test-misses");
    if (list) {
      list.innerHTML = "";
      misses.forEach(function (m) {
        const li = document.createElement("li");
        li.className = "miss-word";
        li.textContent = m.en;
        list.appendChild(li);
      });
      list.hidden = !misses.length;
    }
    const set = currentSet();
    if (set) {
      const missIds = [];
      misses.forEach(function (m) {
        if (m && m.id != null) missIds.push(m.id);
      });
      set.final = {
        score: quiz.score,
        total: total,
        pct: pct,
        passed: !!passed,
        at: Date.now(),
      };
      set.finalMiss = missIds;
      stampCheck(set, quiz.score, quiz.items.length);
      appendScoreRow({
        at: set.final.at,
        pack: set.packId,
        kind: "final",
        activity: "All-pack test",
        score: quiz.score,
        total: total,
        words: (quiz.items || []).map(function (it) {
          return { id: it.id, en: it.en };
        }),
      });
      logActivityResult({
        packId: set.packId,
        packTitle: set.title || "",
        kind: "final",
        score: quiz.score,
        total: total,
        meta: { misses: missIds, passed: !!passed },
      });
      persist();
    }
  }

  function finishQuiz() {
    if (quiz && quiz.wide) {
      finishWideQuiz();
      return;
    }
    const missesEl = $("#test-misses");
    if (missesEl) {
      missesEl.hidden = true;
      missesEl.innerHTML = "";
    }
    $("#test-choices").hidden = true;
    $("#test-az-wrap").hidden = true;
    $("#test-score").hidden = false;
    const total = quiz.items.length || 1;
    const pct = Math.round((100 * quiz.score) / total);
    const misses = quiz.mistakes || [];
    stampCheck(currentSet(), quiz.score, quiz.items.length);
    $("#test-score-title").textContent = pct + "%";
    if (pct < PASS_PCT) {
    $("#forever-box").hidden = true;
      $("#test-score-line").textContent = t("need_80", { pct: pct });
      const set = currentSet();
      if (set) {
        const empty = Algo.emptyWins();
        set.winsA = empty.winsA;
        set.winsB = empty.winsB;
        set.winsC = empty.winsC;
        persist();
      }
      const failSet = currentSet();
      if (failSet) {
        const missIds = misses.map(function (m) {
          return m && m.id != null ? m.id : null;
        }).filter(function (id) { return id != null && id !== ""; });
        appendScoreRow({
          at: Date.now(),
          pack: failSet.packId,
          kind: quiz.kind === "hard" ? "test_hard" : "test_easy",
          activity: quiz.kind === "hard" ? "Hard test" : "Easy test",
          score: quiz.score,
          total: total,
          words: (quiz.items || []).map(function (it) {
            return { id: it.id, en: it.en };
          }),
        });
        logActivityResult({
          packId: failSet.packId,
          packTitle: failSet.title || "",
          kind: quiz.kind === "hard" ? "test_hard" : "test_easy",
          score: quiz.score,
          total: total,
          meta: { misses: missIds, passed: false },
        });
        persist();
      }
      setTimeout(function () { startLearnAt("A"); }, 1600);
      return;
    }
    const passedSet = currentSet();
    if (passedSet) {
      window.StartSlice.markPassed(
        passedSet,
        (quiz.items || []).map(function (item) { return item && item.id; }),
        pct
      );
      const missIds = misses.map(function (m) {
        return m && m.id != null ? m.id : null;
      }).filter(function (id) { return id != null && id !== ""; });
      appendScoreRow({
        at: Date.now(),
        pack: passedSet.packId,
        kind: quiz.kind === "hard" ? "test_hard" : "test_easy",
        activity: quiz.kind === "hard" ? "Hard test" : "Easy test",
        score: quiz.score,
        total: total,
        words: (quiz.items || []).map(function (it) {
          return { id: it.id, en: it.en };
        }),
      });
      logActivityResult({
        packId: passedSet.packId,
        packTitle: passedSet.title || "",
        kind: quiz.kind === "hard" ? "test_hard" : "test_easy",
        score: quiz.score,
        total: total,
        meta: { misses: missIds, passed: true },
      });
      persist();
    }
    const missLine = misses.length
      ? misses.map(function (m) { return m.en + " = " + meaning(m); }).join(" · ")
      : t("no_mistakes");
    $("#test-score-line").textContent = quiz.score + " / " + total + " (" + Math.round((100 * quiz.score) / total) + "%)  ·  " + missLine;
    const box = $("#forever-box");
    const chk = $("#chk-forever");
    if (box) {
      box.hidden = false;
      if (chk) chk.checked = !!(currentSet() && currentSet().srsTrying);
    }
  }

  function showGamesScreen() {
    const set = currentSet();
    if (set) syncPack();
    $("#games-set-hint").textContent = t("games_hint", { title: set ? set.title : "" });
    showScreen("games");
    if (pathOpen("games")) hideGamesLock();
  }

  function goGames() {
    if (!currentSet()) {
      openDemo().then(showGamesScreen);
      return;
    }
    showGamesScreen();
  }

  function startMatch() {
    const set = currentSet();
    if (!set) return;
    const tiles = [];
    playWords(set).forEach(function (w) {
      tiles.push({ id: w.id, side: "en", text: w.en, pair: w.id });
      tiles.push({ id: w.id + "_ko", side: "ko", text: meaning(w), pair: w.id });
    });
    matchGame = {
      tiles: shuffle(tiles),
      picked: [],
      matched: {},
      started: Date.now(),
      timer: null,
      pairs: 0,
      need: playWords(set).length,
    };
    showScreen("match");
    $("#match-win").hidden = true;
    drawMatch();
    if (matchGame.timer) clearInterval(matchGame.timer);
    matchGame.timer = setInterval(updateMatchHud, 250);
    updateMatchHud();
  }

  function updateMatchHud() {
    if (!matchGame) return;
    const s = Math.floor((Date.now() - matchGame.started) / 1000);
    const mm = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, "0");
    $("#match-hud").textContent = t("match_hud", { n: matchGame.pairs, time: mm + ":" + ss });
  }

  function drawMatch() {
    const grid = $("#match-grid");
    grid.innerHTML = "";
    matchGame.tiles.forEach(function (t, idx) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "match-tile " + t.side;
      b.textContent = t.text;
      if (matchGame.matched[t.pair] && matchGame.picked.indexOf(idx) === -1) {
        /* still show unmatched only */
      }
      if (matchGame.matched[t.pair]) b.classList.add("matched");
      if (matchGame.picked.indexOf(idx) >= 0) b.classList.add("picked");
      b.addEventListener("click", function () { onMatchTap(idx); });
      grid.appendChild(b);
    });
  }

  function onMatchTap(idx) {
    if (!matchGame) return;
    const t = matchGame.tiles[idx];
    if (matchGame.matched[t.pair]) return;
    if (matchGame.picked.indexOf(idx) >= 0) return;
    if (matchGame.picked.length >= 2) return;
    matchGame.picked.push(idx);
    drawMatch();
    if (matchGame.picked.length < 2) return;
    const a = matchGame.tiles[matchGame.picked[0]];
    const b = matchGame.tiles[matchGame.picked[1]];
    const ok = a.pair === b.pair && a.side !== b.side;
    if (ok) {
      matchGame.matched[a.pair] = true;
      matchGame.pairs += 1;
      matchGame.picked = [];
      drawMatch();
      updateMatchHud();
      if (matchGame.pairs >= matchGame.need) {
        clearInterval(matchGame.timer);
        $("#match-win").hidden = false;
        burst(t("match_win"));
        markRoundGameDone("match");
        showTestPick();
      }
    } else {
      setTimeout(function () {
        matchGame.picked = [];
        drawMatch();
      }, 420);
    }
  }

  function startListen() {
    const set = currentSet();
    if (!set) return;
    ensureMeetLock(set);
    listenGame = {
      items: shuffle(playWords(set)),
      index: 0,
      score: 0,
      locking: false,
      startedAt: 0,
    };
    showScreen("listen");
    $("#listen-score").hidden = true;
    $("#listen-choices").hidden = false;
    renderListen();
  }

  function renderListen() {
    const item = listenGame.items[listenGame.index];
    if (!item) return finishListen();
    listenGame.locking = false;
    listenGame.startedAt = Date.now();
    $("#listen-prog").textContent =
      listenGame.index + 1 + " / " + listenGame.items.length;
    $("#listen-score").hidden = true;
    fillChoices($("#listen-choices"), distractors(item, 4), "en", onListenPick);
    speak(item.en);
  }

  function onListenPick(word, btn) {
    if (listenGame.locking) return;
    listenGame.locking = true;
    const item = listenGame.items[listenGame.index];
    const ok = word.id === item.id;
    btn.classList.add(ok ? "good" : "bad");
    if (ok) listenGame.score += 1;
    logEvent({
      activity_id: "listen_choice",
      item_id: item.id,
      mode: "listen",
      response: word.en,
      correct: ok,
      latency_ms: Date.now() - listenGame.startedAt,
      wins_toward_2: 0,
      points: ok ? 1 : 0,
      errors: ok ? 0 : 1,
      started_at: listenGame.startedAt,
    });
    setTimeout(function () {
      listenGame.index += 1;
      renderListen();
    }, 450);
  }

  function finishListen() {
    $("#listen-choices").hidden = true;
    $("#listen-score").hidden = false;
    if ($("#listen-score-pct")) $("#listen-score-pct").textContent = (listenGame.items.length ? Math.round((100 * listenGame.score) / listenGame.items.length) : 0) + "%";
    $("#listen-score-line").textContent = t("score_line", { score: listenGame.score, total: listenGame.items.length }) + (listenGame.items.length ? " (" + Math.round((100 * listenGame.score) / listenGame.items.length) + "%)" : "");
    const set = currentSet();
    if (set && listenGame && listenGame.items && listenGame.items.length) {
      logActivityResult({
        packId: set.packId,
        packTitle: set.title || "",
        kind: "listen",
        score: listenGame.score,
        total: listenGame.items.length,
      });
    }
    markRoundGameDone("listen");
    showTestPick();
  }

  function quizItemsFromSet() {
    const set = currentSet();
    const words = playWords(set);
    return words.map(function (w) {
      const others = shuffle(words.filter(function (x) { return x.id !== w.id; })).map(function (x) { return x.en; });
      return {
        item_id: w.id,
        question: meaning(w),
        correct: w.en,
        wrong: others.slice(0, 2),
        word: w.en,
      };
    }).filter(function (it) { return it.correct && it.wrong.length >= 1; });
  }

  function memoryPack(set) {
    const words = playWords(set).filter(function (w) { return w && w.en; });
    const voice = playVoice();
    return {
      pack_id: packIdForSet(set),
      title: set.title,
      module_id: "memory-match",
      ui_locale: localeCode(),
      items: words.map(function (w) {
        const file = mediaFile(w);
        const l1 = w.l1 && typeof w.l1 === "object" ? w.l1 : { ko: w.ko || "" };
        const item = { id: w.id, en: w.en, l1: l1 };
        if (file) {
          item.audio_id = mediaUrl(packBase() + "/audio/" + voice + "/" + file + ".mp3");
          item.picture = mediaUrl(wordPic(w));
        }
        return item;
      }),
    };
  }

  function shooterPack(set) {
    const words = playWords(set).filter(function (w) { return w && w.en && rockLabel(w); });
    const v = playVoice();
    return {
      pack_id: packIdForSet(set),
      title: set.title,
      module_id: "sound-invaders",
      activity_id: "hear_shoot",
      items: words.map(function (w) {
        const id = mediaFile(w);
        const label = rockLabel(w);
        const wrong = [];
        for (let i = 0; i < words.length && wrong.length < 3; i++) {
          if (words[i] === w) continue;
          const other = rockLabel(words[i]);
          if (!other || other === label) continue;
          wrong.push(other);
        }
        return {
          correct: w.en,
          prompt: w.en,
          label: label,
          wrong: wrong,
          audio: id ? mediaUrl(packBase() + "/audio/" + v + "/" + id + ".mp3") : null,
        };
      }).filter(function (it) { return it.label; }),
    };
  }

  function openPortableGame(kind) {
    const student = currentStudentId() || (isPublicMode() ? "guest" : "");
    if (!student) return;
    const set = currentSet();
    if (!set) {
      openDemo().then(function () { openPortableGame(kind); });
      return;
    }
    if (!pathOpen("games")) return;
    ensureMeetLock(set);
    const items = quizItemsFromSet();
    const paths = {
      leapfrog: "games/leap-frog/index.html",
      snowjump: "games/snow-jump/index.html",
      spellfire: "games/spellfire/index.html",
      soundinvaders: "games/sound-invaders/index.html",
      memorymatch: "games/memory-match/index.html",
    };
    const path = paths[kind];
    if (!path) return;
    let pack;
    if (kind === "spellfire") {
      const voice = playVoice();
      const spoken = playWords(set).map(function (w) {
        const file = mediaFile(w);
        return {
          item_id: w.id,
          word: w.en,
          audio: file ? mediaUrl(packBase() + "/audio/" + voice + "/" + file + ".mp3") : "",
        };
      }).filter(function (it) { return it.word; });
      pack = {
        pack_id: packIdForSet(set),
        title: set.title,
        seconds_per_letter: 5,
        items: spoken,
      };
      pack._spellWords = spoken.map(function (it) { return it.word; }).join(",");
      pack._spellVoice = voice;
    } else if (kind === "soundinvaders") {
      pack = shooterPack(set);
    } else if (kind === "memorymatch") {
      pack = memoryPack(set);
    } else {
      pack = {
        pack_id: packIdForSet(set),
        title: set.title,
        module_id: kind,
        activity_id: kind,
        seconds: 15,
        items: items,
      };
    }
    try {
      sessionStorage.setItem("mrj.wm.gamepack", JSON.stringify(pack));
    } catch (e) { /* ignore */ }
    const frame = gameFrame();
    const name = encodeURIComponent(student);
    frame.src = path + "?pack=session&packid=" + encodeURIComponent(currentPackId()) + "&words=" + encodeURIComponent((pack && pack._spellWords) || "") + "&voice=" + encodeURIComponent((pack && pack._spellVoice) || playVoice()) + "&v=1.11&student=" + name + "&locale=" + encodeURIComponent(localeCode());
    armGame(kind);
  }

  // Game iframe lifecycle: a fresh iframe per game; on close/finish tell the game to stop ("mrj-stop"),
  // blank it and REMOVE it so no music or loop can keep playing in a hidden frame.
  function gameFrame() {
    let f = $("#game-frame");
    if (f) return f;
    const host = $("#screen-playgame");
    if (!host || !document.createElement) return f;
    f = document.createElement("iframe");
    f.id = "game-frame";
    f.title = "Game";
    f.setAttribute("allow", "autoplay; fullscreen");
    host.appendChild(f);
    return f;
  }
  function closeGameFrame() {
    const f = $("#game-frame");
    if (!f) return;
    try { if (f.contentWindow) f.contentWindow.postMessage({ type: "mrj-stop" }, "*"); } catch (e) { /* cross-origin / gone */ }
    try { f.removeAttribute && f.removeAttribute("id"); } catch (e) { /* ignore */ }
    const kill = function () {
      try { f.src = "about:blank"; } catch (e) { /* ignore */ }
      try { if (f.parentNode) f.parentNode.removeChild(f); else if (f.remove) f.remove(); } catch (e) { /* ignore */ }
    };
    // give the game one tick to handle mrj-stop, then blank + remove (unload also stops its audio)
    if (typeof setTimeout === "function") setTimeout(kill, 60); else kill();
  }
  window.MRJ_WM_closeGameFrame = closeGameFrame;

  function armGame(kind) {
    armedGame = String(kind || "");
    showScreen("playgame");
  }

  function leaveGame() {
    armedGame = "";
  }

  function deliverGameDone(msg) {
    const kinds = { leapfrog: 1, snowjump: 1, spellfire: 1, soundinvaders: 1, memorymatch: 1 };
    if (currentScreen !== "playgame") return;
    if (!armedGame || !kinds[armedGame]) return;
    if (!msg || msg.type !== "mrj-wm-game-done") return;
    if (msg.game !== armedGame || !kinds[msg.game]) return;
    if (msg.finished !== true) return;
    const set = currentSet();
    if (!set || !window.PathLock) return;
    if (typeof msg.items !== "number" || !(msg.items >= 1)) return;
    const rec = window.PathLock.markGameDone(set, msg.game);
    const row = {
      at: rec && rec.at ? rec.at : Date.now(),
      pack: set.packId,
      kind: "game",
      activity: activityLabelForKind("game", { game: msg.game }),
      game: msg.game,
    };
    if (typeof msg.correct === "number") {
      row.score = msg.correct;
      row.total = msg.items;
    }
    row.words = playWords(set).map(function (w) {
      return { id: w.id, en: w.en };
    });
    appendScoreRow(row);
    if (typeof msg.correct === "number") {
      logActivityResult({
        packId: set.packId,
        packTitle: set.title || "",
        kind: "game_" + msg.game,
        score: msg.correct,
        total: msg.items,
      });
    }
    persist();
    armedGame = "";
    closeGameFrame();
    renderSetHome();
    showTestPick();
    const note = $("#path-lock-note");
    if (note) {
      note.hidden = false;
      note.textContent = t("game_finished");
    }
  }

  function goBack() {
    if (currentScreen === "playgame") {
      leaveGame();
      closeGameFrame();
      goGames();
      return;
    }
    if (currentScreen === "intro") {
      renderSetHome();
      showScreen("set");
      return;
    }
    if (currentScreen === "record") {
      if (currentSet()) {
        renderSetHome();
        showScreen("set");
      } else {
        renderHome();
        showScreen("home");
      }
      return;
    }
    if (currentScreen === "class-progress") {
      renderHome();
      showScreen("home");
      return;
    }
    if (currentScreen === "learn" || currentScreen === "test") {
      renderSetHome();
      showScreen(currentSet() ? "set" : "home");
      return;
    }
    if (currentScreen === "match" || currentScreen === "listen") {
      if (matchGame && matchGame.timer) clearInterval(matchGame.timer);
      goGames();
      return;
    }
    if (currentScreen === "words") {
      renderHome();
      showScreen("home");
      return;
    }
    if (currentScreen === "games" || currentScreen === "set") {
      renderHome();
      showScreen("home");
    }
  }

  function bind() {
    $("#btn-tap-start").addEventListener("click", function () {
      if (!canPlay()) return;
      unlockSpeech();
      setVoice(state.voice);
      if (externalPackSrc) {
        loadExternalPackFromSrc(externalPackSrc).then(function () {
          renderHome();
          showScreen("home");
        });
        return;
      }
      renderHome();
      showScreen("home");
    });
    const signOut = $("#btn-signout");
    if (signOut) signOut.addEventListener("click", function () {
      saveStateToStorage();
      authStudentId = "";
      state = freshState();
      state.displayName = "";
      state.accountName = "";
      state.accountPin = "";
      if (window.MRJ_WM_progress && typeof window.MRJ_WM_progress.resetSession === "function") {
        window.MRJ_WM_progress.resetSession();
      }
      if (window.MRJ_AUTH && typeof window.MRJ_AUTH.signOut === "function") {
        window.MRJ_AUTH.signOut();
      }
      paintSaveWarn(false);
      showSharedDoor();
      showScreen("boot");
    });
    const listBtn = $("#btn-word-list");
    if (listBtn) listBtn.addEventListener("click", function () {
      if (!canPlay()) return;
      openDemo().then(function () {
        const box = $("#alpha-list");
        box.innerHTML = "";
        currentSet().words.slice().sort(function (a, b) { return a.en.localeCompare(b.en); }).forEach(function (w) {
          const row = document.createElement("button");
          row.type = "button";
          row.className = "word-row";
          const tag = currentSet().srsForever ? t("tag_forever") : (currentSet().srsTrying ? t("tag_learning") : t("tag_new"));
          row.innerHTML = '<span class="en"></span><span class="meaning"></span>';
          row.querySelector(".en").textContent = w.en;
          row.querySelector(".meaning").textContent = meaning(w) + " · " + tag;
          row.addEventListener("click", function () { speak(w.en); });
          box.appendChild(row);
        });
        showScreen("words");
      });
    });
    const chk = $("#chk-forever");
    if (chk) chk.addEventListener("change", function () {
      const set = currentSet();
      if (!set) return;
      set.srsTrying = !!chk.checked;
      if (chk.checked) {
        set.srsStage = 0;
        set.srsNextAt = Date.now() + 86400000;
        set.srsForever = false;
      } else {
        set.srsNextAt = null;
      }
      persist();
    });
    $("#btn-back").addEventListener("click", goBack);
    const nameBtn = $("#btn-student-name");
    if (nameBtn) nameBtn.addEventListener("click", openScoreRecord);
    const teacherBtn = $("#btn-teacher-unlock");
    if (teacherBtn) {
      teacherBtn.addEventListener("click", function () {
        if (!currentStudentId()) return;
        const unlock = window.MRJTeacherUnlock;
        if (!unlock || typeof unlock.handleTopbarClick !== "function") return;
        unlock.handleTopbarClick(refreshTeacherChrome);
      });
    }
    $$(".voice-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setVoice(btn.getAttribute("data-voice"));
        const set = currentSet();
        if (currentScreen === "intro") {
          if (tap.phase === "listen" && tap.cur) speak(tap.cur.en);
          else if (tap.cur) speak(tap.cur.en);
        } else if (currentScreen === "set" && set && set.words[0]) speak(set.words[0].en);
        else if (currentScreen === "learn" && learn.cur) speak(learn.cur.en);
        else if (currentScreen === "test" && quiz.kind !== "hard" && quiz.items[quiz.index]) speak(quiz.items[quiz.index].en);
        else if (currentScreen === "listen" && listenGame && listenGame.items[listenGame.index]) {
          speak(listenGame.items[listenGame.index].en);
        }
      });
    });
    $("#btn-continue").addEventListener("click", function () {
      if (!canPlay()) return;
      const set = currentSet();
      if (set && set.packId && !(set.words || []).length) {
        openPack(set.packId);
        return;
      }
      renderSetHome();
      showScreen("set");
    });
    const demoBtn = $("#btn-demo");
    if (demoBtn) demoBtn.addEventListener("click", function () {
      if (!canPlay()) return;
      openDemo();
    });
    PACK_IDS.forEach(function (pid) {
      const el = $("#btn-pack-" + pid);
      if (el) el.addEventListener("click", function () {
        if (!canPlay()) return;
        openPack(pid);
      });
    });
    $("#btn-games-home").addEventListener("click", function () {
      if (!canPlay()) return;
      goGames();
    });
    $("#btn-intro").addEventListener("click", function () {
      if (!canPlay()) return;
      if (!pathOpen("intro")) return;
      startMeet();
    });
    const tapSpeak = $("#btn-tap-speak");
    if (tapSpeak) tapSpeak.addEventListener("click", function () {
      if (tap.cur) speak(tap.cur.en);
    });
    $("#btn-learn").addEventListener("click", function () {
      if (!canPlay()) return;
      const set = currentSet();
      const step = allRoundActive(set) ? "B" : "A";
      if (!pathOpen(step)) return;
      startLearnAt(step);
    });
    $$("[data-jump]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!canPlay()) return;
        const step = btn.getAttribute("data-jump");
        if (!teacherNow() && !pathOpen(step)) return;
        jumpTo(step);
      });
    });
    const meetEn = $("#meet-en");
    if (meetEn) meetEn.addEventListener("click", function () {
      const w = currentMeetWord();
      if (w) speak(w.en);
    });
    const wwEx = $("#ww-ex");
    if (wwEx) wwEx.addEventListener("click", function () {
      const w = currentMeetWord();
      if (w) speakWW(w);
    });
    const skipStepBtn = $("#btn-skip-step");
    if (skipStepBtn) skipStepBtn.addEventListener("click", skipStep);
    $("#btn-easy").addEventListener("click", function () {
      if (!canPlay()) return;
      if (!pathOpen("test")) return;
      state.testKind = "easy";
      persist();
      renderSetHome();
      startEasy();
    });
    $("#btn-hard").addEventListener("click", function () {
      if (!canPlay()) return;
      if (!pathOpen("test")) return;
      state.testKind = "hard";
      persist();
      renderSetHome();
      startHard();
    });
    const te = $("#btn-test-easy");
    const th = $("#btn-test-hard");
    if (te) te.addEventListener("click", function () {
      if (!canPlay()) return;
      if (!pathOpen("test")) return;
      state.testKind = "easy";
      persist();
      startEasy();
    });
    if (th) th.addEventListener("click", function () {
      if (!canPlay()) return;
      if (!pathOpen("test")) return;
      state.testKind = "hard";
      persist();
      startHard();
    });
    $("#btn-games-set").addEventListener("click", function () {
      if (!canPlay()) return;
      if (!pathOpen("games")) return;
      goGames();
    });
    const finalEasy = $("#btn-final-easy");
    if (finalEasy) finalEasy.addEventListener("click", function () {
      if (!canPlay()) return;
      state.finalTest = true;
      persist();
      startEasy(true);
    });
    const finalHard = $("#btn-final-hard");
    if (finalHard) finalHard.addEventListener("click", function () {
      if (!canPlay()) return;
      state.finalTest = true;
      persist();
      startHard(true);
    });
    $("#btn-speak").addEventListener("click", function () {
      if (learn.cur) speak(learn.cur.en);
    });
    $("#btn-del").addEventListener("click", delAz);
    $("#btn-check").addEventListener("click", onLearnCheck);
    $("#btn-skip-word").addEventListener("click", skipWord);
    const skipPartBtn = $("#btn-skip-part");
    if (skipPartBtn) skipPartBtn.addEventListener("click", skipPart);
    $("#btn-test-speak").addEventListener("click", function () {
      const item = quiz.items[quiz.index];
      if (item && quiz.kind !== "hard") speak(item.en);
    });
    $("#btn-test-del").addEventListener("click", delAz);
    $("#btn-test-check").addEventListener("click", onHardCheck);
    $("#btn-test-home").addEventListener("click", function () {
      renderSetHome();
      showScreen("set");
    });
    $$("#game-slots .slot.playable").forEach(function (slot) {
      slot.addEventListener("click", function () {
        if (!canPlay()) return;
        const g = slot.getAttribute("data-game");
        if (g === "leapfrog" || g === "snowjump" || g === "spellfire" || g === "soundinvaders" || g === "memorymatch") openPortableGame(g);
      });
    });
    const gamesNeed = $("#btn-games-need");
    if (gamesNeed) gamesNeed.addEventListener("click", function () {
      if (!canPlay()) return;
      const set = currentSet();
      if (set && roundReadyForGame(set)) {
        hideGamesLock();
        return;
      }
      const step = gamesNeed.getAttribute("data-need") || "intro";
      if (step === "intro") return startMeet();
      if (step === "A" || step === "B" || step === "C") return startLearnAt(step);
      jumpTo(step);
    });
    if (window.addEventListener) {
      window.addEventListener("message", function (ev) {
        const data = ev && ev.data;
        if (!data || typeof data !== "object") return;
        if (data.type !== "mrj-wm-game-done") return;
        deliverGameDone(data);
      });
    }
    $("#btn-listen-speak").addEventListener("click", function () {
      if (listenGame && listenGame.items[listenGame.index]) speak(listenGame.items[listenGame.index].en);
    });
    $("#btn-listen-home").addEventListener("click", goGames);

    const langSel = $("#lang-select");
    function wireLang(sel) {
      if (!sel || !I18n) return;
      I18n.fillSelect(sel);
      sel.value = state.locale || "en";
      sel.addEventListener("change", function () {
        applyLocale(sel.value);
      });
    }
    if (I18n) {
      I18n.setLocale(state.locale || "en");
      wireLang(langSel);
    }

    document.addEventListener("keydown", function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (isTypingScreenActive() && !keydownInFormField()) {
        const letter = azLetterFromCode(e.code);
        if (letter) {
          e.preventDefault();
          onAz(letter);
          return;
        }
        if (e.code === "Backspace") {
          e.preventDefault();
          delAz();
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          if (currentScreen === "learn") onLearnCheck();
          else if (currentScreen === "test") onHardCheck();
          return;
        }
      }

      if (e.key !== "Enter") return;
      if (currentScreen === "learn") {
        e.preventDefault();
        onLearnCheck();
      } else if (currentScreen === "test") {
        e.preventDefault();
        onHardCheck();
      }
    });
    bindKbDeskMedia();
    if (window.visualViewport) {
      const fit = function () {
        const phone = document.querySelector(".phone");
        if (phone) phone.style.height = window.visualViewport.height + "px";
      };
      window.visualViewport.addEventListener("resize", fit);
      fit();
    }

    buildPad($("#az-pad"));
    buildPad($("#test-az-pad"));
    if ($("#intro-az-pad"))     buildPad($("#intro-az-pad"));
    applySlimPacks();
  }

  function showAllPackButtons() {
    PACK_IDS.forEach(function (pid) {
      const el = $("#btn-pack-" + pid);
      if (el) el.hidden = false;
    });
  }

  async function applySlimPacks() {
    try {
      const res = await fetch("BUILD_STAMP.txt", { cache: "no-store" });
      if (!res.ok) {
        showAllPackButtons();
        return;
      }
      const text = await res.text();
      const line = text.split("\n").find(function (l) { return l.indexOf("packs=") === 0; });
      const val = line ? line.slice(6).trim() : "";
      if (!line || !val || val === "all") {
        showAllPackButtons();
        return;
      }
      const allowed = val.split(/\s+/);
      const demo = $("#btn-demo");
      if (demo) demo.hidden = true;
      PACK_IDS.forEach(function (pid) {
        const el = $("#btn-pack-" + pid);
        if (el) el.hidden = allowed.indexOf(pid) < 0;
      });
    } catch (e) {
      showAllPackButtons();
    }
  }

  function applyLocale(code) {
    if (!I18n) return;
    state.locale = I18n.setLocale(code || state.locale || "en");
    persist();
    I18n.applyDom(document);
    const langSel = $("#lang-select");
    if (langSel) langSel.value = state.locale;
    if (currentScreen === "home") renderHome();
    if (currentScreen === "set") renderSetHome();
    if (currentScreen === "learn" && learn.cur) renderLearn(false);
    if (currentScreen === "test" && quiz && quiz.items && quiz.items[quiz.index]) renderQuiz();
    if (currentScreen === "games" && currentSet()) {
      $("#games-set-hint").textContent = t("games_hint", { title: currentSet().title });
    }
    if (currentScreen === "match") updateMatchHud();
    if (currentScreen === "listen" && listenGame) {
      $("#listen-prog").textContent =
        listenGame.index + 1 + " / " + listenGame.items.length;
    }
    if (currentScreen === "intro") {
      if (tap && tap.words && tap.words.length && $("#tapmap") && !$("#tapmap").hidden) renderTapmap();
      else renderMeet();
    }
    if (currentScreen === "words") {
      const listBtn = $("#btn-word-list");
      if (listBtn) listBtn.click();
    }
  }

  window.MRJ_WORD_FACTORY_PACK = { words: [] };
  window.MRJ_WM_dailyWordLog = function () {
    return state.dailyWordLog;
  };

  if (window.WM_TEST_HOOK) {
    window.WM_TEST = {
      isPublicMode: isPublicMode,
      canPlay: canPlay,
      persist: persist,
      logEvent: logEvent,
      saveStateToStorage: saveStateToStorage,
      renderPackStanding: renderPackStanding,
      startEasy: startEasy,
      startHard: startHard,
      finishQuiz: finishQuiz,
      activateSet: activateSet,
      currentSet: currentSet,
      armGame: armGame,
      deliverGameDone: deliverGameDone,
      leaveGame: leaveGame,
      screenName: function () { return currentScreen; },
      getQuiz: function () { return quiz; },
      PASS_PCT: PASS_PCT,
      chooseStart: chooseStart,
      studySize: studySize,
      sliceCount: sliceCount,
      allStudyMode: allStudyMode,
      allRoundActive: allRoundActive,
      pathOpen: pathOpen,
      studentLocked: studentLocked,
      renderSetHome: renderSetHome,
      roundReadyForGame: roundReadyForGame,
      currentRoundReadyForGame: currentRoundReadyForGame,
      packBase: packBase,
      markRoundGameDone: markRoundGameDone,
      getState: function () { return state; },
      setStudySize: function (n) { state.studySize = n; },
      markPassed: function (set, ids, pct) {
        window.StartSlice.markPassed(set, ids, pct);
      },
      StartSlice: window.StartSlice,
      slimProgress: slimProgress,
      applyRemote: applyRemote,
      mergeRemoteProgress: mergeRemoteProgress,
      dedupeSetsByPackId: dedupeSetsByPackId,
      findSetByPackId: findSetByPackId,
      packSlimFromSet: packSlimFromSet,
      formatScoreRecordLine: formatScoreRecordLine,
      scoreRowHasRealScore: scoreRowHasRealScore,
      collectScoreRecordRows: collectScoreRecordRows,
      renderScoreRecord: renderScoreRecord,
      setProgressTooLargeWarn: setProgressTooLargeWarn,
      mergeScoreRows: mergeScoreRows,
      ingestBookProgress: ingestBookProgress,
      wordPic: wordPic,
      speak: speak,
      speakWW: speakWW,
      shooterPack: shooterPack,
      memoryPack: memoryPack,
      packIdForSet: packIdForSet,
      openPortableGame: openPortableGame,
      gameFrame: function () { return document.querySelector("#game-frame"); },
      startTapmap: startTapmap,
      onTapTile: onTapTile,
      tapPhase: function () { return tap.phase; },
      setRangeBannerText: setRangeBannerText,
      paintSetRangeBanner: paintSetRangeBanner,
    };
  }
  initPackSrcParam();
  rememberRole();
  bind();
  probeLinuxTts();
  if (I18n) {
    I18n.setLocale(state.locale || "en");
    I18n.fillSelect($("#lang-select"));
    I18n.applyDom(document);
  }
  setVoice(state.voice);
  showScreen("boot");
})();
