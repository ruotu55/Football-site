// render/audio-filtergraph.mjs — PURE: audio manifest -> ffmpeg inputs + filter_complex.
// Each "play" event (voice/ticking/stinger) becomes one input, delayed to its virtual
// timestamp and volume-scaled. A continuous BGM bed (if a "bgm" play event exists) is
// reconstructed from the playlist, looped to the video length, and DUCKED to 0.2 during
// every voice window (matching the live app's ducking).
//
// Returns { inputs:[{path,loop?}], filterComplex, finalLabel }.

const DUCK_VOL = 0.2;
const BGM_VOL = 1.0;

export function buildFiltergraph(manifest, opts = {}) {
  const sampleRate = opts.sampleRate || 48000;
  const totalMs = opts.totalMs || lastEventMs(manifest) + 2000;
  const bgmPlaylist = opts.bgmPlaylist || null; // array of absolute paths (resolved by caller)

  const plays = manifest.filter((e) => e.type === "play" && e.kind !== "bgm" && e.src);
  const voices = plays.filter((e) => e.kind === "voice");

  const inputs = [];
  const chains = [];
  const labels = [];

  // --- non-BGM clips (voices, ticking, stinger): place at atMs, scale by volume ---
  plays.forEach((p) => {
    const idx = inputs.length;
    inputs.push({ path: p.src });
    const vol = Number.isFinite(p.volume) && p.volume > 0 ? p.volume : 1;
    const delay = Math.max(0, Math.round(p.atMs));
    const out = `c${idx}`;
    chains.push(
      `[${idx}:a]aformat=sample_rates=${sampleRate}:channel_layouts=stereo,` +
      `volume=${vol.toFixed(3)},adelay=${delay}|${delay}[${out}]`,
    );
    labels.push(`[${out}]`);
  });

  // --- BGM bed: loop playlist to totalMs, duck during voice windows ---
  const bgmStart = manifest.find((e) => e.type === "play" && e.kind === "bgm");
  if (bgmStart && bgmPlaylist && bgmPlaylist.length) {
    // Order the playlist starting at the seeded index, as the live app does.
    const startIdx = Number.isFinite(bgmStart.index) ? bgmStart.index % bgmPlaylist.length : 0;
    const ordered = [];
    for (let i = 0; i < bgmPlaylist.length; i++) ordered.push(bgmPlaylist[(startIdx + i) % bgmPlaylist.length]);

    const bgmInputStart = inputs.length;
    ordered.forEach((path) => inputs.push({ path }));
    const concatIns = ordered.map((_, i) => `[${bgmInputStart + i}:a]`).join("");
    // concat the playlist once, then loop with aloop to cover the whole video, then duck.
    const duckExpr = buildDuckExpr(voices); // volume as function of t (seconds)
    chains.push(
      `${concatIns}concat=n=${ordered.length}:v=0:a=1[bgmseq];` +
      `[bgmseq]aformat=sample_rates=${sampleRate}:channel_layouts=stereo,` +
      `aloop=loop=-1:size=2147483647,atrim=0:${(totalMs / 1000).toFixed(3)},` +
      `volume=eval=frame:volume='${duckExpr}'[bgm]`,
    );
    labels.push(`[bgm]`);
  }

  let filterComplex, finalLabel;
  if (labels.length === 0) {
    filterComplex = `anullsrc=r=${sampleRate}:cl=stereo,atrim=0:${(totalMs / 1000).toFixed(3)}[outa]`;
    finalLabel = "[outa]";
  } else if (labels.length === 1) {
    filterComplex = chains.join(";");
    finalLabel = labels[0];
  } else {
    filterComplex = chains.join(";") + `;${labels.join("")}amix=inputs=${labels.length}:normalize=0:dropout_transition=0[outa]`;
    finalLabel = "[outa]";
  }
  return { inputs, filterComplex, finalLabel, totalMs };
}

// Piecewise volume: DUCK_VOL inside any voice window, else BGM_VOL. t in seconds.
function buildDuckExpr(voices) {
  const windows = voices
    .map((v) => ({ a: v.atMs / 1000, b: (v.stopMs ?? (v.atMs + (v.durMs || 2500))) / 1000 }))
    .filter((w) => w.b > w.a)
    .sort((x, y) => x.a - y.a);
  if (windows.length === 0) return String(BGM_VOL);
  // nested if(between(t,a,b), DUCK, ...) -> BGM_VOL
  let expr = String(BGM_VOL);
  for (let i = windows.length - 1; i >= 0; i--) {
    const w = windows[i];
    expr = `if(between(t,${w.a.toFixed(3)},${w.b.toFixed(3)}),${DUCK_VOL},${expr})`;
  }
  return expr;
}

export function lastEventMs(manifest) {
  let m = 0;
  for (const e of manifest) { if (e.atMs > m) m = e.atMs; if (e.stopMs > m) m = e.stopMs; }
  return m;
}
