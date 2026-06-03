// js/remotion-config-modal.js — Quality/FPS chooser for Remotion render.
const RES = [
  { key: "1080p", label: "1080p Full HD", w: 1920, h: 1080 },
  { key: "1440p", label: "1440p Quad HD", w: 2560, h: 1440 },
  { key: "4k",    label: "4K Ultra HD",   w: 3840, h: 2160 },
];
const FPS = [30, 60];

export function openRemotionConfigModal() {
  return new Promise((resolve) => {
    const ov = document.createElement("div");
    ov.className = "remotion-config-overlay";
    ov.innerHTML = `
      <div class="remotion-config-modal" role="dialog" aria-modal="true">
        <h2>Render Video</h2>
        <div class="rc-group"><div class="rc-label">Quality</div>
          <div class="rc-options rc-res">${RES.map((r,i)=>`<button data-res="${r.key}" class="${i===1?'sel':''}">${r.label}</button>`).join("")}</div></div>
        <div class="rc-group"><div class="rc-label">Frame rate</div>
          <div class="rc-options rc-fps">${FPS.map(f=>`<button data-fps="${f}" class="${f===60?'sel':''}">${f} FPS${f===60?' · fluid':''}</button>`).join("")}</div></div>
        <div class="rc-actions"><button class="rc-cancel">Cancel</button><button class="rc-confirm">Render</button></div>
      </div>`;
    document.body.appendChild(ov);
    let res = "1440p", fps = 60;
    ov.querySelector(".rc-res").onclick = (e) => { const b=e.target.closest("button"); if(!b)return; ov.querySelectorAll(".rc-res button").forEach(x=>x.classList.remove("sel")); b.classList.add("sel"); res=b.dataset.res; };
    ov.querySelector(".rc-fps").onclick = (e) => { const b=e.target.closest("button"); if(!b)return; ov.querySelectorAll(".rc-fps button").forEach(x=>x.classList.remove("sel")); b.classList.add("sel"); fps=Number(b.dataset.fps); };
    const close = (v) => { ov.remove(); resolve(v); };
    ov.querySelector(".rc-cancel").onclick = () => close(null);
    ov.querySelector(".rc-confirm").onclick = () => { const r=RES.find(x=>x.key===res); close({ width:r.w, height:r.h, fps }); };
    ov.onclick = (e) => { if (e.target === ov) close(null); };
  });
}
