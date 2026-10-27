"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "js/mrj-teacher-unlock.js"), "utf8");

if (/localStorage/.test(src)) {
  console.error("mrj-teacher-unlock must not use localStorage");
  process.exit(1);
}
if (!/study_teacher_check/.test(src)) {
  console.error("mrj-teacher-unlock must call study_teacher_check");
  process.exit(1);
}
if (!/isTeacher\(\)/.test(src)) {
  console.error("mrj-teacher-unlock must honor MRJSignin.isTeacher");
  process.exit(1);
}

const sandbox = { globalThis: {}, window: {}, document: { addEventListener: function () {} } };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.runInNewContext(src, sandbox);

const U = sandbox.MRJTeacherUnlock;
if (!U || typeof U.isMrjTeacher !== "function") {
  console.error("MRJTeacherUnlock export missing");
  process.exit(1);
}

sandbox.MRJSignin = { isTeacher: function () { return false; } };
if (U.isMrjTeacher()) {
  console.error("should not be teacher before unlock");
  process.exit(1);
}
sandbox.MRJSignin = { isTeacher: function () { return true; } };
if (!U.isMrjTeacher()) {
  console.error("server isTeacher should enable teacher mode");
  process.exit(1);
}

console.log("mrj_teacher_unlock_test: ok");
