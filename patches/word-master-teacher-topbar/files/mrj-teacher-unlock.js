(function (root) {
  "use strict";

  var pinSessionUnlocked = false;

  function authApi() {
    return root.MRJSignin || root.MRJ_AUTH || null;
  }

  function isServerTeacher() {
    try {
      var api = authApi();
      return !!(api && typeof api.isTeacher === "function" && api.isTeacher());
    } catch (ignore) {
      return false;
    }
  }

  function isMrjTeacher() {
    return isServerTeacher() || pinSessionUnlocked;
  }

  function isPinSessionUnlocked() {
    return pinSessionUnlocked;
  }

  function lockPinSession() {
    if (!pinSessionUnlocked) return;
    pinSessionUnlocked = false;
    notifyRefresh_();
  }

  function unlockPinSession() {
    pinSessionUnlocked = true;
    notifyRefresh_();
    try {
      if (root.document) {
        root.document.dispatchEvent(new root.CustomEvent("mrj-teacher", { detail: { source: "pin" } }));
      }
    } catch (ignore) {}
  }

  var refreshCb = null;

  function notifyRefresh_() {
    try {
      if (typeof refreshCb === "function") refreshCb();
    } catch (ignore) {}
  }

  function installRefresh(onRefresh) {
    if (!root.document || typeof onRefresh !== "function") return;
    refreshCb = onRefresh;
    root.document.addEventListener("mrj-teacher", function () {
      try {
        onRefresh();
      } catch (ignore) {}
    });
  }

  function teacherCheck(pin) {
    var api = authApi();
    if (api && api.preview) {
      return Promise.resolve(
        api.teacherCheck
          ? api.teacherCheck(pin)
          : { ok: false, message: "Preview has no teacher check." }
      );
    }
    if (!api || !api.ENDPOINT) {
      return Promise.resolve({ ok: false, message: "Sign-in is not loaded." });
    }
    var body = {
      action: "study_teacher_check",
      pin: pin,
      id: api.student && api.student(),
      token: api.token && api.token(),
    };
    return fetch(api.ENDPOINT, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    })
      .then(function (r) {
        return r.json();
      })
      .catch(function () {
        return { ok: false, message: "Network error." };
      })
      .then(function (r) {
        if (r && r.error === "bad_action") {
          return {
            ok: false,
            message: "Teacher check is not on the server yet (deploy study_teacher_check).",
          };
        }
        return r || { ok: false };
      });
  }

  var overlayEl = null;

  function closeOverlay_() {
    if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
    overlayEl = null;
  }

  function esc_(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function promptPin_(who, onDone) {
    if (!root.document || !root.document.body) return;
    closeOverlay_();
    overlayEl = root.document.createElement("div");
    overlayEl.className = "wm-teacher-unlock-overlay";
    overlayEl.innerHTML =
      '<div class="wm-teacher-unlock-card" role="dialog" aria-labelledby="wm-tch-title">' +
      '<h3 id="wm-tch-title">Teacher</h3>' +
      '<p class="wm-tch-student">Student: <b>' +
      esc_(who) +
      "</b></p>" +
      '<label class="wm-tch-pin-label"><span class="sr-only">Teacher PIN</span>' +
      '<input type="password" id="wm-tch-pin" autocomplete="off" placeholder="PIN" /></label>' +
      '<p class="wm-tch-err" id="wm-tch-err" hidden></p>' +
      '<div class="wm-tch-actions">' +
      '<button type="button" class="wm-tch-go" id="wm-tch-go">Unlock</button>' +
      '<button type="button" class="wm-tch-cancel" id="wm-tch-cancel">Cancel</button>' +
      "</div></div>";
    root.document.body.appendChild(overlayEl);
    var pin = overlayEl.querySelector("#wm-tch-pin");
    var err = overlayEl.querySelector("#wm-tch-err");
    var go = function () {
      err.hidden = false;
      err.textContent = "Checking…";
      teacherCheck(String(pin.value || "").trim()).then(function (r) {
        if (r && r.ok) {
          closeOverlay_();
          unlockPinSession();
          if (typeof onDone === "function") onDone(true);
        } else {
          err.textContent = (r && r.message) || "Wrong PIN.";
        }
      });
    };
    overlayEl.querySelector("#wm-tch-go").onclick = go;
    overlayEl.querySelector("#wm-tch-cancel").onclick = function () {
      closeOverlay_();
      if (typeof onDone === "function") onDone(false);
    };
    overlayEl.addEventListener("click", function (e) {
      if (e.target === overlayEl) {
        closeOverlay_();
        if (typeof onDone === "function") onDone(false);
      }
    });
    pin.addEventListener("keydown", function (e) {
      if (e.key === "Enter") go();
    });
    pin.focus();
  }

  function openUnlockFlow(onDone) {
    var api = authApi();
    var who = api && api.student && api.student();
    if (!who) {
      if (root.alert) root.alert("Sign the student in first.");
      return;
    }
    if (isServerTeacher()) {
      if (typeof onDone === "function") onDone(true);
      return;
    }
    if (pinSessionUnlocked) {
      if (typeof onDone === "function") onDone(true);
      return;
    }
    promptPin_(who, onDone);
  }

  function handleTopbarClick(onDone) {
    if (isMrjTeacher() && !isServerTeacher() && pinSessionUnlocked) {
      lockPinSession();
      if (typeof onDone === "function") onDone();
      return;
    }
    if (isMrjTeacher()) {
      if (typeof onDone === "function") onDone();
      return;
    }
    openUnlockFlow(onDone);
  }

  function topbarLabel() {
    if (isMrjTeacher()) return "🔓 Teacher";
    return "👩‍🏫 Teacher";
  }

  root.MRJTeacherUnlock = {
    isMrjTeacher: isMrjTeacher,
    isServerTeacher: isServerTeacher,
    isPinSessionUnlocked: isPinSessionUnlocked,
    lockPinSession: lockPinSession,
    installRefresh: installRefresh,
    openUnlockFlow: openUnlockFlow,
    handleTopbarClick: handleTopbarClick,
    topbarLabel: topbarLabel,
    teacherCheck: teacherCheck,
  };
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
