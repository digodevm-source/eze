// One fixed WebGL scene behind the page: a star field, a particle cloud that re-forms
// into each section's object as you scroll, and solid 3D stones for the "float" section.
import * as THREE from 'three';
import { mergeVertices } from '../vendor/BufferGeometryUtils.js';

const TOUCH = matchMedia('(hover: none), (pointer: coarse)').matches;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const N = TOUCH ? 14000 : 26000;
const CAM_Z = 12;
const FOV = 35;

// ---------- noise ----------
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(seed) {
  const r = rng(seed);
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + t * (b - a);
  const grad = (h, x, y, z) => {
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  };
  return (x, y, z) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return lerp(
      lerp(lerp(grad(p[AA] & 15, x, y, z), grad(p[BA] & 15, x - 1, y, z), u),
           lerp(grad(p[AB] & 15, x, y - 1, z), grad(p[BB] & 15, x - 1, y - 1, z), u), v),
      lerp(lerp(grad(p[AA + 1] & 15, x, y, z - 1), grad(p[BA + 1] & 15, x - 1, y, z - 1), u),
           lerp(grad(p[AB + 1] & 15, x, y - 1, z - 1), grad(p[BB + 1] & 15, x - 1, y - 1, z - 1), u), v),
      w);
  };
}
const noise = makeNoise(4812);
function fbm(x, y, z, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * noise(x * f, y * f, z * f);
    a *= 0.5;
    f *= 2.03;
  }
  return s;
}

