/**
 * Three.js waving flag – realistic wooden pole with cap, waving cloth with
 * folds, shadows and fabric texture (self-shadowing via normal perturbation).
 */
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const FLAG_W = 30;
const FLAG_H = 20;
const SEG_W = 60;
const SEG_H = 40;

/* 10-second seamless loop.  Every sine uses an integer harmonic of the
   loop frequency so all waves complete exact full cycles → the end
   position is identical to the start position → perfectly smooth loop. */
const LOOP_DUR = 7;                         /* seconds */
const TWO_PI   = Math.PI * 2;

/* ------------------------------------------------------------------ */
/* Pole helpers                                                        */
/* ------------------------------------------------------------------ */

/** Procedural wood-grain texture (canvas-based). */
function createWoodTexture(w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  /* Base colour – dark rich wood */
  const baseGrad = ctx.createLinearGradient(0, 0, w, 0);
  baseGrad.addColorStop(0, "#5c2e0e");
  baseGrad.addColorStop(0.3, "#6b3a1f");
  baseGrad.addColorStop(0.6, "#5a2d10");
  baseGrad.addColorStop(1, "#6b3a1f");
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, w, h);

  /* Vertical grain lines – fine and varied for realistic wood */
  for (let i = 0; i < 180; i++) {
    const x = Math.random() * w;
    const lightness = 18 + Math.random() * 22;
    ctx.strokeStyle = `hsl(22, 60%, ${lightness}%)`;
    ctx.lineWidth = 0.3 + Math.random() * 1.2;
    ctx.globalAlpha = 0.12 + Math.random() * 0.2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    for (let y = 0; y < h; y += 6) {
      ctx.lineTo(x + Math.sin(y * 0.03 + i * 0.7) * 1.5, y);
    }
    ctx.stroke();
  }

  /* Lighter highlights for cylindrical sheen */
  ctx.globalAlpha = 0.12;
  const sheen = ctx.createLinearGradient(0, 0, w, 0);
  sheen.addColorStop(0, "transparent");
  sheen.addColorStop(0.35, "rgba(255,220,180,0.4)");
  sheen.addColorStop(0.5, "rgba(255,230,200,0.5)");
  sheen.addColorStop(0.65, "rgba(255,220,180,0.4)");
  sheen.addColorStop(1, "transparent");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);

  /* Occasional knots */
  ctx.globalAlpha = 0.22;
  for (let k = 0; k < 5; k++) {
    const kx = Math.random() * w;
    const ky = Math.random() * h;
    const kr = 2 + Math.random() * 5;
    const grad = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr);
    grad.addColorStop(0, "#2a1505");
    grad.addColorStop(0.6, "#3d1e0a");
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(kx, ky, kr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Build the full pole group: tapered cylinder + spherical gold cap. */
function buildPole(scene) {
  const group = new THREE.Group();

  /* Main shaft – extends all the way down past the visible area */
  const poleH = 50;
  const geo = new THREE.CylinderGeometry(0.42, 0.58, poleH, 24, 1);
  const woodTex = createWoodTexture(128, 512);
  const mat = new THREE.MeshPhongMaterial({
    map: woodTex,
    color: 0x6b3a1f,
    specular: 0x3a2010,
    shininess: 25,
    emissive: 0x1a0800,
  });
  const mesh = new THREE.Mesh(geo, mat);
  /* Shift shaft down so top aligns with flag top, bottom goes off-screen */
  mesh.position.set(0, -poleH / 2 + FLAG_H / 2 + 1.5, 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  /* Wooden cap / finial – matches the pole */
  const capGeo = new THREE.SphereGeometry(1.0, 24, 16);
  const capMat = new THREE.MeshPhongMaterial({
    map: woodTex,
    color: 0x6b3a1f,
    specular: 0x3a2010,
    shininess: 25,
    emissive: 0x1a0800,
  });
  const cap = new THREE.Mesh(capGeo, capMat);
  cap.position.set(0, FLAG_H / 2 + 2.2, 0);
  cap.castShadow = true;
  group.add(cap);

  /* Small silver ring under the cap */
  const ringGeo = new THREE.TorusGeometry(0.65, 0.18, 12, 24);
  const ringMat = new THREE.MeshPhongMaterial({
    color: 0xa8a8a8,
    specular: 0xffffff,
    shininess: 100,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, FLAG_H / 2 + 1.3, 0);
  ring.castShadow = true;
  group.add(ring);

  /* --- Two metal hooks that hold the flag --- */
  const hookMat = new THREE.MeshPhongMaterial({
    color: 0x888888,
    specular: 0xcccccc,
    shininess: 80,
  });

  const hookDisposables = [];
  /* Metal ring clamps around the pole + pins going out to the flag grommets.
     Y positions match the grommet vertices (iy=1 and iy=SEG_H-1). */
  const stepY = FLAG_H / SEG_H;
  const hookYPositions = [FLAG_H / 2 - stepY, -FLAG_H / 2 + stepY];

  for (const hy of hookYPositions) {
    /* Metal ring/band that wraps around the pole */
    const bandGeo = new THREE.TorusGeometry(0.62, 0.1, 12, 24);
    const band = new THREE.Mesh(bandGeo, hookMat);
    band.position.set(0, hy, 0);
    band.rotation.x = Math.PI / 2;
    band.castShadow = true;
    group.add(band);
    hookDisposables.push(bandGeo);

    /* Pin extending from the band out toward the flag grommet */
    const pinGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.45, 8, 1);
    const pin = new THREE.Mesh(pinGeo, hookMat);
    pin.rotation.z = Math.PI / 2;
    pin.position.set(0.83, hy, 0);
    pin.castShadow = true;
    group.add(pin);
    hookDisposables.push(pinGeo);
  }

  /* Position pole to the left of the flag */
  group.position.set(-FLAG_W / 2 - 0.4, 0, 0);
  scene.add(group);

  return { group, dispose() {
    [geo, mat, woodTex, capGeo, capMat, ringGeo, ringMat, hookMat, ...hookDisposables].forEach(o => o.dispose());
  }};
}

/* ------------------------------------------------------------------ */
/* Flag cloth                                                          */
/* ------------------------------------------------------------------ */

/** Simple fabric-weave overlay drawn on a canvas. */
function createFabricOverlay(w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  /* Subtle cross-hatch weave */
  ctx.fillStyle = "rgba(0,0,0,0)";
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 0.5;
  for (let x = 0; x < w; x += 3) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += 3) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* ------------------------------------------------------------------ */
/* Custom shader material for the flag – adds fabric texture + shadow  */
/* ------------------------------------------------------------------ */
function createFlagMaterial(flagTexture) {
  const fabricTex = createFabricOverlay(256, 256);

  const mat = new THREE.MeshPhongMaterial({
    map: flagTexture,
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
    shininess: 12,
    specular: new THREE.Color(0x222222),
    bumpMap: fabricTex,
    bumpScale: 0.35,
  });

  /* Store reference for disposal */
  mat._fabricTex = fabricTex;
  return mat;
}

/* ------------------------------------------------------------------ */
/* Main export                                                         */
/* ------------------------------------------------------------------ */
export function mountPlayerStatsThreeFlag(flagWrap, flagUrl, ariaLabel, onFirstPaint = null) {
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
  let poleObj = null;
  let basePositions = null;

  function disposeAll() {
    cancelAnimationFrame(rafId);
    rafId = 0;
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (renderer) {
      try { renderer.dispose(); } catch (_) { /* ignore */ }
      renderer.domElement?.remove();
    }
    renderer = null;
    scene = null;
    camera = null;
    if (flagMesh?._grommets) {
      flagMesh._grommets.forEach(g => { g.rimGeo.dispose(); g.holeGeo.dispose(); });
      flagMesh._grommetMat?.dispose();
      flagMesh._holeMat?.dispose();
    }
    flagMesh = null;
    flagGeometry?.dispose();
    flagGeometry = null;
    if (flagMaterial) {
      flagMaterial._fabricTex?.dispose();
      flagMaterial.dispose();
    }
    flagMaterial = null;
    texture?.dispose();
    texture = null;
    poleObj?.dispose();
    poleObj = null;
    basePositions = null;
  }

  const [sizeW, sizeH] = [FLAG_W, FLAG_H];

  function layoutRenderer() {
    if (!host.isConnected || !renderer || !camera) return;
    /* Fixed size so the flag is identical across all levels regardless of aspect ratio */
    const fixedRatio = sizeW / sizeH;                       /* 30/20 = 1.5 */
    const maxH = Math.min(window.innerHeight * 0.605, 381);
    const wrapW = Math.floor(flagWrap.getBoundingClientRect().width);
    let w = Math.max(259, wrapW);
    let h = Math.round(w / fixedRatio);
    if (h > maxH) {
      h = Math.floor(maxH);
      w = Math.round(h * fixedRatio);
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
      if (!flagWrap.isConnected) { tex.dispose(); return; }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.anisotropy = 4;
      texture = tex;

      const img = tex.image;
      const aspect = img && img.width > 0 && img.height > 0
        ? img.width / img.height : sizeW / sizeH;
      host.dataset.flagAspect = String(aspect);

      /* ---- Scene ---- */
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(60, 1, 1, 1000);
      camera.position.set(0, 0, 40);
      camera.lookAt(0, 0, 0);

      /* ---- Renderer ---- */
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        premultipliedAlpha: false,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      host.appendChild(renderer.domElement);

      /* ---- Lighting ---- */
      const dirLight = new THREE.DirectionalLight(0xfff5e6, 1.5);
      dirLight.position.set(20, 25, 40);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.width = 1024;
      dirLight.shadow.mapSize.height = 1024;
      dirLight.shadow.camera.near = 1;
      dirLight.shadow.camera.far = 120;
      dirLight.shadow.camera.left = -30;
      dirLight.shadow.camera.right = 30;
      dirLight.shadow.camera.top = 30;
      dirLight.shadow.camera.bottom = -30;
      dirLight.shadow.bias = -0.002;
      scene.add(dirLight);

      /* Fill light from front-below for softer shadows */
      const fillLight = new THREE.DirectionalLight(0xc4d4ff, 0.35);
      fillLight.position.set(-5, -10, 40);
      scene.add(fillLight);

      scene.add(new THREE.AmbientLight(0x888899, 0.4));

      /* ---- Pole ---- */
      poleObj = buildPole(scene);

      /* ---- Flag geometry ---- */
      flagGeometry = new THREE.PlaneGeometry(FLAG_W, FLAG_H, SEG_W, SEG_H);

      /* Store rest positions for wave computation */
      const posAttr = flagGeometry.attributes.position;
      basePositions = new Float32Array(posAttr.array.length);
      basePositions.set(posAttr.array);

      /* ---- Flag material ---- */
      flagMaterial = createFlagMaterial(texture);

      flagMesh = new THREE.Mesh(flagGeometry, flagMaterial);
      /* No uniform offset — corners touch the pole, curve is per-vertex */
      flagMesh.position.x = 0;
      flagMesh.castShadow = true;
      flagMesh.receiveShadow = true;
      scene.add(flagMesh);

      /* No separate hem mesh — the sewn fold is done by curling the
         leftmost columns of the flag geometry itself in the tick loop. */

      /* ---- Grommet eyelets on the flag corners ---- */
      /* Metal rings + dark hole centers, added as children of flagMesh so
         they inherit its transforms. Each frame we reposition them on the
         flag vertex and orient them along the local surface normal. */
      const grommetMat = new THREE.MeshPhongMaterial({
        color: 0xb0b0b0,
        specular: 0xffffff,
        shininess: 110,
        emissive: 0x222222,
      });
      const holeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
      const grommets = [];

      /* Two grommet vertex indices: near top-left & bottom-left, slightly inset */
      const GROMMET_IX = 1;
      const grommetIYs = [1, SEG_H - 1];
      for (const giy of grommetIYs) {
        const rimGeo = new THREE.TorusGeometry(0.3, 0.09, 12, 24);
        const rim = new THREE.Mesh(rimGeo, grommetMat);
        flagMesh.add(rim);

        const holeGeo = new THREE.CircleGeometry(0.22, 20);
        const hole = new THREE.Mesh(holeGeo, holeMat);
        flagMesh.add(hole);

        grommets.push({ rim, rimGeo, hole, holeGeo, vertIdx: GROMMET_IX + giy * (SEG_W + 1) });
      }
      flagMesh._grommets = grommets;
      flagMesh._grommetMat = grommetMat;
      flagMesh._holeMat = holeMat;

      /* ---- Animation state (per-instance) ---- */
      let elapsed = 0;
      let prevTimestamp = 0;
      let didNotifyFirstPaint = false;

      /* ---- Animation loop ---- */
      const tick = (timestamp) => {
        if (!flagMesh || !flagGeometry || !renderer || !scene || !camera) return;
        if (!host.isConnected) { disposeAll(); return; }

        /* Delta-time in seconds, capped to prevent jumps on tab-switch */
        if (!prevTimestamp) prevTimestamp = timestamp;
        const dt = Math.min((timestamp - prevTimestamp) / 1000, 0.05);
        prevTimestamp = timestamp;
        elapsed += dt;

        /* θ goes 0→2π over exactly LOOP_DUR seconds, then wraps.
           Every sine below uses an INTEGER harmonic of θ, so all waves
           complete whole cycles and the loop point is seamless. */
        const theta = (elapsed % LOOP_DUR) / LOOP_DUR * TWO_PI;

        const positions = flagGeometry.attributes.position;

        for (let iy = 0; iy <= SEG_H; iy++) {
          for (let ix = 0; ix <= SEG_W; ix++) {
            const idx = ix + iy * (SEG_W + 1);
            const baseX = basePositions[idx * 3];
            const baseY = basePositions[idx * 3 + 1];

            const t  = ix / SEG_W;   /* 0 = pole, 1 = free edge */
            const ty = iy / SEG_H;   /* 0 = top,  1 = bottom    */

            /* --- Left edge crescent curve --- */
            const bowAmount = Math.sin(ty * Math.PI) * 0.45 * (1 - t) * (1 - t);

            /* 4 wave layers using integer harmonics (6, 9, 14, 20).
               All integers → perfect seamless loop.
               h6  = broad swell, h9 = medium billow,
               h14 = fold detail, h20 = surface ripple. */
            const w1 = Math.sin(0.25 * ix - 6  * theta + 0.08 * iy);
            const w2 = Math.sin(0.50 * ix - 9  * theta + 0.16 * iy + 1.9);
            const w3 = Math.sin(0.80 * ix - 14 * theta + 0.24 * iy + 3.7);
            const w4 = Math.sin(1.10 * ix - 20 * theta + 0.35 * iy + 0.8);

            /* Dampen the free edge: wave builds from pole to ~70% of the
               flag, then eases off toward the tip so it never flips over. */
            const tWave = t * (1.0 - 0.45 * t * t);

            /* --- X: horizontal wave folds --- */
            const xWave =
              w1 * 1.5  * tWave +
              w2 * 0.65 * tWave +
              w3 * 0.15 * tWave * t +
              w4 * 0.05 * tWave * t;
            const x = baseX + bowAmount + xWave;

            /* --- Z: depth folds (3D billowing + shadows) --- */
            const zWave =
              w1 * 1.8  * tWave +
              w2 * 0.8  * tWave +
              w3 * 0.20 * tWave * t +
              w4 * 0.07 * tWave * t;

            /* Sewn fold: first columns curl behind the flag */
            const foldRange = 2;
            let sewFold = 0;
            if (ix < foldRange) {
              const foldT = 1 - (ix / foldRange);
              sewFold = -foldT * 0.8;
            }
            const z = zWave + sewFold;

            /* --- Y: gravity sag + gentle flutter --- */
            const sag = t * t * 0.3;
            const flutter =
              Math.sin(0.30 * ix - 6  * theta + 0.10 * iy + 2.1) * 0.15 * t +
              Math.sin(0.55 * ix - 14 * theta + 0.22 * iy + 4.5) * 0.05 * t * t;
            const y = baseY - sag + flutter;

            positions.setXYZ(idx, x, y, z);
          }
        }

        positions.needsUpdate = true;
        flagGeometry.computeVertexNormals();

        /* Move & orient grommets to sit on the flag surface */
        if (flagMesh._grommets) {
          const normals = flagGeometry.attributes.normal;
          for (const g of flagMesh._grommets) {
            const vi = g.vertIdx;
            const vx = positions.getX(vi);
            const vy = positions.getY(vi);
            const vz = positions.getZ(vi);
            const nx = normals.getX(vi);
            const ny = normals.getY(vi);
            const nz = normals.getZ(vi);

            /* Position slightly in front of surface along normal */
            g.rim.position.set(vx + nx * 0.12, vy + ny * 0.12, vz + nz * 0.12);
            g.hole.position.set(vx + nx * 0.10, vy + ny * 0.10, vz + nz * 0.10);

            /* Orient to face along the surface normal */
            const target = new THREE.Vector3(vx + nx, vy + ny, vz + nz);
            g.rim.lookAt(target);
            g.hole.lookAt(target);
          }
        }

        renderer.render(scene, camera);
        if (!didNotifyFirstPaint) {
          didNotifyFirstPaint = true;
          try {
            onFirstPaint?.();
          } catch (_) {
            /* ignore */
          }
        }
        rafId = requestAnimationFrame(tick);
      };

      layoutRenderer();
      resizeObserver = new ResizeObserver(() => layoutRenderer());
      resizeObserver.observe(flagWrap);
      rafId = requestAnimationFrame((ts) => { prevTimestamp = ts; tick(ts); });
    },
    undefined,
    () => {
      try {
        onFirstPaint?.();
      } catch (_) {
        /* ignore */
      }
      disposeAll();
      flagWrap.remove();
    },
  );

  flagWrap._playerStatsThreeFlagCleanup = () => {
    disposeAll();
    delete flagWrap._playerStatsThreeFlagCleanup;
  };
}
