import { readFileSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { assembleDraft } from "./capcut/schema.mjs";
import { packageDraft } from "./capcut/package.mjs";
import { registerDraft } from "./capcut/registry.mjs";

const CAPCUT_ROOT =
  "C:/Users/Rom/AppData/Local/CapCut/User Data/Projects/com.lveditor.draft";

/**
 * Build an openable CapCut draft from a scene.json.
 * assembleDraft() -> the timeline; packageDraft() scaffolds the full folder by cloning a
 * reference draft and rewiring ids; registerDraft() lists it in CapCut's index.
 * Generates a fresh draft each run (CapCut autosaves & clobbers edits to an open project).
 */
export function buildDraftFromScene(scenePath, { capcutRoot = CAPCUT_ROOT, nowMs = Date.now(), referenceDir = null } = {}) {
  const scene = JSON.parse(readFileSync(scenePath, "utf8"));
  const name = scene.name || "Football Quiz";
  const content = assembleDraft(scene, { idSeed: (nowMs % 1e9) | 0 });

  const pkg = packageDraft({ content, name, capcutRoot, referenceDir, nowMs });

  // Register in the live index (back it up first).
  const rootMeta = join(capcutRoot, "root_meta_info.json");
  if (existsSync(rootMeta)) copyFileSync(rootMeta, rootMeta + ".fcbak");
  registerDraft(rootMeta, {
    draftId: pkg.draftId, name, foldPath: pkg.foldPath, rootPath: capcutRoot,
    durationUs: content.duration, createUs: nowMs * 1000, modifyUs: nowMs * 1000,
  });
  return pkg;
}

// CLI: node render/build-capcut.mjs <scene.json>
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = buildDraftFromScene(process.argv[2]);
  console.log("WROTE", r.foldPath, "draft=" + r.draftId, "tid=" + r.timelineId);
}
