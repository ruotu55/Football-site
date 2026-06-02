/**
 * record-language-chooser.js — shared "Record which language?" modal.
 *
 * Used by every runner's Record Video button so the user records ONE language at a
 * time (English or Spanish) instead of always recording both back-to-back. "Both"
 * is still offered for the old behaviour.
 *
 *   const choice = await askRecordingLanguage();  // "english" | "spanish" | "both" | null
 *   if (!choice) return;   // user cancelled
 */

export function askRecordingLanguage() {
  return new Promise((resolve) => {
    const existing = document.getElementById("rec-lang-chooser");
    if (existing) existing.remove();

    const root = document.createElement("div");
    root.id = "rec-lang-chooser";
    Object.assign(root.style, {
      position: "fixed", inset: "0", zIndex: "100300",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.74)",
    });

    const btn = (label, lang, bg) =>
      `<button type="button" data-lang="${lang}" style="
        display:block; width:100%; margin:0; padding:14px 18px; font-size:17px;
        font-weight:700; letter-spacing:.02em; border:0; border-radius:10px;
        cursor:pointer; background:${bg}; color:#fff;">${label}</button>`;

    root.innerHTML = `
      <div role="dialog" aria-label="Record which language" style="
        background:#1d2330; color:#fff; border-radius:16px; padding:26px 28px;
        min-width:320px; max-width:90vw; text-align:center;
        box-shadow:0 22px 70px rgba(0,0,0,.55); font-family:inherit;">
        <h3 style="margin:0 0 6px; font-size:21px;">Record which language?</h3>
        <p style="margin:0 0 20px; opacity:.7; font-size:14px;">Record one at a time — or both back‑to‑back.</p>
        <div style="display:flex; flex-direction:column; gap:11px;">
          ${btn("English", "english", "#2563eb")}
          ${btn("Spanish", "spanish", "#c2410c")}
          ${btn("Both (English → Spanish)", "both", "#374151")}
        </div>
        <button type="button" data-lang="" style="
          margin-top:18px; background:transparent; color:#9aa3b2; border:0;
          cursor:pointer; font-size:14px;">Cancel</button>
      </div>`;

    document.body.appendChild(root);

    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); done(null); } };
    const done = (val) => {
      root.remove();
      document.removeEventListener("keydown", onKey);
      resolve(val || null);
    };

    root.addEventListener("click", (e) => {
      if (e.target === root) { done(null); return; }      // backdrop click = cancel
      const b = e.target.closest("[data-lang]");
      if (!b) return;
      done(b.getAttribute("data-lang"));
    });
    document.addEventListener("keydown", onKey);
  });
}
