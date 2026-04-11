/**
 * Three.js waving flag (ported from classic PlaneGeometry + vertex Z sine wave demo).
 * Loads three from CDN as ES module; no UI controls — uses the demo’s default wave params.
 */
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const [sizeW, sizeH, segW, segH] = [30, 20, 30, 20];
const WAVE_H = 0.5;
const WAVE_V = 0.3;
const WAVE_W = 0.2;
const WAVE_S = 0.5;

export function mountPlayerStatsThreeFlag(flagWrap, flagUrl, ariaLabel) {
  const host = document.createElement("div");
  host.className = "player-stats-national-flag__canvas-host";
  if (ariaLabel) host.setAttribute("aria-label", ariaLabel);
  host.setAttribute("role", "img");
  flagWrap.appendChild(host);

  let rafId = 0;
  let resizeObserver = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let flagMesh = null;
  let flagGeometry = null;
  let flagMaterial = null;
  let texture = null;
  let pole = null;

  function disposeAll() {
    cancelAnimationFrame(rafId);
    rafId = 0;
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (renderer) {
      try {
        renderer.dispose();
      } catch (_) {
        /* ignore */
      }
      renderer.domElement?.remove();
    }
    renderer = null;
    scene = null;
    camera = null;
    flagMesh = null;
    flagGeometry?.dispose();
    flagGeometry = null;
    flagMaterial?.dispose();
    flagMaterial = null;
    texture?.dispose();
    texture = null;
    if (pole) {
      pole.geometry?.dispose();
      pole.material?.dispose();
      pole = null;
    }
  }

  function layoutRenderer() {
    if (!host.isConnected || !renderer || !camera) return;
    const maxH = Math.min(window.innerHeight * 0.896, 563);
    const wrapW = Math.floor(flagWrap.getBoundingClientRect().width);
    let w = Math.max(384, wrapW);
    const ratio = host.dataset.flagAspect ? Number(host.dataset.flagAspect) : sizeW / sizeH;
    let h = Math.round(w / ratio);
    if (h > maxH) {
      h = Math.floor(maxH);
      w = Math.round(h * ratio);
    }
    host.style.width = `${w}px`;
    host.style.height = `${h}px`;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");
  loader.load(
    flagUrl,
    (tex) => {
      if (!flagWrap.isConnected) {
        tex.dispose();
        return;
      }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearFilter;
      texture = tex;

      const img = tex.image;
      const aspect =
        img && img.width > 0 && img.height > 0 ? img.width / img.height : sizeW / sizeH;
      host.dataset.flagAspect = String(aspect);

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(60, 1, 1, 1000);
      camera.position.set(0, 0, 40);
      camera.lookAt(0, 0, 0);

      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        premultipliedAlpha: false,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      host.appendChild(renderer.domElement);

      const dirLight = new THREE.DirectionalLight(0xffffff, 1);
      dirLight.position.set(10, 50, 100);
      scene.add(dirLight);
      scene.add(new THREE.AmbientLight(0x999999));

      const poleGeo = new THREE.CylinderGeometry(0.5, 0.5, 40, 16, 1);
      const poleMat = new THREE.MeshPhongMaterial({
        color: 0xffcc99,
        specular: 0x999999,
        shininess: 30,
        transparent: false,
        opacity: 1,
      });
      pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(-15, -10, 0);
      scene.add(pole);

      flagGeometry = new THREE.PlaneGeometry(sizeW, sizeH, segW, segH);
      flagMaterial = new THREE.MeshLambertMaterial({
        color: 0xffffff,
        map: texture,
        side: THREE.DoubleSide,
        transparent: false,
        opacity: 1,
        depthWrite: true,
      });
      flagMesh = new THREE.Mesh(flagGeometry, flagMaterial);
      scene.add(flagMesh);

      const tick = () => {
        if (!flagMesh || !flagGeometry || !renderer || !scene || !camera) return;
        if (!host.isConnected) {
          disposeAll();
          return;
        }
        const positions = flagGeometry.attributes.position;
        const h = WAVE_H;
        const v = WAVE_V;
        const wv = WAVE_W;
        const s = WAVE_S;
        const time = Date.now() * (s / 50);
        for (let y = 0; y <= segH; y += 1) {
          for (let x = 0; x <= segW; x += 1) {
            const index = x + y * (segW + 1);
            const z = Math.sin(h * x + v * y - time) * ((wv * x) / 4);
            positions.setZ(index, z);
          }
        }
        positions.needsUpdate = true;
        flagGeometry.computeVertexNormals();
        renderer.render(scene, camera);
        rafId = requestAnimationFrame(tick);
      };

      layoutRenderer();
      resizeObserver = new ResizeObserver(() => layoutRenderer());
      resizeObserver.observe(flagWrap);

      rafId = requestAnimationFrame(tick);
    },
    undefined,
    () => {
      disposeAll();
      flagWrap.remove();
    },
  );

  flagWrap._playerStatsThreeFlagCleanup = () => {
    disposeAll();
    delete flagWrap._playerStatsThreeFlagCleanup;
  };
}
