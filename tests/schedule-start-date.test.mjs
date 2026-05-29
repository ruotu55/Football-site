import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import assert from "node:assert/strict";

const schedulePath = new URL("../999_Calander/js/schedule.js", import.meta.url);
const ctx = { window: {} };
runInContext(readFileSync(schedulePath, "utf8"), createContext(ctx));
const S = ctx.window.FCSchedule;

assert.equal(S.START_DATE.getFullYear(), 2026);
assert.equal(S.START_DATE.getMonth(), 5); // June
assert.equal(S.START_DATE.getDate(), 1);

const may = S.uploadsForMonth(2026, 4);
const jun = S.uploadsForMonth(2026, 5);
const may30En = (may.get(30) || []).filter((u) => u.channel === "en");
const jun1En = (jun.get(1) || []).filter((u) => u.channel === "en");

assert.equal(may30En.length, 0, "May 30 must have no EN uploads after shift to Jun 1");
assert.ok(jun1En.length >= 3, "Jun 1 must have launch-day EN slots");
assert.equal(
  jun1En.find((u) => u.type === "short" && u.hour === 11)?.runner?.id,
  1,
  "First morning short on Jun 1 is runner 1",
);

console.log("schedule start-date test passed");
