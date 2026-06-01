/** Clone the landing preloader soccer ball into each .merge-liquid slot (4-ball merge intro). */

/** Main preloader ball only — not the temporary merge clones. */
export function getPreloaderMainSphere(preloader) {
  return preloader?.querySelector(".ball-preloader-ball .ball-sphera") ?? null;
}

export function ensureMergeLiquidSoccerBalls(preloader) {
  const template = preloader?.querySelector(".ball-preloader-ball .ball");
  if (!template) return;

  preloader.querySelectorAll(".merge-liquid").forEach((slot) => {
    if (slot.querySelector(".merge-liquid-ball")) return;
    const wrap = document.createElement("div");
    wrap.className = "merge-liquid-ball";
    const scale = document.createElement("div");
    scale.className = "merge-liquid-ball-scale";
    scale.appendChild(template.cloneNode(true));
    wrap.appendChild(scale);
    slot.replaceChildren(wrap);
  });
}
