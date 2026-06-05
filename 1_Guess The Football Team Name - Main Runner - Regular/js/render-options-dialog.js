/**
 * render-options-dialog.js — "Render options" modal for the main Render Video button.
 *
 * Lets the user pick FPS (30 / 60) and resolution (1080p / 2560×1440 / 4K) before a
 * full render. Test-clip renders do NOT use this — they stay 1080p @ 30fps.
 *
 *   const opts = await askRenderOptions();   // { fps, height } | null
 *   if (!opts) return;   // user cancelled
 *
 * height maps straight to the render driver's --height (16:9 width is derived there):
 *   1080 → 1920×1080, 1440 → 2560×1440 (current default), 2160 → 3840×2160.
 */

const FPS_OPTIONS = [
  { value: 30, label: "30 fps" },
  { value: 60, label: "60 fps" },
];
const RES_OPTIONS = [
  { value: 1080, label: "1080p", sub: "1920×1080" },
  { value: 1440, label: "Current", sub: "2560×1440" },
  { value: 2160, label: "4K", sub: "3840×2160" },
];
const DEFAULT_FPS = 60;
const DEFAULT_HEIGHT = 1440;

export function askRenderOptions() {
  return new Promise((resolve) => {
    const existing = document.getElementById("render-options-dialog");
    if (existing) existing.remove();

    let fps = DEFAULT_FPS;
    let height = DEFAULT_HEIGHT;

    const root = document.createElement("div");
    root.id = "render-options-dialog";
    Object.assign(root.style, {
      position: "fixed", inset: "0", zIndex: "100300",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.74)",
    });

    const chip = (group, value, label, sub, selected) =>
      `<button type="button" data-group="${group}" data-value="${value}" class="render-opt-chip${selected ? " is-selected" : ""}" style="
        flex:1; min-width:84px; padding:12px 10px; border-radius:10px; cursor:pointer;
        border:2px solid ${selected ? "#22c55e" : "#3a4252"};
        background:${selected ? "rgba(34,197,94,0.16)" : "#222a39"}; color:#fff;
        font-weight:700; font-size:15px; line-height:1.15; text-align:center;">
        ${label}${sub ? `<br><span style="font-weight:500;font-size:12px;opacity:.7;">${sub}</span>` : ""}
      </button>`;

    root.innerHTML = `
      <div role="dialog" aria-label="Render options" style="
        background:#1d2330; color:#fff; border-radius:16px; padding:26px 28px;
        min-width:360px; max-width:92vw; text-align:center;
        box-shadow:0 22px 70px rgba(0,0,0,.55); font-family:inherit;">
        <h3 style="margin:0 0 18px; font-size:21px;">Render options</h3>

        <div style="text-align:left; margin:0 0 16px;">
          <div style="font-size:13px; font-weight:700; letter-spacing:.04em; opacity:.65; margin:0 0 8px; text-transform:uppercase;">Frame rate</div>
          <div data-row="fps" style="display:flex; gap:10px;">
            ${FPS_OPTIONS.map((o) => chip("fps", o.value, o.label, "", o.value === fps)).join("")}
          </div>
        </div>

        <div style="text-align:left; margin:0 0 22px;">
          <div style="font-size:13px; font-weight:700; letter-spacing:.04em; opacity:.65; margin:0 0 8px; text-transform:uppercase;">Resolution</div>
          <div data-row="height" style="display:flex; gap:10px;">
            ${RES_OPTIONS.map((o) => chip("height", o.value, o.label, o.sub, o.value === height)).join("")}
          </div>
        </div>

        <div style="display:flex; gap:11px;">
          <button type="button" data-action="cancel" style="
            flex:1; padding:13px 18px; font-size:16px; font-weight:700; border:0;
            border-radius:10px; cursor:pointer; background:#374151; color:#cbd5e1;">Cancel</button>
          <button type="button" data-action="render" style="
            flex:2; padding:13px 18px; font-size:16px; font-weight:800; border:0;
            border-radius:10px; cursor:pointer; background:#16a34a; color:#fff;">Render</button>
        </div>
      </div>`;

    document.body.appendChild(root);

    const refreshGroup = (group) => {
      const selectedVal = group === "fps" ? fps : height;
      root.querySelectorAll(`[data-group="${group}"]`).forEach((b) => {
        const on = Number(b.getAttribute("data-value")) === selectedVal;
        b.classList.toggle("is-selected", on);
        b.style.border = `2px solid ${on ? "#22c55e" : "#3a4252"}`;
        b.style.background = on ? "rgba(34,197,94,0.16)" : "#222a39";
      });
    };

    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); done(null); } };
    const done = (val) => {
      root.remove();
      document.removeEventListener("keydown", onKey);
      resolve(val || null);
    };

    root.addEventListener("click", (e) => {
      if (e.target === root) { done(null); return; }            // backdrop = cancel
      const action = e.target.closest("[data-action]");
      if (action) {
        if (action.getAttribute("data-action") === "render") done({ fps, height });
        else done(null);
        return;
      }
      const chipEl = e.target.closest("[data-group]");
      if (!chipEl) return;
      const group = chipEl.getAttribute("data-group");
      const value = Number(chipEl.getAttribute("data-value"));
      if (group === "fps") fps = value; else height = value;
      refreshGroup(group);
    });
    document.addEventListener("keydown", onKey);
  });
}
