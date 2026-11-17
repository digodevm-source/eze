// Stylized jointed character built from primitives. Faces +Z, feet at y=0.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, mesh, ink, rng, lerp } from './toon.js';
import { Face } from './face.js';

const HEAD_R = 0.2;

function teeTexture(base, print) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = base; c.fillRect(0, 0, 512, 256);
  if (print === 'triangles') {
    // lathe front is at u = 0 (wraps) -> draw around x = 0 and x = 512
    const r = rng(7);
    c.fillStyle = '#e9e6ee';
    for (let i = 0; i < 40; i++) {
      const x = (r() - 0.5) * 150, y = 125 + r() * 85, s = 3.5 + r() * 5, a = r() * 6.28;
      for (const ox of [0, 512]) {
        c.beginPath();
        for (let k = 0; k < 3; k++) { const aa = a + k * 2.094; c.lineTo(ox + x + Math.cos(aa) * s * 1.3, y + Math.sin(aa) * s); }
        c.closePath(); c.fill();
      }
    }
  } else if (print === 'wave') {
    c.strokeStyle = '#1f2433'; c.lineWidth = 6;
    for (let k = 0; k < 3; k++) {
      for (const ox of [0, 512]) {
        c.beginPath();
        for (let x = -50; x <= 50; x += 4) c.lineTo(ox + x, 100 + k * 16 + Math.sin(x * 0.12) * 6);
        c.stroke();
      }
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function colorize(g, col) {
  const cols = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < cols.length; i += 3) { cols[i] = col.r; cols[i + 1] = col.g; cols[i + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

function hairGeometry(style, seed) {
  const r = rng(seed);
  const geos = [];
  const dark = new THREE.Color(style.color), light = new THREE.Color(style.light);
  const add = (pos, rad, sc = [1, 1, 1], dirUp = null, shade = r()) => {
    const g = new THREE.SphereGeometry(rad, 16, 12);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    if (dirUp) q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirUp.clone().normalize());
    else q.setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3));
    m.compose(pos, q, new THREE.Vector3(...sc));
    g.applyMatrix4(m);
    geos.push(colorize(g, dark.clone().lerp(light, Math.pow(shade, 1.6) * 0.9)));
  };
  const C = new THREE.Vector3(0, HEAD_R, 0);
  const dirFromLonLat = (lon, lat) => {
    const a = THREE.MathUtils.degToRad(lon), b = THREE.MathUtils.degToRad(lat);
    return new THREE.Vector3(Math.sin(a) * Math.cos(b), Math.sin(b) * 1.06, Math.cos(a) * Math.cos(b));
  };
  const at = (lon, lat, out) => C.clone().add(dirFromLonLat(lon, lat).normalize().multiplyScalar(HEAD_R * out));

  if (style.type === 'curly') {
    // base cap so no scalp shows through
    const cap = new THREE.SphereGeometry(HEAD_R * 1.04, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.56);
    cap.applyMatrix4(new THREE.Matrix4().makeRotationX(-0.32));
    cap.applyMatrix4(new THREE.Matrix4().makeTranslation(0, HEAD_R + 0.01, -0.01));
    geos.push(colorize(cap, dark.clone().multiplyScalar(0.8)));
    // volume layer of curls (hugging the skull, falling down on the sides/back)
    const N = 260;
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 1.7;
      const rad = Math.sqrt(Math.max(0, 1 - y * y));
      const th = i * 2.399963;
      const d = new THREE.Vector3(Math.cos(th) * rad, y, Math.sin(th) * rad);
      const lon = THREE.MathUtils.radToDeg(Math.atan2(d.x, d.z));
      const lat = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)));
      const front = Math.abs(lon) < 64;
      if (front && lat < 34) continue;
      if (!front && Math.abs(lon) < 100 && lat < -38) continue;
      if (Math.abs(lon) >= 100 && lat < -52) continue;
      const out = 1.03 + r() * 0.07 + (lat > 40 ? 0.06 : 0);
      add(at(lon, lat, out), 0.046 + r() * 0.024, [1, 1.0 + r() * 0.35, 0.85]);
    }
    // small outer curls -> messy silhouette
    for (let i = 0; i < 120; i++) {
      const lon = (r() * 2 - 1) * 180, lat = -40 + r() * 120;
      if (Math.abs(lon) < 64 && lat < 38) continue;
      if (Math.abs(lon) < 100 && lat < -30) continue;
      add(at(lon, lat, 1.13 + r() * 0.08), 0.026 + r() * 0.02, [1, 1.4, 0.8]);
    }
    // bangs: hanging curl chains, ending at the brows
    for (let i = 0; i < 19; i++) {
      const lon = -64 + i * (128 / 18) + (r() - 0.5) * 4;
      const len = 5;
      const edge = Math.abs(lon) > 44;
      const endLat = (edge ? -2 : 10) + r() * 5;
      for (let k = 0; k < len; k++) {
        const t = k / (len - 1);
        const lat = lerp(42, endLat, t);
        const wob = Math.sin(k * 2.1 + i * 1.7) * 3.5;
        const out = 1.08 + (1 - t) * 0.05;
        add(at(lon + wob, lat, out), 0.04 + r() * 0.014 - t * 0.012, [1, 1.25, 0.72]);
      }
    }
    // side curls covering the ears, falling to the jaw
    for (const side of [-1, 1]) {
      for (let i = 0; i < 26; i++) {
        const lon = side * (64 + r() * 60), lat = 18 - r() * 62;
        add(at(lon, lat, 1.06 + r() * 0.08), 0.04 + r() * 0.022, [1, 1.35, 0.85]);
      }
    }
  } else if (style.type === 'long') {
    const cap = new THREE.SphereGeometry(HEAD_R * 1.08, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.58);
    cap.applyMatrix4(new THREE.Matrix4().makeRotationX(-0.3));
    cap.applyMatrix4(new THREE.Matrix4().makeTranslation(0, HEAD_R + 0.01, -0.01));
    geos.push(colorize(cap, dark));
    const strand = (lon, latTop, latBot, width, out = 1.1, drop = 0) => {
      const top = at(lon, latTop, out);
      const bot = at(lon * 1.0, latBot, out + 0.08); bot.y -= drop; bot.z -= 0.05;
      const mid = top.clone().add(bot).multiplyScalar(0.5);
      add(mid, 1, [width, top.distanceTo(bot) * 0.58, width * 0.45], top.clone().sub(bot), r() * 0.7);
    };
    for (let i = 0; i < 22; i++) {
      const lon = 70 + i * (220 / 21);
      const L = lon > 180 ? lon - 360 : lon;
      strand(L, 38, -60, 0.07, 1.06, 0.25 + r() * 0.15);
    }
    for (let i = 0; i < 9; i++) strand(-40 + i * 10, 44, 18 + r() * 6, 0.045);
  } else {
    // straight, sleek hair with heavy bangs
    const cap = new THREE.SphereGeometry(HEAD_R * 1.1, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.6);
    cap.applyMatrix4(new THREE.Matrix4().makeRotationX(-0.25));
    cap.applyMatrix4(new THREE.Matrix4().makeTranslation(0, HEAD_R + 0.012, -0.01));
    geos.push(colorize(cap, dark));
    const strand = (lon, latTop, latBot, width, out = 1.12) => {
      const top = at(lon, latTop, out);
      const bot = at(lon * 1.02, latBot, out + 0.03);
      const mid = top.clone().add(bot).multiplyScalar(0.5);
      const len = top.distanceTo(bot);
      add(mid, 1, [width, len * 0.6, width * 0.5], top.clone().sub(bot), r() * 0.7);
    };
    for (let i = 0; i < 15; i++) {
      const lon = -64 + i * 9.2 + (r() - 0.5) * 4;
      strand(lon, 44, 10 + r() * 6 - (Math.abs(lon) > 40 ? 8 : 0), 0.048 + r() * 0.012);
    }
    for (const side of [-1, 1]) for (let i = 0; i < 9; i++) strand(side * (68 + i * 13), 40, -36 + r() * 10, 0.06, 1.1);
    for (let i = 0; i < 10; i++) strand(140 + i * 8, 35, -40, 0.065, 1.08);
  }
  return mergeGeometries(geos);
}

