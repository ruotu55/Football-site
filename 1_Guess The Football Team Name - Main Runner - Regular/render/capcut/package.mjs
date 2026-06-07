import { readFileSync, writeFileSync, cpSync, rmSync, existsSync, renameSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { newId } from "./ids.mjs";

const fwd = (p) => p.split("\\").join("/");

// A CapCut draft is only openable as a COMPLETE folder (Timelines store, configs,
// virtual store, cover, empty dirs). Rather than hand-author all of that, we clone a
// known-good reference draft and rewire its 3 structural ids to fresh ones, then
// inject our generated timeline. See project_capcut_draft_format memory / docs.

/** Newest draft folder under capcutRoot that has a Timelines store + meta (a clonable skeleton). */
export function findReferenceDraft(capcutRoot) {
  let best = null, bestMtime = -1;
  for (const n of readdirSync(capcutRoot)) {
    const p = join(capcutRoot, n);
    try {
      if (!statSync(p).isDirectory()) continue;
      if (!existsSync(join(p, "Timelines", "project.json"))) continue;
      if (!existsSync(join(p, "draft_meta_info.json"))) continue;
      const m = statSync(p).mtimeMs;
      if (m > bestMtime) { bestMtime = m; best = p; }
    } catch { /* skip unreadable */ }
  }
  return best;
}

function scrubIdsInTree(dir, pairs) {
  for (const n of readdirSync(dir)) {
    const fp = join(dir, n);
    if (statSync(fp).isDirectory()) { scrubIdsInTree(fp, pairs); continue; }
    if (!/\.(json|tmp|extra|bak)$|draft_settings$|key_value/.test(n)) continue;
    let b;
    try { b = readFileSync(fp, "utf8"); } catch { continue; }
    let o = b;
    for (const [oldId, freshId] of pairs) {
      o = o.split(oldId).join(freshId).split(oldId.toLowerCase()).join(freshId.toLowerCase());
    }
    if (o !== b) writeFileSync(fp, o);
  }
}

/**
 * Write a full, openable CapCut draft package by cloning a reference draft, scrubbing its
 * structural ids to fresh ones, and injecting `content` (a draft_content object from
 * assembleDraft). Returns { foldPath, draftId, timelineId, projectId }.
 */
export function packageDraft({ content, name, capcutRoot, referenceDir = null, nowMs }) {
  const ref = referenceDir || findReferenceDraft(capcutRoot);
  if (!ref) {
    throw new Error(
      "No reference CapCut draft to clone in " + capcutRoot +
      " — open CapCut and create at least one project first.",
    );
  }

  const refProject = JSON.parse(readFileSync(join(ref, "Timelines", "project.json"), "utf8"));
  const refMeta = JSON.parse(readFileSync(join(ref, "draft_meta_info.json"), "utf8"));
  const OLD_TID = refProject.main_timeline_id;
  const OLD_PROJ = refProject.id;
  const OLD_DRAFT = refMeta.draft_id;

  const TID = newId();
  const PROJ = newId();
  const DRAFT = newId();
  const foldPath = join(capcutRoot, name);

  content = JSON.parse(JSON.stringify(content));
  content.id = TID;       // root content id == timeline id (CapCut convention)
  content.name = "";
  content.path = fwd(foldPath);
  const contentStr = JSON.stringify(content);
  const videoIds = (content.materials.videos || []).map((v) => v.id);

  // clone reference -> destination, then rewire its 3 structural ids everywhere
  rmSync(foldPath, { recursive: true, force: true });
  cpSync(ref, foldPath, { recursive: true, force: true });
  scrubIdsInTree(foldPath, [[OLD_TID, TID], [OLD_PROJ, PROJ], [OLD_DRAFT, DRAFT]]);

  // rename the timeline-store folder to the fresh timeline id
  const tlOld = join(foldPath, "Timelines", OLD_TID);
  const tlNew = join(foldPath, "Timelines", TID);
  if (existsSync(tlOld)) renameSync(tlOld, tlNew);

  // inject OUR timeline as BOTH the root copy and the timeline-store copy
  for (const f of ["draft_content.json", "draft_content.json.bak", "template-2.tmp"]) {
    writeFileSync(join(foldPath, f), contentStr);
    if (existsSync(join(tlNew, f))) writeFileSync(join(tlNew, f), contentStr);
  }

  // draft_meta_info.json: clone reference shape, override identity + media list
  const meta = JSON.parse(readFileSync(join(foldPath, "draft_meta_info.json"), "utf8"));
  meta.draft_id = DRAFT;
  meta.draft_name = name;
  meta.draft_fold_path = fwd(foldPath);
  meta.draft_cover = "draft_cover.jpg";
  meta.draft_timeline_materials_size_ = contentStr.length;
  meta.tm_draft_create = nowMs * 1000;
  meta.tm_draft_modified = nowMs * 1000;
  meta.tm_duration = content.duration;
  meta.draft_materials = [{
    type: 0,
    value: (content.materials.videos || []).map((v) => ({
      ai_group_type: "", create_time: Math.floor(nowMs / 1000), duration: content.duration, enter_from: 0,
      extra_info: v.material_name, file_Path: v.path, height: v.height, id: v.id.toLowerCase(),
      import_time: Math.floor(nowMs / 1000), import_time_ms: nowMs * 1000, item_source: 1, md5: "", metetype: "photo",
      roughcut_time_range: { duration: -1, start: -1 }, sub_time_range: { duration: -1, start: -1 }, type: 0, width: v.width,
    })),
  }, { type: 1, value: [] }, { type: 2, value: [] }, { type: 3, value: [] }, { type: 6, value: [] }, { type: 7, value: [] }];
  meta.draft_segment_extra_info = [];
  writeFileSync(join(foldPath, "draft_meta_info.json"), JSON.stringify(meta));

  // draft_virtual_store.json -> reference OUR video material ids
  writeFileSync(join(foldPath, "draft_virtual_store.json"), JSON.stringify({
    draft_materials: [],
    draft_virtual_store: [
      { type: 0, value: [{ creation_time: 0, display_name: "", filter_type: 0, id: "", import_time: 0, import_time_us: 0, sort_sub_type: 0, sort_type: 0, subdraft_filter_type: 0 }] },
      { type: 1, value: videoIds.map((vid) => ({ child_id: vid.toLowerCase(), parent_id: "" })) },
      { type: 2, value: [] },
    ],
  }));

  return { foldPath, draftId: DRAFT, timelineId: TID, projectId: PROJ };
}
