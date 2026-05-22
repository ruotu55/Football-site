import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const runners = [
  "1_Guess The Football Team Name - Main Runner - Regular",
  "1_Guess The Football Team Name - Main Runner - Shorts",
  "2_Guess The Football National Team - Main Runner - Regular",
  "2_Guess The Football National Team - Main Runner - Shorts",
];

for (const runner of runners) {
  const css = await readFile(
    new URL(`../${runner}/css/components/pitch.css`, import.meta.url),
    "utf8"
  );
  const pitchRenderSource = await readFile(
    new URL(`../${runner}/js/pitch-render.js`, import.meta.url),
    "utf8"
  );

  assert.match(
    css,
    /\.pitch-slots\s*\{[^}]*pointer-events:\s*auto\s*;/s,
    `${runner}: pitch-slots must allow hit testing outside the tiny player circle.`
  );
  assert.match(
    css,
    /\.player-slot\.has-player\s*>\s*\.slot-mount\s*\{[^}]*pointer-events:\s*none\s*;/s,
    `${runner}: slot-mount must not intercept clicks meant for visible controls.`
  );
  assert.match(
    css,
    /\.slot-photo-controls\s*\{[^}]*z-index:\s*80\s*;[^}]*min-height:\s*1\.55rem\s*;[^}]*pointer-events:\s*auto\s*;/s,
    `${runner}: PHOTO/X controls need a high, explicit hitbox.`
  );
  assert.match(
    css,
    /\.slot-name-edit-btn,\s*\.slot-swap-btn\s*\{/,
    `${runner}: name edit button must share the same button base as swap.`
  );
  assert.match(
    css,
    /\.slot-name-edit-btn\s*\{[^}]*right:\s*100%\s*;[^}]*margin-right:\s*5\.5px\s*;/s,
    `${runner}: edit button must sit left of the name chip.`
  );

  assert.match(
    pitchRenderSource,
    /console\.error\("\[slot controls debug\]"/,
    `${runner}: slot control debug must log to the Debug panel.`
  );
  assert.match(
    pitchRenderSource,
    /document\.addEventListener\("pointerdown",\s*logPitchClick,\s*true\)/,
    `${runner}: slot control debug must capture pointerdown in capture phase.`
  );
  assert.match(
    pitchRenderSource,
    /debugSlotControlClick\("PHOTO handler fired"/,
    `${runner}: PHOTO handler must log when clicked.`
  );
  assert.match(
    pitchRenderSource,
    /debugSlotControlClick\("X handler fired"/,
    `${runner}: X handler must log when clicked.`
  );
  assert.match(
    pitchRenderSource,
    /debugSlotControlClick\("Swap handler fired"/,
    `${runner}: swap handler must log when clicked.`
  );
  assert.match(
    pitchRenderSource,
    /function findFallbackSlotControlAtPoint\(e\)/,
    `${runner}: fallback hit detection required.`
  );
  assert.match(
    pitchRenderSource,
    /debugSlotControlClick\("fallback routed click to control"/,
    `${runner}: fallback routing must be visible in debug.`
  );
  assert.match(
    pitchRenderSource,
    /fallbackControl\.click\(\)/,
    `${runner}: fallback must invoke the real button handler.`
  );
  assert.match(
    pitchRenderSource,
    /if \(!pitchWrap\.contains\(e\.target\)\) return null;/,
    `${runner}: fallback must work for pitch/svg behind controls.`
  );
  assert.match(
    pitchRenderSource,
    /function wireSlotNameEditing\(label,\s*player\)/,
    `${runner}: player name labels need edit wiring.`
  );
  assert.match(
    pitchRenderSource,
    /label\.ondblclick\s*=\s*\(e\)\s*=>/,
    `${runner}: double-click must open edit flow.`
  );
  assert.match(
    pitchRenderSource,
    /Enter a custom player name/,
    `${runner}: edit flow must prompt for custom name.`
  );
  assert.match(
    pitchRenderSource,
    /const SLOT_CONTROL_DEBUG_SELECTOR = "\.slot-photo-fetch-btn, \.slot-photo-delete-btn, \.slot-name-edit-btn, \.slot-swap-btn"/,
    `${runner}: fallback selector must include edit button.`
  );
  assert.match(
    pitchRenderSource,
    /function createSlotNameEditButton\(label,\s*player,\s*slotIndex\)/,
    `${runner}: left-side edit button helper required.`
  );
  assert.match(
    pitchRenderSource,
    /debugSlotControlClick\("Edit name handler fired"/,
    `${runner}: edit button handler must log when clicked.`
  );
  assert.match(
    pitchRenderSource,
    /labelContainer\.append\(editBtn,\s*label,\s*swapBtn\)/,
    `${runner}: edit left, swap right layout required.`
  );
  assert.match(
    pitchRenderSource,
    /export function renderPitch\(\) \{\s*installSlotControlClickDebug\(\);/,
    `${runner}: renderPitch must install slot control debug once.`
  );
}

console.log(`slot-controls hit-test passed for ${runners.length} runners`);
