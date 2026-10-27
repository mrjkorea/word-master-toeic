#!/usr/bin/env node
"use strict";

const fs = require("fs");
const { readBuild, cacheKey, srcAt } = require("./build_id.js");
const path = require("path");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

const root = path.join(__dirname, "..");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");

if (cacheKey(index, "css/app.css") !== readBuild()) fail("css cache");
if (cacheKey(index, "js/app.js") !== readBuild()) fail("app cache");
if (!cacheKey(index, "js/progress-merge.js")) fail("progress-merge cache");
if (!cacheKey(index, "js/progress.js")) fail("progress cache");
if (!cacheKey(index, "js/wm-pack-save.js")) fail("wm-pack-save cache");
if (index.indexOf("btn-class-progress") === -1) fail("class progress button");
if (!cacheKey(index, "mrj-scores.js")) fail("mrj-scores cache");
if (index.indexOf('id="btn-student-name"') === -1) fail("missing top-right name button");
if (index.indexOf('id="btn-teacher-unlock"') === -1) fail("missing top-right teacher unlock button");
if (index.indexOf("data-mrj-own-record") === -1) fail("name button missing data-mrj-own-record");

const topbarEnd = index.indexOf("</header>");
const helloAt = index.indexOf('id="hello-line"');
const nameAt = index.indexOf('id="btn-student-name"');
if (nameAt === -1 || helloAt === -1 || topbarEnd === -1) fail("index structure");
if (nameAt > topbarEnd || nameAt > helloAt) {
  fail("name button must live in the top bar, not on the home hello line");
}

if (app.indexOf('step === "test" && currentStudentId()') !== -1) {
  fail("studentLocked must not bypass test for signed-in students");
}

function mustGateTest(needle, label) {
  const start = app.indexOf(needle);
  if (start === -1) fail("missing handler for " + label);
  const slice = app.slice(start, start + 700);
  if (slice.indexOf('pathOpen("test")') === -1) {
    fail(label + " must call pathOpen(\"test\")");
  }
}

mustGateTest('$("#btn-easy").addEventListener("click"', "btn-easy");
mustGateTest('$("#btn-hard").addEventListener("click"', "btn-hard");
mustGateTest('$("#btn-test-easy")', "btn-test-easy");
mustGateTest('$("#btn-test-hard")', "btn-test-hard");

const jumpBlock = app.slice(app.indexOf('$$("[data-jump]")'), app.indexOf('$$("[data-jump]")') + 500);
if (jumpBlock.indexOf('if (step === "test")') !== -1 && jumpBlock.indexOf("jumpTo(step)") < jumpBlock.indexOf('step === "test"')) {
  fail("ribbon Test must not bypass pathOpen");
}
if (jumpBlock.indexOf('pathOpen(step)') === -1) fail("ribbon jumps must use pathOpen(step)");

const { bootApp } = require("./load_app_for_test");

function bootStudent() {
  global.MRJ_AUTH = { student: function () { return "tester"; } };
  return bootApp({ mode: "student" });
}

const api = bootStudent();
if (!api.pathOpen || !api.studentLocked) fail("WM_TEST missing path helpers");

function wordsOf(n) {
  const words = [];
  for (let i = 1; i <= n; i++) words.push({ id: "w" + i, en: "word" + i, ko: "ko" + i });
  return words;
}

const fresh = {
  id: "set_fresh",
  packId: "nouns100",
  title: "Fresh",
  words: wordsOf(2),
  meetLock: ["w1", "w2"],
  intro: {},
  winsA: {},
  winsB: {},
  winsC: {},
};
api.activateSet(fresh);
if (!api.studentLocked(api.currentSet(), "test")) fail("fresh student should see test locked");
if (api.pathOpen("test")) fail("fresh student must not open test");

const PathLock = require("../js/path-lock.js");
function meet(set) {
  const ids = set.meetLock.slice();
  set.tapmapKey = ids.join(",");
  ids.forEach(function (id) { set.intro[id] = true; });
}
function wins(set, bucket) {
  set.meetLock.forEach(function (id) { bucket[id] = 2; });
}
const ready = {
  id: "set_ready",
  packId: "nouns100",
  title: "Ready",
  words: wordsOf(2),
  meetLock: ["w1", "w2"],
  intro: {},
  tapmapKey: "",
  winsA: {},
  winsB: {},
  winsC: {},
};
meet(ready);
wins(ready, ready.winsA);
wins(ready, ready.winsB);
wins(ready, ready.winsC);
api.activateSet(ready);
if (!PathLock.can(api.currentSet(), "games").ok) fail("fixture did not open games");
if (PathLock.can(api.currentSet(), "test").ok) fail("test opened before a game");
api.markRoundGameDone("match");
if (!PathLock.can(api.currentSet(), "test").ok) fail("steps plus game should open test");
if (!api.pathOpen("test")) fail("pathOpen(test) should succeed after game");

api.setStudySize(0);
api.chooseStart(api.currentSet(), 1);
if (api.currentSet().meetLock.length !== 2) {
  fail("All should lock every word " + api.currentSet().meetLock.length);
}

const merge = require("../js/progress-merge.js");
const merged = global.MRJ_WM_merge(
  { v: 1, voice: "grandma", voiceAt: 200, sets: {} },
  { v: 1, voice: "us_m", voiceAt: 100, sets: {} }
);
if (merged.voice !== "grandma") fail("voice merge kept old voice " + merged.voice);

if (!api.formatScoreRecordLine || !api.scoreRowHasRealScore) {
  fail("WM_TEST missing score record helpers");
}

const bare = api.formatScoreRecordLine({
  at: Date.now(),
  pack: "nouns100",
  kind: "game",
  activity: "leapfrog game",
});
if (/\d+%/.test(bare)) fail("record line invented a score without totals");

const withScore = api.formatScoreRecordLine({
  at: Date.now(),
  pack: "nouns100",
  kind: "test_easy",
  activity: "Easy test",
  score: 8,
  total: 10,
});
if (!/80%/.test(withScore)) fail("record line should show a real score");

console.log("TEST_OPEN_AND_NAME_OK");
process.exit(0);
