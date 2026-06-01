import {
  ensureMergeLiquidSoccerBalls,
  getPreloaderMainSphere,
} from "./ball-merge-soccer-clones.js";

/** 4 soccer-ball clones orbit inward and merge into a single ball that lands
 *  exactly on the real preloader ball, then hands off in one frame. */
export function playBallMerge(gsap, preloader, geom) {
  const merge = preloader.querySelector(".ball-merge");
  const goo = merge?.querySelector(".ball-merge-goo");
  const liquids = merge ? merge.querySelectorAll(".merge-liquid") : [];
  if (!merge || !goo || liquids.length < 4 || !geom) return Promise.resolve();

  ensureMergeLiquidSoccerBalls(preloader);
  merge.hidden = false;
  merge.style.opacity = "1";

  gsap.set(goo, { x: 0, y: 0, rotation: 0 });
  const gr = goo.getBoundingClientRect();
  gsap.set(goo, { x: geom.cx - (gr.left + gr.width / 2), y: geom.cy - (gr.top + gr.height / 2) });

  const FINAL = geom.scale;
  const R = 116;
  const starts = [[0, -R], [R, 0], [0, R], [-R, 0]];
  liquids.forEach((el, i) => {
    gsap.set(el, { x: starts[i][0], y: starts[i][1], scale: 0.2, opacity: 1, force3D: true });
  });

  return new Promise((resolve) => {
    let resolved = false;
    const handoff = () => {
      if (resolved) return;
      resolved = true;
      gsap.set(geom.ball, { opacity: 1 });
      merge.hidden = true;
      merge.style.opacity = "";
      gsap.set(liquids, { clearProps: "transform,opacity" });
      gsap.set(goo, { clearProps: "transform" });
      resolve();
    };
    const tl = gsap.timeline({ onComplete: handoff });
    tl.to(liquids, { duration: 0.42, scale: 1.0, ease: "back.out(1.7)", stagger: 0.05, force3D: true }, 0);
    tl.to(goo, { duration: 1.05, rotation: 360, ease: "power1.inOut" }, 0);
    tl.to(liquids, { duration: 0.52, x: 0, y: 0, ease: "power2.inOut", force3D: true }, 0.45);
    tl.to(liquids, { duration: 0.34, scale: FINAL, ease: "power2.in", force3D: true }, 0.63);
  });
}

/** Ball-drop preloader: 4-ball merge → bounce → expand → reveal landing. */
export function playBallPreloader(loadGsap) {
  const preloader = document.getElementById("ball-preloader");
  const ball = preloader?.querySelector(".ball-preloader-ball");
  if (!preloader || !ball) {
    console.warn("[ball-preloader] element not found, skipping");
    return Promise.resolve();
  }

  ball.removeAttribute("style");
  ball.style.opacity = "0";
  preloader.hidden = false;

  (function mirrorDomBackgroundOverlays() {
    preloader.querySelectorAll(".ball-bg-mirror").forEach((el) => el.remove());
    ["shared-background-emojis", "shared-background-question-marks"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        const clone = el.cloneNode(true);
        clone.removeAttribute("id");
        clone.className = "ball-bg-mirror " + el.className;
        clone.style.zIndex = "2";
        preloader.appendChild(clone);
      }
    });
  })();

  return loadGsap().then((gsap) => {
    gsap.set(ball, { clearProps: "all" });
    gsap.set(ball, {
      opacity: 0,
      force3D: true,
      willChange: "transform, opacity",
    });

    const layer1 = preloader.querySelector(".ball-layer-1");
    const layer2 = preloader.querySelector(".ball-layer-2");

    gsap.set(layer1, { "--reveal-r": "0px" });
    gsap.set(layer2, { "--reveal-r": "0px" });

    const maxR = Math.ceil(Math.hypot(window.innerWidth, window.innerHeight)) + "px";

    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        const HANDOFF_SCALE = 1.6;
        gsap.set(ball, { top: "calc(50vh - 60px)", zIndex: 4, opacity: 0 });
        const sphere = getPreloaderMainSphere(preloader);
        {
          const r0 = (sphere ?? ball).getBoundingClientRect();
          const b0 = ball.getBoundingClientRect();
          const ox = (r0.left + r0.width / 2) - b0.left;
          const oy = (r0.top + r0.height / 2) - b0.top;
          gsap.set(ball, { transformOrigin: `${ox}px ${oy}px`, scale: HANDOFF_SCALE, force3D: true });
        }
        const rs = (sphere ?? ball).getBoundingClientRect();
        const geom = { cx: rs.left + rs.width / 2, cy: rs.top + rs.height / 2, scale: HANDOFF_SCALE, ball };

        playBallMerge(gsap, preloader, geom).then(() => {
          const tl = gsap.timeline();

          tl.fromTo(
            ball,
            { scale: HANDOFF_SCALE },
            { duration: 1.8, scale: 1.0, ease: "elastic.out(1, 0.5)", force3D: true },
            0,
          )
            .call(() => {
              const sph = getPreloaderMainSphere(preloader);
              const r = (sph ?? ball).getBoundingClientRect();
              const cx = Math.round(r.left + r.width / 2) + "px";
              const cy = Math.round(r.top + r.height / 2) + "px";

              preloader.querySelectorAll(".ball-bg-mirror").forEach((el) => el.remove());
              layer1.style.cssText = "";

              preloader.style.setProperty("--reveal-cx", cx);
              preloader.style.setProperty("--reveal-cy", cy);
              preloader.classList.add("revealing");
              gsap.set(preloader, { "--reveal-r": "0px" });

              const diag = Math.hypot(window.innerWidth, window.innerHeight);
              ball._expandScale = Math.ceil((diag * 3) / r.width);

              const bRect = ball.getBoundingClientRect();
              const ox = (r.left + r.width / 2) - bRect.left;
              const oy = (r.top + r.height / 2) - bRect.top;
              gsap.set(ball, { transformOrigin: `${ox}px ${oy}px`, force3D: true });
            }, null, 0.7)
            .to(ball, {
              scale: () => ball._expandScale,
              duration: 1.6,
              ease: "none",
              force3D: true,
            }, 0.7)
            .to(preloader, {
              "--reveal-r": maxR,
              duration: 1.3,
              ease: "none",
            }, "<+=0.3")
            .set(preloader, {
              onComplete: () => {
                preloader.hidden = true;
                preloader.classList.remove("revealing");
                preloader.querySelectorAll(".ball-bg-mirror").forEach((el) => el.remove());
                layer1.removeAttribute("style");
                gsap.set([ball, layer1, layer2], { clearProps: "all" });
                resolve();
              },
            });
        });
      });
    });
  }).catch((err) => {
    console.error("[ball-preloader] GSAP failed:", err);
    preloader.hidden = true;
  });
}