// ---------- particle targets ----------
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function boxBlur(src, w, h, r, passes) {
  let a = src.slice();
  const b = new Float32Array(a.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += a[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        b[y * w + x] = acc / (2 * r + 1);
        acc += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc / (2 * r + 1);
        acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}

// Turn a cut-out photo into a cloud of coloured points with real thickness:
// pixels deep inside the silhouette get more depth than pixels near its edge.
async function imageTarget(src, { height, depth, boost = 1.3, seed = 1 }) {
  const img = await loadImage(src);
  const W = 220;
  const H = Math.round((img.height / img.width) * W);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const alpha = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) alpha[i] = d[i * 4 + 3] / 255;
  const inner = boxBlur(alpha, W, H, 5, 3);
  const idx = [];
  for (let i = 0; i < W * H; i++) if (alpha[i] > 0.55) idx.push(i);

  const r = rng(seed);
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const s = height / H;
  for (let k = 0; k < N; k++) {
    const i = idx[Math.floor(r() * idx.length)];
    const px = i % W, py = (i / W) | 0;
    const th = Math.sqrt(Math.max(0, (inner[i] - 0.4) / 0.6));
    pos[k * 3] = (px + r() - W / 2) * s;
    pos[k * 3 + 1] = (H / 2 - py - r()) * s;
    pos[k * 3 + 2] = (r() * 2 - 1) * depth * th;
    let cr = (d[i * 4] / 255) * boost, cg = (d[i * 4 + 1] / 255) * boost, cb = (d[i * 4 + 2] / 255) * boost;
    const sp = r();
    if (sp < 0.05) { cr = 1.0; cg = 0.82; cb = 0.52; }        // warm sparks
    else if (sp < 0.09) { cr = 0.6; cg = 0.8; cb = 1.0; }     // glacier sparks
    col[k * 3] = cr;
    col[k * 3 + 1] = cg;
    col[k * 3 + 2] = cb;
  }
  return { pos, col };
}

function dustTarget() {
  const r = rng(11);
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  for (let k = 0; k < N; k++) {
    pos[k * 3] = (r() * 2 - 1) * 11;
    pos[k * 3 + 1] = (r() * 2 - 1) * 6.5;
    pos[k * 3 + 2] = -9 + r() * 12;
    const t = r();
    const b = 0.16 + r() * 0.22;
    if (t < 0.45) { col[k * 3] = b * 1.1; col[k * 3 + 1] = b; col[k * 3 + 2] = b * 0.85; }
    else if (t < 0.8) { col[k * 3] = b * 0.8; col[k * 3 + 1] = b * 0.95; col[k * 3 + 2] = b * 1.25; }
    else { col[k * 3] = b * 1.4; col[k * 3 + 1] = b * 1.1; col[k * 3 + 2] = b * 0.6; }
  }
  return { pos, col };
}

// A rock sample split into mineral bands, the "core" of the strata section.
function coreTarget() {
  const r = rng(23);
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const bands = [
    [0.82, 0.76, 0.66], // gneiss light
    [0.42, 0.43, 0.48], // gneiss dark
    [0.86, 0.62, 0.55], // granite
    [0.96, 0.96, 1.0],  // quartz
    [0.42, 0.52, 0.78], // magnetite
    [0.55, 0.78, 0.38], // moss
  ];
  const v = new THREE.Vector3();
  for (let k = 0; k < N; k++) {
    v.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
    if (v.lengthSq() > 1 || v.lengthSq() < 1e-4) { k--; continue; }
    v.normalize();
    let rad = 1.75 * (1 + 0.16 * fbm(v.x * 1.8, v.y * 1.8, v.z * 1.8, 3));
    if (r() < 0.22) rad *= Math.cbrt(r());
    const band = v.y * 0.95 + v.x * 0.3 + 0.35 * fbm(v.x * 2.4 + 5, v.y * 2.4, v.z * 2.4, 3);
    const bi = Math.abs(Math.floor((band + 1.4) * 3.1)) % bands.length;
    const c = bands[bi];
    const glow = 0.85 + r() * 0.35;
    pos[k * 3] = v.x * rad;
    pos[k * 3 + 1] = v.y * rad;
    pos[k * 3 + 2] = v.z * rad;
    col[k * 3] = c[0] * glow;
    col[k * 3 + 1] = c[1] * glow;
    col[k * 3 + 2] = c[2] * glow;
  }
  return { pos, col };
}

// ---------- shaders ----------
const particleVert = /* glsl */ `
  attribute vec3 p1; attribute vec3 p2; attribute vec3 p3; attribute vec3 p4;
  attribute vec3 c0; attribute vec3 c1; attribute vec3 c2; attribute vec3 c3; attribute vec3 c4;
  attribute vec4 aRnd;
  uniform vec4 uWa; uniform float uWb;
  uniform float uTime; uniform float uPR; uniform float uSize; uniform float uOpacity;
  uniform vec3 uMouse; uniform float uMouseStr;
  varying vec3 vCol; varying float vA;
  void main() {
    vec3 drift = vec3(sin(uTime * 0.07 + aRnd.x * 40.0), cos(uTime * 0.05 + aRnd.y * 40.0), sin(uTime * 0.06 + aRnd.z * 40.0)) * 0.6;
    vec3 pos = (position + drift) * uWa.x + p1 * uWa.y + p2 * uWa.z + p3 * uWa.w + p4 * uWb;
    vec3 col = c0 * uWa.x + c1 * uWa.y + c2 * uWa.z + c3 * uWa.w + c4 * uWb;
    float settled = max(max(uWa.x, uWa.y), max(max(uWa.z, uWa.w), uWb));
    float chaos = 1.0 - settled;
    vec3 n = vec3(
      sin(uTime * 0.9 + aRnd.x * 6.283 + pos.y * 1.7),
      cos(uTime * 0.8 + aRnd.y * 6.283 + pos.x * 1.5),
      sin(uTime * 0.7 + aRnd.z * 6.283 + pos.z * 1.3));
    pos += n * (0.015 + chaos * 2.2 * aRnd.w);
    vec4 world = modelMatrix * vec4(pos, 1.0);
    vec2 d = world.xy - uMouse.xy;
    float f = exp(-dot(d, d) * 1.6) * uMouseStr;
    world.xy += normalize(d + 1e-4) * f * 0.6;
    world.z += f * 0.5;
    vec4 mv = viewMatrix * world;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (0.45 + aRnd.w) * uPR * (12.0 / -mv.z);
    float tw = 0.78 + 0.22 * sin(uTime * 2.0 + aRnd.x * 50.0);
    vCol = col;
    vA = uOpacity * tw * (1.0 + f * 1.2);
  }
`;
const particleFrag = /* glsl */ `
  varying vec3 vCol; varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vCol * vA, a);
  }
`;
const starVert = /* glsl */ `
  attribute float aSize; attribute float aPhase;
  uniform float uTime; uniform float uPR;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPR;
    vA = 0.45 + 0.55 * (0.5 + 0.5 * sin(uTime * (0.6 + aPhase) + aPhase * 30.0));
  }
`;
const starFrag = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d) * vA;
    gl_FragColor = vec4(vec3(0.86, 0.88, 0.95) * a, a);
  }