function headGeometry() {
  const g = new THREE.SphereGeometry(HEAD_R, 64, 40);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ny = y / HEAD_R;
    if (ny < 0.15) {
      const k = Math.pow((0.15 - ny) / 1.15, 1.4);
      const taper = 1 - 0.34 * k;
      x *= taper; z *= 1 - 0.18 * k;
      y *= 1 + 0.12 * k;
    }
    // slightly flatter face front, rounder back
    if (z > 0) z *= 0.96;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

function teeGeometry() {
  const prof = [[0.205, -0.02], [0.212, 0.06], [0.205, 0.18], [0.208, 0.3], [0.2, 0.37], [0.175, 0.425], [0.12, 0.462], [0.07, 0.475]];
  const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 36);
  g.scale(1.08, 1, 0.68);
  return g;
}

export function buildCharacter(opts = {}) {
  const o = {
    skin: '#f1c6ae', tee: '#1d1c24', teePrint: 'triangles', headScale: 1.18, shorts: '#8c8f99', shoes: '#ecebe8', sole: '#6c6a70',
    hair: { type: 'curly', color: '#2e1a12', light: '#6a412b' }, iris: '#86a29a', irisDark: '#4d6461', seed: 3, ...opts,
  };
  const root = new THREE.Group();
  const J = {};
  const joint = (name, parent, x, y, z) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); J[name] = g; return g; };

  const skinM = toon(o.skin);
  const teeM = toon('#ffffff', { map: teeTexture(o.tee, o.teePrint), side: THREE.DoubleSide });
  const teePlainM = toon(o.tee, { side: THREE.DoubleSide });
  const shortsM = toon(o.shorts);
  const shoeM = toon(o.shoes);
  const soleM = toon(o.sole);

  const hips = joint('hips', root, 0, 1.0, 0);
  {
    const m = mesh(new THREE.SphereGeometry(0.17, 24, 16), shortsM);
    m.scale.set(1.12, 0.8, 0.8); hips.add(m);
  }
  const spine = joint('spine', hips, 0, 0.04, 0);
  {
    const m = mesh(teeGeometry(), teeM);
    m.position.y = 0.0; spine.add(m);
    // body filler under the tee (keeps silhouette closed)
    const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.42, 16), teePlainM);
    fill.scale.set(1.1, 1, 0.66); fill.position.y = 0.22; spine.add(fill);
  }
  const neck = joint('neck', spine, 0, 0.455, 0);
  {
    const m = mesh(new THREE.CylinderGeometry(0.054, 0.06, 0.1, 16), skinM);
    m.position.y = 0.015; neck.add(m);
    const collar = mesh(new THREE.TorusGeometry(0.07, 0.016, 8, 24), teePlainM);
    collar.rotation.x = Math.PI / 2; collar.scale.set(1.25, 0.9, 1); collar.position.y = 0.0; neck.add(collar);
  }
  const head = joint('head', neck, 0, 0.035, 0);
  head.scale.setScalar(o.headScale || 1.18);
  const face = new Face({ skin: o.skin, iris: o.iris, irisDark: o.irisDark, ...(o.face || {}) });
  {
    const headM = toon('#ffffff', { map: face.tex, gradientMap: softGradient() });
    const m = mesh(headGeometry(), headM);
    m.position.y = HEAD_R; head.add(m);
    J.headMesh = m;
    const hm = toon('#ffffff', { vertexColors: true, rim: 1.3 });
    const hair = mesh(hairGeometry(o.hair, o.seed), hm, { width: 0.0016 });
    head.add(hair);
    J.hairMesh = hair;
  }

  // arms
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    const sh = joint('shoulder' + side, spine, sx * 0.2, 0.41, 0);
    {
      const sleeve = mesh(new THREE.CylinderGeometry(0.075, 0.098, 0.25, 18, 1, true), teePlainM);
      sleeve.position.y = -0.115; sh.add(sleeve);
      const cap = mesh(new THREE.SphereGeometry(0.075, 16, 12), teePlainM);
      cap.scale.set(0.95, 0.7, 0.9); cap.position.set(-sx * 0.01, -0.01, 0); sh.add(cap);
      const arm = mesh(new THREE.CapsuleGeometry(0.042, 0.22, 6, 12), skinM);
      arm.position.y = -0.15; sh.add(arm);
    }
    const el = joint('elbow' + side, sh, 0, -0.3, 0);
    {
      const fa = mesh(new THREE.CapsuleGeometry(0.039, 0.21, 6, 12), skinM);
      fa.position.y = -0.12; el.add(fa);
    }
    const wr = joint('wrist' + side, el, 0, -0.265, 0);
    {
      const palmM = mesh(new THREE.SphereGeometry(0.046, 14, 10), skinM);
      palmM.scale.set(0.95, 1.05, 0.55); palmM.position.y = -0.04; wr.add(palmM);
      const thumb = mesh(new THREE.CapsuleGeometry(0.015, 0.035, 4, 8), skinM);
      thumb.position.set(sx * -0.03, -0.045, 0.018); thumb.rotation.set(0.5, 0, sx * -0.6); wr.add(thumb);
    }
    const fingers = joint('fingers' + side, wr, 0, -0.07, 0);
    {
      const f = mesh(new THREE.CapsuleGeometry(0.024, 0.04, 4, 10), skinM);
      f.scale.set(1.55, 1, 0.8); f.position.y = -0.03; fingers.add(f);
    }
    joint('grip' + side, wr, 0, -0.075, 0.035);
  }

  // legs
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    const hp = joint('hip' + side, hips, sx * 0.095, -0.03, 0);
    {
      const th = mesh(new THREE.CylinderGeometry(0.1, 0.092, 0.5, 18), shortsM);
      th.position.y = -0.22; hp.add(th);
    }
    const kn = joint('knee' + side, hp, 0, -0.44, 0);
    {
      const shin = mesh(new THREE.CapsuleGeometry(0.05, 0.34, 6, 12), skinM);
      shin.position.y = -0.2; kn.add(shin);
    }
    const an = joint('ankle' + side, kn, 0, -0.45, 0);
    {
      const shoe = mesh(new THREE.CapsuleGeometry(0.056, 0.14, 6, 14), shoeM);
      shoe.rotation.x = Math.PI / 2; shoe.scale.set(1.15, 1, 0.82); shoe.position.set(0, -0.04, 0.045); an.add(shoe);
      const sole = mesh(new THREE.BoxGeometry(0.125, 0.024, 0.27), soleM, { outline: false });
      sole.position.set(0, -0.083, 0.045); an.add(sole);
    }
  }

  const ch = { root, J, face, o, pose: {} };
  ch.apply = (pose) => applyPose(ch, pose);
  // "чёлка до колена": a curtain of curls that can grow down from the forehead
  {
    const lb = new THREE.Group();
    const hm = J.hairMesh.material;
    const r = rng(77);
    const strands = [];
    for (let i = 0; i < 9; i++) {
      const sg = new THREE.Group();
      const x = (i - 4) * 0.045;
      const segs = 9;
      for (let k = 0; k < segs; k++) {
        const g = new THREE.SphereGeometry(0.03 + r() * 0.01, 10, 8);
        colorize(g, new THREE.Color(o.hair.color).lerp(new THREE.Color(o.hair.light), r() * 0.8));
        const m = mesh(g, hm, { width: 0.0014 });
        m.position.set(Math.sin(k * 1.7 + i) * 0.012, -k * 0.11, 0);
        m.scale.set(1, 2.2, 0.8);
        sg.add(m);
      }
      sg.position.set(x, 0, 0);
      lb.add(sg); strands.push(sg);
    }
    lb.position.set(0, HEAD_R + 0.06, HEAD_R * 1.12);
    lb.visible = false;
    J.head.add(lb);
    ch.longBangs = (k, t = 0) => {
      lb.visible = k > 0.01;
      strands.forEach((sg, i) => {
        sg.scale.y = Math.max(0.01, k * (0.85 + 0.15 * Math.sin(i * 2.3)));
        sg.rotation.z = Math.sin(t * 9 + i) * 0.08 * k;
        sg.rotation.x = -0.12 - Math.sin(t * 7 + i * 0.7) * 0.06 * k;
      });
    };
  }
  ch.attach = (obj, jointName, pos = [0, 0, 0], rot = [0, 0, 0]) => {
    obj.position.set(...pos); obj.rotation.set(...rot); J[jointName].add(obj); return obj;
  };
  applyPose(ch, POSES.stand);
  return ch;
}

