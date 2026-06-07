import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const fwd = (p) => p.replace(/\\/g, "/");

/** Append/replace a draft entry in root_meta_info.json (idempotent by draft_id). */
export function registerDraft(rootMetaPath, e) {
  const meta = JSON.parse(readFileSync(rootMetaPath, "utf8"));
  if (!Array.isArray(meta.all_draft_store)) meta.all_draft_store = [];
  const rootPath = meta.root_path || meta.all_draft_store[0]?.draft_root_path || "";
  const entry = {
    cloud_draft_cover: false, cloud_draft_sync: false,
    draft_cloud_last_action_download: false, draft_cloud_purchase_info: "",
    draft_cloud_template_id: "", draft_cloud_tutorial_info: "",
    draft_cloud_videocut_purchase_info: "",
    draft_cover: fwd(join(e.foldPath, "draft_cover.jpg")),
    draft_fold_path: fwd(e.foldPath),
    draft_id: e.draftId, draft_is_ai_shorts: false, draft_is_cloud_temp_draft: false,
    draft_is_invisible: false, draft_is_web_article_video: false,
    draft_json_file: fwd(join(e.foldPath, "draft_content.json")),
    draft_name: e.name, draft_new_version: "",
    draft_root_path: rootPath, draft_timeline_materials_size: 0, draft_type: "",
    draft_web_article_video_enter_from: "", streaming_edit_draft_ready: true,
    tm_draft_cloud_completed: "", tm_draft_cloud_entry_id: -1, tm_draft_cloud_modified: 0,
    tm_draft_cloud_parent_entry_id: -1, tm_draft_cloud_space_id: -1, tm_draft_cloud_user_id: -1,
    tm_draft_create: e.createUs, tm_draft_modified: e.modifyUs, tm_draft_removed: 0,
    tm_duration: e.durationUs,
  };
  // Stable identity is the folder path (draft_id is regenerated each build), so match on
  // either to avoid duplicate stale entries when rebuilding the same-named draft.
  const foldFwd = fwd(e.foldPath);
  const i = meta.all_draft_store.findIndex(
    (d) => d.draft_id === e.draftId || d.draft_fold_path === foldFwd,
  );
  if (i >= 0) meta.all_draft_store[i] = entry;
  else { meta.all_draft_store.push(entry); meta.draft_ids = (meta.draft_ids || 0) + 1; }
  writeFileSync(rootMetaPath, JSON.stringify(meta));
}

/** Write a minimal draft_meta_info.json next to draft_content.json. */
export function writeDraftMeta(foldPath, e, mediaMaterials = []) {
  const meta = {
    draft_cover: "draft_cover.jpg", draft_fold_path: fwd(foldPath),
    draft_id: e.draftId, draft_name: e.name,
    draft_materials: [{ type: 0, value: mediaMaterials }, { type: 1, value: [] },
      { type: 2, value: [] }, { type: 3, value: [] }, { type: 6, value: [] }, { type: 7, value: [] }],
    draft_materials_copied_info: [], draft_removable_storage_device: "",
    draft_root_path: fwd(e.rootPath || ""), draft_segment_extra_info: [],
    tm_draft_cloud_entry_id: -1, tm_draft_create: e.createUs, tm_draft_modified: e.modifyUs,
    tm_draft_removed: 0, tm_duration: e.durationUs,
  };
  writeFileSync(join(foldPath, "draft_meta_info.json"), JSON.stringify(meta));
}
