import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { assembleDraft } from "./capcut/schema.mjs";
import { registerDraft, writeDraftMeta } from "./capcut/registry.mjs";
import { newId } from "./capcut/ids.mjs";

const CAPCUT_ROOT =
  "C:/Users/Rom/AppData/Local/CapCut/User Data/Projects/com.lveditor.draft";

export function buildDraftFromScene(scenePath, { capcutRoot = CAPCUT_ROOT, nowMs = Date.now() } = {}) {
  const scene = JSON.parse(readFileSync(scenePath, "utf8"));
  const draft = assembleDraft(scene, { idSeed: (nowMs % 1e9) | 0 });
  const draftId = newId();
  const name = scene.name || "Football Quiz";
  const foldPath = join(capcutRoot, name);
  mkdirSync(foldPath, { recursive: true });

  draft.id = draftId;
  draft.name = name;
  draft.path = foldPath.replace(/\\/g, "/");
  writeFileSync(join(foldPath, "draft_content.json"), JSON.stringify(draft));

  const e = { draftId, name, foldPath, rootPath: capcutRoot,
    durationUs: draft.duration, createUs: nowMs * 1000, modifyUs: nowMs * 1000 };
  const media = draft.materials.videos.map((v) => ({
    create_time: Math.floor(nowMs / 1000), duration: draft.duration, id: v.id.toLowerCase(),
    file_Path: v.path, height: v.height, width: v.width, metetype: "photo",
    import_time: Math.floor(nowMs / 1000), import_time_ms: nowMs * 1000, type: 0,
    roughcut_time_range: { duration: -1, start: -1 }, sub_time_range: { duration: -1, start: -1 },
  }));
  writeDraftMeta(foldPath, e, media);

  // Safety: back up the live CapCut index before mutating it.
  const rootMeta = join(capcutRoot, "root_meta_info.json");
  if (existsSync(rootMeta)) copyFileSync(rootMeta, rootMeta + ".fcbak");
  registerDraft(rootMeta, e);
  return { foldPath, draftId };
}

// CLI: node render/build-capcut.mjs <scene.json>
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scenePath = process.argv[2];
  const r = buildDraftFromScene(scenePath);
  console.log("WROTE", r.foldPath, r.draftId);
}