let softG;
function softGradient() {
  if (softG) return softG;
  const data = new Uint8Array([175, 200, 225, 245, 255, 255]);
  softG = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  softG.minFilter = softG.magFilter = THREE.LinearFilter; softG.needsUpdate = true;
  return softG;
}

// Pose: joint -> [x, y, z] rotation in radians. Arms/legs are given for the LEFT side
// and mirrored for the RIGHT side unless an explicit R value is given.
export const POSES = {
  stand: {
    hips: [0, 0, 0], spine: [0.02, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
    shoulderL: [0.05, 0, 0.12], elbowL: [-0.15, 0, 0], wristL: [0, 0, 0],
    shoulderR: [0.05, 0, -0.12], elbowR: [-0.15, 0, 0], wristR: [0, 0, 0],
    hipL: [0, 0, 0.02], kneeL: [0.03, 0, 0], ankleL: [0, 0, 0],
    hipR: [0, 0, -0.02], kneeR: [0.03, 0, 0], ankleR: [0, 0, 0],
    rootY: 0,
  },
};

export function applyPose(ch, pose) {
  const { J } = ch;
  for (const [k, v] of Object.entries(pose)) {
    if (k === 'rootY') { J.hips.position.y = 1.0 + v; continue; }
    if (k === 'hipsZ') { J.hips.position.z = v; continue; }
    if (!J[k]) continue;
    J[k].rotation.set(v[0], v[1], v[2]);
  }
  ch.pose = pose;
}

export function mixPose(a, b, t) {
  const out = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const va = a[k] ?? b[k], vb = b[k] ?? a[k];
    if (Array.isArray(va)) out[k] = [lerp(va[0], vb[0], t), lerp(va[1], vb[1], t), lerp(va[2], vb[2], t)];
    else out[k] = lerp(va, vb, t);
  }
  return out;
}

// Helper to define a pose by overriding stand; mirror L->R automatically.
export function pose(over) {
  const p = JSON.parse(JSON.stringify(POSES.stand));
  for (const [k, v] of Object.entries(over)) {
    p[k] = v;
    if (k.endsWith('L') && !(k.slice(0, -1) + 'R' in over) && Array.isArray(v)) {
      p[k.slice(0, -1) + 'R'] = [v[0], -v[1], -v[2]];
    }
  }
  return p;
}