`;

// ---------- solid stones ----------
function makeRockGeometry(seed, detail) {
  const r = rng(seed);
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.attributes.position;
  // fracture planes give the chunk flat broken faces and sharp edges
  const planes = [];
  const cuts = 7 + Math.floor(r() * 5);
  for (let i = 0; i < cuts; i++) {
    const n = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize();
    planes.push([n, 0.48 + r() * 0.34]);
  }
  const stretch = new THREE.Vector3(0.9 + r() * 0.5, 0.62 + r() * 0.35, 0.75 + r() * 0.4);
  const off = r() * 100;
  const v = new THREE.Vector3();
  const d = new THREE.Vector3();
  const ao = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    v.copy(d).multiplyScalar(1 + 0.14 * fbm(d.x * 1.3 + off, d.y * 1.3, d.z * 1.3, 3));
    for (const [n, dist] of planes) {
      const k = v.dot(n) - dist;
      if (k > 0) v.addScaledVector(n, -k);
    }
    // broken faces are never perfectly flat
    const rough = fbm(v.x * 3.5 + off, v.y * 3.5, v.z * 3.5, 4) * 0.05;
    const chip = Math.abs(noise(v.x * 7 + off, v.y * 7, v.z * 7));
    v.addScaledVector(d, rough - (chip < 0.08 ? (0.08 - chip) * 0.25 : 0));
    v.multiply(stretch);
    pos.setXYZ(i, v.x, v.y, v.z);
    ao[i] = Math.min(1, Math.max(0.3, 0.72 + fbm(v.x * 2.2 + off, v.y * 2.2, v.z * 2.2, 3) * 0.7 + rough * 3 - (chip < 0.08 ? 0.25 : 0)));
  }
  g.setAttribute('aAo', new THREE.BufferAttribute(ao, 1));
  g.computeVertexNormals();
  return g;
}

// Stone surface: the texture photographed from the reference rock, mapped from three sides
// (triplanar) so it wraps any shape without seams, with its own relief (normal map).
const stoneVert = /* glsl */ `
  attribute float aAo;
  varying vec3 vObjPos; varying vec3 vObjNormal; varying vec3 vWorldPos; varying float vAo;
  varying vec3 vM0; varying vec3 vM1; varying vec3 vM2;
  void main() {
    vObjPos = position;
    vObjNormal = normal;
    vAo = aAo;
    vM0 = modelMatrix[0].xyz; vM1 = modelMatrix[1].xyz; vM2 = modelMatrix[2].xyz;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const stoneFrag = /* glsl */ `
  uniform sampler2D tAlb; uniform sampler2D tNrm;
  uniform float uScale; uniform float uRelief;
  uniform vec3 uTint;
  uniform vec3 uKeyDir; uniform vec3 uKeyCol;
  uniform vec3 uRimDir; uniform vec3 uRimCol;
  uniform vec3 uGlowPos; uniform vec3 uGlowCol; uniform float uGlow;
  varying vec3 vObjPos; varying vec3 vObjNormal; varying vec3 vWorldPos; varying float vAo;
  varying vec3 vM0; varying vec3 vM1; varying vec3 vM2;

  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

  void main() {
    vec3 n = normalize(vObjNormal);
    vec3 b = pow(abs(n), vec3(4.0));
    b /= (b.x + b.y + b.z);
    vec3 p = vObjPos * uScale;

    float alb = texture2D(tAlb, p.zy).r * b.x + texture2D(tAlb, p.xz).r * b.y + texture2D(tAlb, p.xy).r * b.z;
    float big = texture2D(tAlb, p.xy * 0.11 + p.z * 0.07).r;

    vec3 tx = texture2D(tNrm, p.zy).xyz * 2.0 - 1.0;
    vec3 ty = texture2D(tNrm, p.xz).xyz * 2.0 - 1.0;
    vec3 tz = texture2D(tNrm, p.xy).xyz * 2.0 - 1.0;
    tx.xy *= uRelief; ty.xy *= uRelief; tz.xy *= uRelief;
    tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x);
    ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y);
    tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
    vec3 on = normalize(tx.zyx * b.x + ty.xzy * b.y + tz.xyz * b.z);
    mat3 M = mat3(normalize(vM0), normalize(vM1), normalize(vM2));
    vec3 N = normalize(M * on);
    vec3 V = normalize(cameraPosition - vWorldPos);

    vec3 base = uTint * (0.2 + alb * alb * 1.9) * (0.65 + big * 0.7) * vAo;

    float ndl = max(dot(N, uKeyDir), 0.0);
    vec3 H = normalize(uKeyDir + V);
    float spec = pow(max(dot(N, H), 0.0), 14.0) * (0.01 + alb * 0.07);
    vec3 col = base * uKeyCol * ndl + uKeyCol * spec * vAo;

    float rdl = max(dot(N, uRimDir), 0.0);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 2.2);
    col += base * uRimCol * rdl * 1.2 + uRimCol * fres * rdl * 0.08;

    float sky = N.y * 0.5 + 0.5;
    col += base * mix(vec3(0.05, 0.045, 0.04), vec3(0.12, 0.14, 0.18), sky);

    vec3 Lg = uGlowPos - vWorldPos;
    float dg = length(Lg);
    col += base * uGlowCol * max(dot(N, Lg / dg), 0.0) * uGlow / (1.0 + dg * dg * 0.35);

    // mica glints like the specks on the reference stones
    float sp = hash(floor(vObjPos * 150.0));
    if (sp > 0.996) col += vec3(1.0, 0.97, 0.9) * pow(max(dot(N, H), 0.0), 8.0) * 1.2;

    gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
  }
`;

// layout of the floating stones, in units of the stage (x: −1…1, y: −1…1, z depth, size)
const STONES = [
  [0.1, 0.05, 0.0, 1.25],
  [0.62, 0.62, -1.5, 0.66],
  [-0.55, 0.7, -2.2, 0.5],
  [0.78, -0.55, 0.6, 0.55],
  [-0.38, -0.66, 1.2, 0.42],
  [0.42, -0.12, 2.3, 0.3],
  [-0.9, -0.1, -1.0, 0.36],
  [0.98, 0.15, -3.0, 0.45],
  [-0.8, 0.95, -4.0, 0.4],
  [-0.15, 0.95, 0.8, 0.22],
  [0.28, -0.95, -0.6, 0.26],
];

export async function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !TOUCH, alpha: false, powerPreference: 'high-performance' });
  const pr = Math.min(window.devicePixelRatio || 1, TOUCH ? 1.5 : 2);
  renderer.setPixelRatio(pr);
  renderer.setClearColor(0x07080b, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x07080b, 14, 34);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 120);
  camera.position.set(0, 0, CAM_Z);

  // ----- stars -----
  {
    const count = TOUCH ? 900 : 1600;
    const r = rng(99);
    const p = new Float32Array(count * 3), size = new Float32Array(count), phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const th = r() * Math.PI * 2, ph = Math.acos(r() * 2 - 1), rad = 40 + r() * 40;
      p[i * 3] = Math.sin(ph) * Math.cos(th) * rad;
      p[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * rad;
      p[i * 3 + 2] = Math.cos(ph) * rad;
      size[i] = 0.6 + Math.pow(r(), 3) * 2.6;
      phase[i] = r();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    var starMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPR: { value: pr } },
      vertexShader: starVert,
      fragmentShader: starFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    var stars = new THREE.Points(g, starMat);
    stars.frustumCulled = false;
    scene.add(stars);
  }

  // ----- particle cloud -----
  const dust = dustTarget();
  const core = coreTarget();
  const blank = { pos: dust.pos, col: dust.col };
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(dust.pos, 3));
  geo.setAttribute('c0', new THREE.BufferAttribute(dust.col, 3));
  geo.setAttribute('p1', new THREE.BufferAttribute(core.pos, 3));
  geo.setAttribute('c1', new THREE.BufferAttribute(core.col, 3));
  for (const k of [2, 3, 4]) {
    geo.setAttribute(`p${k}`, new THREE.BufferAttribute(blank.pos.slice(), 3));
    geo.setAttribute(`c${k}`, new THREE.BufferAttribute(blank.col.slice(), 3));
  }
  const rnd = new Float32Array(N * 4);
  const rr = rng(5);
  for (let i = 0; i < N * 4; i++) rnd[i] = rr();
  geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));

  const pMat = new THREE.ShaderMaterial({
    uniforms: {
      uWa: { value: new THREE.Vector4(1, 0, 0, 0) },
      uWb: { value: 0 },
      uTime: { value: 0 },
      uPR: { value: pr },
      uSize: { value: TOUCH ? 3.4 : 3.0 },
      uOpacity: { value: 0.9 },
      uMouse: { value: new THREE.Vector3(99, 99, 0) },
      uMouseStr: { value: 0 },
    },
    vertexShader: particleVert,
    fragmentShader: particleFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const cloud = new THREE.Points(geo, pMat);
  cloud.frustumCulled = false;
  scene.add(cloud);

  const setTarget = (k, t) => {
    geo.getAttribute(`p${k}`).copyArray(t.pos).needsUpdate = true;
    geo.getAttribute(`c${k}`).copyArray(t.col).needsUpdate = true;
  };
  // photo-based shapes load in the background; until then those slots hold dust
  Promise.all([
    imageTarget('assets/island.webp', { height: 3.3, depth: 1.5, boost: 1.35, seed: 2 }).then((t) => setTarget(2, t)),
    imageTarget('assets/rocks-float.webp', { height: 4.6, depth: 0.9, boost: 2.3, seed: 3 }).then((t) => setTarget(3, t)),
    imageTarget('assets/mountain.webp', { height: 3.4, depth: 0.9, boost: 1.7, seed: 4 }).then((t) => setTarget(4, t)),
  ]).catch(() => {});

  // ----- solid stones -----
  const stoneGroup = new THREE.Group();
  scene.add(stoneGroup);
  const texLoader = new THREE.TextureLoader();
  const loadTex = (src) => {
    const t = texLoader.load(src);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  };
  const stoneMat = new THREE.ShaderMaterial({
    uniforms: {
      tAlb: { value: loadTex('assets/rock-albedo.webp') },
      tNrm: { value: loadTex('assets/rock-normal.webp') },
      uScale: { value: 1.3 },
      uRelief: { value: 0.5 },
      uTint: { value: new THREE.Color(0.075, 0.074, 0.078) },
      uKeyDir: { value: new THREE.Vector3(-5, 6, 6).normalize() },
      uKeyCol: { value: new THREE.Color(1.0, 0.94, 0.86).multiplyScalar(3.2) },
      uRimDir: { value: new THREE.Vector3(6, 1, -5).normalize() },
      uRimCol: { value: new THREE.Color(0.45, 0.65, 1.0).multiplyScalar(2.2) },
      uGlowPos: { value: new THREE.Vector3() },
      uGlowCol: { value: new THREE.Color(0.64, 0.78, 0.4) },
      uGlow: { value: 0 },
    },
    vertexShader: stoneVert,
    fragmentShader: stoneFrag,
  });
  // the big front stone gets a finer mesh so its facets stay small
  const geos = [0, 1, 2, 3, 4].map((i) => makeRockGeometry(31 + i * 7, (TOUCH ? 20 : 30) + (i === 0 ? 12 : 0)));
  const stones = STONES.map(([x, y, z, s], i) => {
    const m = new THREE.Mesh(geos[i % geos.length], stoneMat);
    const r = rng(200 + i);
    m.userData = {
      base: new THREE.Vector3(x, y, z), size: s,
      phase: r() * 10, spin: new THREE.Vector3((r() - 0.5) * 0.25, (r() - 0.5) * 0.3, (r() - 0.5) * 0.2),
      push: new THREE.Vector2(), tilt: new THREE.Vector2(),
    };
    m.rotation.set(r() * 6, r() * 6, r() * 6);
    stoneGroup.add(m);
    return m;
  });

  // ----- layout / scroll -----
  const TARGET = { dust: 0, core: 1, island: 2, cluster: 3, mountain: 4 };
  const anchors = [];
  const stage = document.getElementById('float-stage');
  const floatSection = document.getElementById('float');

  function measure() {
    anchors.length = 0;
    const narrow = innerWidth < 900;
    document.querySelectorAll('[data-morph]').forEach((el) => {
      const r = el.getBoundingClientRect();
      const top = r.top + scrollY;
      const kind = el.dataset.morph;
      let lay = { x: 0, y: 0, s: 1, op: 0.85 };
      if (kind === 'core') lay = narrow ? { x: 0, y: -0.4, s: 0.8, op: 0.95 } : { x: 3.2, y: -0.2, s: 1.15, op: 1 };
      if (kind === 'island') lay = narrow ? { x: 0, y: 0.6, s: 0.85, op: 0.75 } : { x: 2.9, y: -0.1, s: 1.1, op: 1 };
      if (kind === 'cluster') lay = narrow ? { x: 0, y: 0, s: 0.9, op: 0.5 } : { x: 2.6, y: 0, s: 1.05, op: 0.7 };
      if (kind === 'mountain') lay = narrow ? { x: 0, y: 1.1, s: 0.8, op: 1 } : { x: 2.4, y: 0.9, s: 1.3, op: 1.1 };
      // a tall pinned section holds its shape for most of its length
      const center = kind === 'core' ? top + r.height * 0.45 : top + r.height / 2;
      anchors.push({ ...lay, at: center, t: TARGET[kind] });
    });
  }

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    measure();
  }
  addEventListener('resize', resize);
  new ResizeObserver(measure).observe(document.body);
  resize();

  const halfH = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * CAM_Z;
  const smoothstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  const weights = [1, 0, 0, 0, 0];
  const shown = [1, 0, 0, 0, 0];
  const lay = { x: 0, y: 0, s: 1, op: 0.85 };
  const layShown = { ...lay };

  function updateTargets() {
    const c = scrollY + innerHeight / 2;
    weights.fill(0);
    if (!anchors.length) { weights[0] = 1; return; }
    let i = 0;
    while (i < anchors.length - 1 && anchors[i + 1].at <= c) i++;
    const a = anchors[i];
    const b = anchors[Math.min(i + 1, anchors.length - 1)];
    let t = 0;
    if (b !== a && c > a.at) t = smoothstep(0.3, 0.7, (c - a.at) / (b.at - a.at));
    weights[a.t] += 1 - t;
    weights[b.t] += t;
    for (const k of ['x', 'y', 's', 'op']) lay[k] = a[k] + (b[k] - a[k]) * t;
  }

  // ----- pointer -----
  const mouse = { x: 0, y: 0, sx: 0, sy: 0, active: false, last: 0 };
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    mouse.x = (e.clientX / innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / innerHeight) * 2 + 1;
    mouse.active = true;
    mouse.last = performance.now();
  }, { passive: true });
  document.addEventListener('pointerleave', () => (mouse.active = false));

  // ----- loop -----
  const clock = new THREE.Clock();
  let t = 0;
  const tmp = new THREE.Vector3();
  function frame() {
    const dt = Math.min(0.05, clock.getDelta());
    t += REDUCED ? dt * 0.2 : dt;
    updateTargets();

    const k = 1 - Math.exp(-dt * 2.4); // soft follow
    for (let i = 0; i < 5; i++) shown[i] += (weights[i] - shown[i]) * k;
    for (const key of ['x', 'y', 's', 'op']) layShown[key] += (lay[key] - layShown[key]) * k;
    pMat.uniforms.uWa.value.set(shown[0], shown[1], shown[2], shown[3]);
    pMat.uniforms.uWb.value = shown[4];
    pMat.uniforms.uTime.value = t;
    pMat.uniforms.uOpacity.value = layShown.op;
    starMat.uniforms.uTime.value = t;

    mouse.sx += (mouse.x - mouse.sx) * (1 - Math.exp(-dt * 3));
    mouse.sy += (mouse.y - mouse.sy) * (1 - Math.exp(-dt * 3));
    const halfW = halfH * camera.aspect;
    const mouseOn = mouse.active && performance.now() - mouse.last < 2500;
    pMat.uniforms.uMouseStr.value += ((mouseOn ? 1 : 0) - pMat.uniforms.uMouseStr.value) * (1 - Math.exp(-dt * 2));
    pMat.uniforms.uMouse.value.set(mouse.x * halfW, mouse.y * halfH, 0);

    cloud.position.set(layShown.x, layShown.y, 0);
    cloud.scale.setScalar(layShown.s);
    cloud.rotation.y = Math.sin(t * 0.18) * 0.45 + mouse.sx * 0.25;
    cloud.rotation.x = Math.sin(t * 0.13) * 0.08 - mouse.sy * 0.12;
    if (shown[1] > 0.01) cloud.rotation.y += t * 0.25 * shown[1];

    stars.rotation.y = t * 0.004 + mouse.sx * 0.02;
    stars.rotation.x = scrollY * 0.00006 - mouse.sy * 0.02;

    camera.position.x = mouse.sx * 0.35;
    camera.position.y = mouse.sy * 0.22;
    camera.lookAt(0, 0, 0);

    // floating stones follow the stage element on the page
    const sr = stage.getBoundingClientRect();
    const fr = floatSection.getBoundingClientRect();
    const cy = ((sr.top + sr.height / 2) / innerHeight) * 2 - 1;
    const onScreen = fr.bottom > -innerHeight * 0.3 && fr.top < innerHeight * 1.3;
    stoneGroup.visible = onScreen;
    if (onScreen) {
      const cx = ((sr.left + sr.width / 2) / innerWidth) * 2 - 1;
      const spanX = (sr.width / innerWidth) * halfW;
      const spanY = (sr.height / innerHeight) * halfH;
      const unit = Math.min(spanX, spanY * 1.3) * 0.36;
      stoneGroup.position.set(cx * halfW, -cy * halfH, 0);
      const progress = Math.max(-1, Math.min(1, cy));
      const mx = mouse.x * halfW - stoneGroup.position.x;
      const my = mouse.y * halfH - stoneGroup.position.y;
      for (const m of stones) {
        const u = m.userData;
        const bob = REDUCED ? 0 : Math.sin(t * 0.55 + u.phase) * 0.16;
        tmp.set(u.base.x * spanX * 0.9, u.base.y * spanY * 0.85 + bob - progress * u.base.z * 0.25, u.base.z);
        // stones drift away from the cursor
        const dx = tmp.x - mx, dy = tmp.y - my;
        const dist = Math.hypot(dx, dy);
        const f = mouseOn ? Math.exp(-dist * dist * 0.35) * 0.9 : 0;
        u.push.x += ((dx / (dist + 1e-3)) * f - u.push.x) * (1 - Math.exp(-dt * 2.2));
        u.push.y += ((dy / (dist + 1e-3)) * f - u.push.y) * (1 - Math.exp(-dt * 2.2));
        m.position.set(tmp.x + u.push.x, tmp.y + u.push.y, tmp.z);
        m.scale.setScalar(u.size * unit);
        m.rotation.x += u.spin.x * dt + u.push.y * dt * 0.8;
        m.rotation.y += u.spin.y * dt + u.push.x * dt * 0.8;
        m.rotation.z += u.spin.z * dt;
      }
      const glow = stoneMat.uniforms.uGlow;
      stoneMat.uniforms.uGlowPos.value.set(mouse.sx * halfW, mouse.sy * halfH, 2.5);
      glow.value += ((mouseOn ? 3 : 0) - glow.value) * (1 - Math.exp(-dt * 2));
    }

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { measure };
}
