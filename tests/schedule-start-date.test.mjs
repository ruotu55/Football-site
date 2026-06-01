import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import assert from "node:assert/strict";

const schedulePath = new URL("../999_Calander/js/schedule.js", import.meta.url);
const ctx = { window: {} };
runInContext(readFileSync(schedulePath, "utf8"), createContext(ctx));
const S = ctx.window.FCSchedule;

assert.equal(S.START_DATE.getFullYear(), 2026);
assert.equal(S.START_DATE.getMonth(), 5); // June
assert.equal(S.START_DATE.getDate(), 2);

const jun1 = S.uploadsForDay(new Date(2026, 5, 1));
const jun2 = S.uploadsForDay(new Date(2026, 5, 2));

assert.equal(jun1.length, 0, "Jun 1 must have no uploads (schedule starts Jun 2)");
assert.ok(jun2.length >= 0, "Jun 2 is the first eligible day");

console.log("schedule start-date test passed");
