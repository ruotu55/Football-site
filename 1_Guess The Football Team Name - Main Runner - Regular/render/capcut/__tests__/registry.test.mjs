import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerDraft } from "../registry.mjs";

test("registerDraft appends an entry and bumps draft_ids; idempotent by draft_id", () => {
  const root = mkdtempSync(join(tmpdir(), "cc-"));
  writeFileSync(join(root, "root_meta_info.json"),
    JSON.stringify({ all_draft_store: [], draft_ids: 0, root_path: root }));
  const foldPath = join(root, "MYDRAFT");
  mkdirSync(foldPath);

  const entry = { draftId: "ABC-123", name: "MYDRAFT", foldPath, durationUs: 5_000_000,
    createUs: 1780000000000000, modifyUs: 1780000000000000 };
  registerDraft(join(root, "root_meta_info.json"), entry);
  registerDraft(join(root, "root_meta_info.json"), entry); // again → no dup

  const meta = JSON.parse(readFileSync(join(root, "root_meta_info.json"), "utf8"));
  assert.equal(meta.all_draft_store.length, 1);
  assert.equal(meta.draft_ids, 1);
  assert.equal(meta.all_draft_store[0].draft_id, "ABC-123");
  assert.equal(meta.all_draft_store[0].draft_name, "MYDRAFT");
  assert.equal(meta.all_draft_store[0].draft_json_file.endsWith("draft_content.json"), true);
});
