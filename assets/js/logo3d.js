/* 3D chrome logo for the final slide (three.js r149, global build)
   Tuned for frame rate: one cheap PBR pass (no transmission pass), a canvas
   that only covers the logo area, and a pixel ratio that adapts to the GPU. */
(() => {
  'use strict';
  const canvas = document.getElementById('logo3d');
  if (!canvas || !window.THREE) return;
  const THREE = window.THREE;

  const DPR = window.devicePixelRatio || 1;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: DPR < 1.5, // MSAA only where pixels are big enough to need it
      alpha: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
  } catch (e) {
    return; // no WebGL — the slide still works without the 3D mark
  }
  const MAX_PR = Math.min(DPR, 1.5);
  let pixelRatio = MAX_PR;
  renderer.setPixelRatio(pixelRatio);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 3000);

  /* --- studio environment for reflections (baked once) ----------------- */
  function buildEnv() {
    const env = new THREE.Scene();
    const box = new THREE.BoxGeometry(1, 1, 1);
    const add = (color, sx, sy, sz, x, y, z, ry = 0, side) => {
      const m = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color, side: side || THREE.FrontSide }));
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      env.add(m);
    };
    add(0x2a2a29, 30, 16, 30, 0, 4, 0, 0, THREE.BackSide); // room
    add(0x0c0c0c, 30, 1, 30, 0, -5, 0);                     // floor
    add(0x050505, 6, 9, 0.5, -9, 1, -12);                   // dark flags
    add(0x050505, 6, 9, 0.5, 10, 0, 8, 0.8);
    const light = (w, h, x, y, z, ry, k) => add(new THREE.Color(1, 1, 1).multiplyScalar(k), w, h, 0.2, x, y, z, ry);
    light(10, 2.5, 0, 11, 0, 0, 6);          // top strip
    light(3, 7, -14, 3, 2, Math.PI / 2, 5);  // left softbox
    light(4, 6, 13, 4, -6, -Math.PI / 3, 7); // right softbox
    light(8, 4, 3, 5, -14, 0, 2.2);          // back fill
    light(9, 5, -5, 3, 14, 0, 0.45);         // soft fill behind the camera
    light(3, 3, 6, 6, 14, 0, 4);             // hot spot behind the camera
    const pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromScene(env, 0.035);
    pmrem.dispose();
    box.dispose();
    return rt.texture;
  }
  scene.environment = buildEnv();

  /* --- logo geometry ------------------------------------------------------ */
  // logo drawn in a 108 x 88 box, centred here
  const P = (x, y) => [x - 54, 44 - y];
  const poly = (pts, curve) => {
    const s = new THREE.Shape();
    s.moveTo(...P(...pts[0]));
    for (let i = 1; i < pts.length; i++) {
      if (curve && i === curve.at) s.quadraticCurveTo(...P(...curve.c), ...P(...pts[i]));
      else s.lineTo(...P(...pts[i]));
    }
    s.closePath();
    return s;
  };
  const shapeA = poly([[0, 88], [0, 8], [8, 0], [60, 0], [76, 32], [63, 40], [49, 20], [20, 20], [20, 88]], { at: 2, c: [0, 0] });
  const shapeB = poly([[108, 0], [100, 7], [100, 80], [92, 88], [40, 88], [24, 56], [37, 48], [51, 68], [80, 68], [80, 0]], { at: 3, c: [100, 88] });
  const extrude = { depth: 16, bevelEnabled: true, bevelThickness: 3, bevelSize: 2.2, bevelSegments: 3, curveSegments: 10 };
  const geo = new THREE.ExtrudeGeometry([shapeA, shapeB], extrude);
  geo.translate(0, 0, -extrude.depth / 2);
  geo.computeVertexNormals();

  const chrome = new THREE.MeshStandardMaterial({
    color: 0xf2f2f2,
    metalness: 1,
    roughness: 0.09,
    envMapIntensity: 1.2,
  });
  const mesh = new THREE.Mesh(geo, chrome);

  const tilt = new THREE.Group();
  const spin = new THREE.Group();
  spin.add(mesh);
  tilt.add(spin);
  tilt.rotation.z = -0.32;
  scene.add(tilt);

  /* --- sizing -------------------------------------------------------------- */
  let cw = 0, ch = 0;
  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (w === cw && h === ch) return;
    cw = w; ch = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // the canvas spans 92% of the viewport height; keep the mark ~62% of it
    const portrait = window.innerHeight > window.innerWidth;
    camera.position.z = portrait ? 270 : 413;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', () => { resize(); if (!playing) render(performance.now()); });

  /* --- animation ----------------------------------------------------------- */
  let playing = false;
  let raf = 0;
  let introStart = -1;
  let mx = 0, my = 0, sx = 0, sy = 0;
  window.addEventListener('pointermove', (e) => {
    mx = e.clientX / window.innerWidth - 0.5;
    my = e.clientY / window.innerHeight - 0.5;
  }, { passive: true });
  const easeOut = (t) => 1 - Math.pow(1 - t, 4);

  function render(now) {
    const t = now / 1000;
    sx += (mx - sx) * 0.05;
    sy += (my - sy) * 0.05;
    const intro = introStart >= 0 ? Math.min(1, (now - introStart) / 1800) : 1;
    const e = easeOut(intro);
    spin.rotation.y = Math.sin(t * 0.62) * 0.95 + (1 - e) * -3.1 + sx * 0.45;
    spin.rotation.x = Math.sin(t * 0.41 + 1.2) * 0.32 + sy * 0.3;
    spin.scale.setScalar(0.82 + 0.18 * e);
    tilt.position.y = (1 - e) * -30;
    renderer.render(scene, camera);
  }

  // adaptive resolution: drop the pixel ratio when frames run long, raise it back when there is headroom
  let acc = 0, frames = 0, lastT = 0;
  function adapt(now) {
    if (lastT) {
      const dt = now - lastT;
      if (dt < 250) { acc += dt; frames++; }
    }
    lastT = now;
    if (frames < 20) return;
    const avg = acc / frames;
    acc = 0; frames = 0;
    let next = pixelRatio;
    if (avg > 33) next = Math.max(0.6, pixelRatio - 0.5);
    else if (avg > 20) next = Math.max(0.6, pixelRatio - 0.25);
    else if (avg < 14 && pixelRatio < MAX_PR) next = Math.min(MAX_PR, pixelRatio + 0.125);
    if (next !== pixelRatio) {
      pixelRatio = next;
      renderer.setPixelRatio(pixelRatio);
      cw = 0; resize();
    }
  }

  function loop(now) {
    if (!playing) return;
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    render(now);
    adapt(now);
  }

  window.Logo3D = {
    play(on) {
      if (on && !playing) {
        playing = true;
        introStart = performance.now();
        lastT = 0; acc = 0; frames = 0;
        resize();
        raf = requestAnimationFrame(loop);
      } else if (!on && playing) {
        playing = false;
        cancelAnimationFrame(raf);
      }
    },
  };

  // compile shaders and upload geometry while the preloader is on screen
  renderer.compile(scene, camera);
  render(performance.now());
})();
