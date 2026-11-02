/* 3D chrome / glass logo for the final slide (three.js r149, global build) */
(() => {
  'use strict';
  const canvas = document.getElementById('logo3d');
  if (!canvas || !window.THREE) return;
  const THREE = window.THREE;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    return; // no WebGL — the slide still works without the 3D mark
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0xd9d7d2, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 1, 3000);
  camera.position.set(0, 0, 380);

  /* --- studio environment for reflections ------------------------------ */
  function buildEnv() {
    const env = new THREE.Scene();
    const box = new THREE.BoxGeometry(1, 1, 1);
    const room = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x232322, side: THREE.BackSide }));
    room.scale.set(30, 16, 30);
    room.position.y = 4;
    env.add(room);
    const floor = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x0c0c0c }));
    floor.scale.set(30, 1, 30);
    floor.position.y = -5;
    env.add(floor);
    const dark = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x050505 }));
    dark.scale.set(6, 9, 0.5);
    dark.position.set(-9, 1, -12);
    env.add(dark);
    const dark2 = dark.clone();
    dark2.position.set(10, 0, 8);
    dark2.rotation.y = 0.8;
    env.add(dark2);
    const panel = (w, h, x, y, z, ry, intensity) => {
      const m = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(intensity) }));
      m.scale.set(w, h, 0.2);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      env.add(m);
    };
    panel(10, 2.5, 0, 11, 0, 0, 6);          // top strip
    panel(3, 7, -14, 3, 2, Math.PI / 2, 5);  // left softbox
    panel(4, 6, 13, 4, -6, -Math.PI / 3, 7); // right softbox
    panel(8, 4, 3, 5, -14, 0, 2.2);          // back fill
    panel(9, 5, -5, 3, 14, 0, 0.32);         // soft fill behind the camera (front faces)
    panel(3, 3, 6, 6, 14, 0, 4);             // small hot spot behind the camera
    const pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromScene(env, 0.035);
    pmrem.dispose();
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
  const shapeA = () => poly([[0, 88], [0, 8], [8, 0], [60, 0], [76, 32], [63, 40], [49, 20], [20, 20], [20, 88]], { at: 2, c: [0, 0] });
  const shapeB = () => poly([[108, 0], [100, 7], [100, 80], [92, 88], [40, 88], [24, 56], [37, 48], [51, 68], [80, 68], [80, 0]], { at: 3, c: [100, 88] });
  const extrude = { depth: 16, bevelEnabled: true, bevelThickness: 3, bevelSize: 2.2, bevelSegments: 6, curveSegments: 24 };
  const geo = new THREE.ExtrudeGeometry([shapeA(), shapeB()], extrude);
  geo.translate(0, 0, -extrude.depth / 2);
  geo.computeVertexNormals();

  // half chrome, half glass: dark mirror-like faces that turn clear as the mark rotates
  scene.background = new THREE.Color(0xd9d7d2);
  const chrome = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.62,
    roughness: 0.07,
    transmission: 0.55,
    thickness: 14,
    ior: 1.45,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.25,
  });
  const mesh = new THREE.Mesh(geo, chrome);

  const tilt = new THREE.Group();
  const spin = new THREE.Group();
  spin.add(mesh);
  tilt.add(spin);
  tilt.rotation.z = -0.32;
  scene.add(tilt);

  /* --- sizing -------------------------------------------------------------- */
  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the mark ~62% of the viewport height (or width on portrait)
    const portrait = h > w;
    camera.position.z = portrait ? 380 * (h / w) * 0.62 : 380;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', () => { resize(); render(performance.now()); });

  /* --- animation ----------------------------------------------------------- */
  let playing = false;
  let raf = 0;
  let introStart = -1;
  let mx = 0, my = 0, sx = 0, sy = 0;
  window.addEventListener('pointermove', (e) => {
    mx = e.clientX / window.innerWidth - 0.5;
    my = e.clientY / window.innerHeight - 0.5;
  });
  const easeOut = (t) => 1 - Math.pow(1 - t, 4);

  function render(now) {
    const t = now / 1000;
    sx += (mx - sx) * 0.05;
    sy += (my - sy) * 0.05;
    let intro = 1;
    if (introStart >= 0) intro = Math.min(1, (now - introStart) / 1800);
    const e = easeOut(intro);
    spin.rotation.y = Math.sin(t * 0.62) * 0.95 + (1 - e) * -3.1 + sx * 0.45;
    spin.rotation.x = Math.sin(t * 0.41 + 1.2) * 0.32 + sy * 0.3;
    const s = 0.82 + 0.18 * e;
    spin.scale.setScalar(s);
    tilt.position.y = (1 - e) * -30;
    renderer.render(scene, camera);
  }
  function loop(now) {
    if (!playing) return;
    render(now);
    raf = requestAnimationFrame(loop);
  }

  window.Logo3D = {
    play(on) {
      if (on && !playing) {
        playing = true;
        introStart = performance.now();
        resize();
        raf = requestAnimationFrame(loop);
      } else if (!on && playing) {
        playing = false;
        cancelAnimationFrame(raf);
      }
    },
  };
  render(performance.now());
})();
