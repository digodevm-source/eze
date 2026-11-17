// Sky, sea, beach, lights and props.
import * as THREE from 'three';
import { toon, mesh, rng, lerp } from './toon.js';

const NOISE = `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
float hash3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise3(vec3 p){ vec3 i = floor(p), f = fract(p); vec3 u = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash3(i), hash3(i+vec3(1,0,0)), u.x), mix(hash3(i+vec3(0,1,0)), hash3(i+vec3(1,1,0)), u.x), u.y),
             mix(mix(hash3(i+vec3(0,0,1)), hash3(i+vec3(1,0,1)), u.x), mix(hash3(i+vec3(0,1,1)), hash3(i+vec3(1,1,1)), u.x), u.y), u.z); }
float fbm3(vec3 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * noise3(p); p *= 2.07; a *= 0.5; } return v; }
`;

// Palettes: sunset -> dusk -> night are blended by `phase` (0..2)
export const PALETTES = [
  { top: '#2a1f4f', mid: '#a4497a', horizon: '#ff9a5a', glow: '#ffcf8a', sun: '#fff1c9', sea: '#1f2c4f', seaLight: '#5a4d84', sand: '#e0a882', fog: '#c46a6e', key: '#ffb684', hemiSky: '#9a7bc4', hemiGround: '#d88d6c', fill: '#ffc6c0', rim: '#ffb07a' },
  { top: '#141a3c', mid: '#4b3a78', horizon: '#e0738a', glow: '#ff9a8a', sun: '#ffd9b0', sea: '#141d3a', seaLight: '#3e3d72', sand: '#b98a8a', fog: '#6b4a7a', key: '#ff9a88', hemiSky: '#6a6ab4', hemiGround: '#9a6a7a', fill: '#c4b8ff', rim: '#ff9ab0' },
  { top: '#060a1c', mid: '#121c40', horizon: '#2c3a6a', glow: '#8aa8ff', sun: '#eef2ff', sea: '#07102a', seaLight: '#22305e', sand: '#5d6488', fog: '#1a2448', key: '#b8c8ff', hemiSky: '#3c4c94', hemiGround: '#38345a', fill: '#8a9cff', rim: '#c8d8ff' },
];

export function paletteAt(phase) {
  const i = Math.min(1, Math.floor(phase));
  const t = Math.min(1, Math.max(0, phase - i));
  const a = PALETTES[i], b = PALETTES[i + 1];
  const out = {};
  for (const k of Object.keys(a)) out[k] = new THREE.Color(a[k]).lerp(new THREE.Color(b[k]), t);
  return out;
}

export function buildWorld(scene, opts = {}) {
  const W = { scene, phase: 0, sunDir: new THREE.Vector3(0, 0.07, -1).normalize(), u: {} };
  const o = { shoreZ: -2.0, ...opts };

  // ---------------- sky ----------------
  const skyU = {
    sunDir: { value: W.sunDir }, cTop: { value: new THREE.Color() }, cMid: { value: new THREE.Color() },
    cHorizon: { value: new THREE.Color() }, cGlow: { value: new THREE.Color() }, cSun: { value: new THREE.Color() },
    time: { value: 0 }, night: { value: 0 }, sunSize: { value: 0.9968 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform vec3 sunDir, cTop, cMid, cHorizon, cGlow, cSun; uniform float time, night, sunSize; varying vec3 vDir;
      ${NOISE}
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        float sd = dot(d, sunDir);
        vec3 col = mix(cHorizon, cMid, smoothstep(-0.01, 0.13, h));
        col = mix(col, cTop, smoothstep(0.1, 0.42, h));
        float g = pow(max(sd, 0.0), 30.0);
        col += cGlow * g * 0.9 * (1.0 - smoothstep(0.0, 0.3, h));
        col += cGlow * 0.3 * exp(-max(h, 0.0) * 22.0) * (0.4 + 0.6 * max(sd, 0.0));
        col += cGlow * pow(max(sd, 0.0), 120.0) * 0.8;
        // stylized cloud streaks
        float az = atan(d.x, d.z);
        float n = fbm3(vec3(d.x * 2.6 + time * 0.003, d.y * 34.0, d.z * 2.6));
        float band = smoothstep(0.015, 0.05, h) * (1.0 - smoothstep(0.16, 0.3, h));
        float cl = smoothstep(0.6, 0.625, n) * band;
        float lit = smoothstep(0.62, 0.75, n);
        vec3 cloudCol = mix(mix(cMid, cTop, 0.2), cGlow, 0.25 + 0.5 * g + 0.3 * lit);
        col = mix(col, cloudCol, cl * 0.9);
        // stars
        vec2 sp = vec2(az * 140.0, h * 140.0);
        float st = step(0.9965, hash(floor(sp))) * smoothstep(0.08, 0.4, h);
        col += vec3(1.0) * st * night * (0.5 + 0.5 * sin(time * 2.0 + hash(floor(sp)) * 50.0));
        // sun / moon disk
        float disk = smoothstep(sunSize, sunSize + 0.0003, sd);
        if (night > 0.5) { // moon crater shading
          float cr = fbm(vec2(atan(d.x - sunDir.x, d.y - sunDir.y), sd) * 30.0);
          col = mix(col, cSun * (1.6 - 0.25 * cr), disk);
        } else {
          col = mix(col, cSun * 2.2, disk);
        }
        col = mix(col, cHorizon * 0.55, smoothstep(0.0, -0.04, h));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);
  W.sky = sky; W.u.sky = skyU;

  // ---------------- sea ----------------
  const seaU = {
    time: { value: 0 }, sunDir: { value: W.sunDir }, cSea: { value: new THREE.Color() }, cSeaLight: { value: new THREE.Color() },
    cHorizon: { value: new THREE.Color() }, cGlow: { value: new THREE.Color() }, cSun: { value: new THREE.Color() }, amp: { value: 1 },
    ...THREE.UniformsLib.fog,
  };
  const seaGeo = new THREE.PlaneGeometry(1200, 1200, 260, 260);
  seaGeo.rotateX(-Math.PI / 2);
  // concentrate vertices near origin
  {
    const p = seaGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / 600, z = p.getZ(i) / 600;
      const f = (v) => Math.sign(v) * Math.pow(Math.abs(v), 2.2) * 600;
      p.setX(i, f(x)); p.setZ(i, f(z));
    }
  }
  const sea = new THREE.Mesh(seaGeo, new THREE.ShaderMaterial({
    uniforms: seaU, fog: true,
    vertexShader: `
      uniform float time, amp; varying vec3 vWorld; varying vec3 vN;
      #include <common>
      #include <fog_pars_vertex>
      float wave(vec2 p){
        float h = 0.0;
        h += sin(dot(p, vec2(0.12, 0.9)) * 1.1 + time * 1.3) * 0.11;
        h += sin(dot(p, vec2(-0.6, 0.7)) * 1.9 + time * 1.9) * 0.05;
        h += sin(dot(p, vec2(0.8, 0.3)) * 3.3 + time * 2.6) * 0.025;
        h += sin(dot(p, vec2(0.2, -1.0)) * 6.1 + time * 3.4) * 0.012;
        return h * amp;
      }
      void main(){
        vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
        float fade = 1.0 - smoothstep(30.0, 140.0, length(p.xz - cameraPosition.xz));
        float e = 0.05;
        float h = wave(p.xz) * fade;
        float hx = wave(p.xz + vec2(e, 0.0)) * fade, hz = wave(p.xz + vec2(0.0, e)) * fade;
        vN = normalize(vec3(-(hx - h) / e, 1.0, -(hz - h) / e));
        p.y += h;
        vWorld = p;
        vec4 mvPosition = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform vec3 sunDir, cSea, cSeaLight, cHorizon, cGlow, cSun; uniform float time; varying vec3 vWorld; varying vec3 vN;
      #include <common>
      #include <fog_pars_fragment>
      ${NOISE}
      void main(){
        vec3 n = normalize(vN);
        vec3 v = normalize(cameraPosition - vWorld);
        float dist = length(vWorld.xz - cameraPosition.xz);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        float band = floor(clamp(fres * 3.2, 0.0, 2.0) + 0.0) / 2.0;
        vec3 col = mix(cSea, cSeaLight, band * 0.7);
        col = mix(col, cHorizon * 0.8, smoothstep(40.0, 420.0, dist));
        // glitter path: broken horizontal dashes
        vec3 r = reflect(-v, n);
        float s = max(dot(r, sunDir), 0.0);
        float dash = noise(vec2(vWorld.x * 0.9, vWorld.z * 7.0 + time * 0.6));
        float path = smoothstep(0.985, 0.995, s);
        float path2 = smoothstep(0.93, 0.95, s) * step(0.62, dash);
        col = mix(col, cGlow, path2 * 0.75);
        col = mix(col, cSun * 1.6, path);
        // little foam ticks
        float ticks = step(0.86, noise(vWorld.xz * vec2(1.6, 6.0) + vec2(time * 0.3, 0.0))) * (1.0 - smoothstep(6.0, 40.0, dist));
        col = mix(col, cSeaLight * 1.5, ticks * 0.35);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  }));
  sea.receiveShadow = false;
  scene.add(sea);
  W.sea = sea; W.u.sea = seaU;

  // ---------------- beach ----------------
  const sandM = toon('#e0a882', { rim: 0 });
  W.sandM = sandM;
  if (o.beach !== false) {
    const g = new THREE.PlaneGeometry(160, 80, 160, 80);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    const r = rng(11);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i) + 40 + o.shoreZ;
      p.setZ(i, z);
      const d = z - o.shoreZ;
      let y = d * 0.05 + Math.sin(x * 0.35) * 0.03 + Math.sin(x * 0.11 + z * 0.2) * 0.08 * Math.min(1, Math.max(0, d / 8));
      if (d < 0) y = d * 0.12;
      p.setY(i, y);
    }
    g.computeVertexNormals();
    const beach = new THREE.Mesh(g, sandM);
    beach.receiveShadow = true;
    scene.add(beach);
    W.beach = beach;

    // foam strip along the shore
    const foamU = { time: { value: 0 }, cFoam: { value: new THREE.Color('#fff1e6') }, ...THREE.UniformsLib.fog };
    const fg = new THREE.PlaneGeometry(160, 2.4, 200, 1); fg.rotateX(-Math.PI / 2);
    const foam = new THREE.Mesh(fg, new THREE.ShaderMaterial({
      uniforms: foamU, transparent: true, depthWrite: false, fog: true,
      vertexShader: `varying vec2 vUv; varying vec3 vW;
        #include <common>
        #include <fog_pars_vertex>
        void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `uniform float time; uniform vec3 cFoam; varying vec2 vUv; varying vec3 vW;
        #include <common>
        #include <fog_pars_fragment>
        ${NOISE}
        void main(){
          float wv = sin(time * 0.9) * 0.5 + 0.5;
          float edge = 0.35 + wv * 0.3 + (noise(vec2(vW.x * 0.8, time * 0.2)) - 0.5) * 0.25;
          float line = smoothstep(0.035, 0.0, abs(vUv.y - edge));
          float line2 = smoothstep(0.02, 0.0, abs(vUv.y - edge + 0.18)) * step(0.45, noise(vec2(vW.x * 2.0, time)));
          float a = max(line, line2 * 0.7);
          gl_FragColor = vec4(cFoam, a * 0.9);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    }));
    foam.position.set(0, 0.03, o.shoreZ + 0.2);
    scene.add(foam);
    W.u.foam = foamU;
  }

  // ---------------- lights ----------------
  const hemi = new THREE.HemisphereLight('#9a7bc4', '#d88d6c', 1.15);
  scene.add(hemi);
  const key = new THREE.DirectionalLight('#ffb684', 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -7; key.shadow.camera.right = 7; key.shadow.camera.top = 7; key.shadow.camera.bottom = -7;
  key.shadow.camera.near = 1; key.shadow.camera.far = 80;
  key.shadow.bias = -0.0008; key.shadow.normalBias = 0.02;
  scene.add(key); scene.add(key.target);
  const fill = new THREE.DirectionalLight('#ffc6c0', 1.1);
  scene.add(fill); scene.add(fill.target);
  W.hemi = hemi; W.key = key; W.fill = fill;
  W.focus = new THREE.Vector3(0, 1, 0);

  scene.fog = new THREE.Fog('#c46a6e', 30, 420);

  // ---------------- particles ----------------
  {
    const N = 260, r = rng(5);
    const pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = (r() - 0.5) * 16; pos[i * 3 + 1] = r() * 5; pos[i * 3 + 2] = (r() - 0.5) * 16; seed[i] = r(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const pu = { time: { value: 0 }, color: { value: new THREE.Color('#ffd7a8') }, size: { value: 38 }, center: { value: new THREE.Vector3() } };
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: pu, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float time, size; uniform vec3 center; attribute float seed; varying float vA;
        void main(){ vec3 p = position + center;
          p.x += sin(time * 0.3 + seed * 40.0) * 0.4; p.y += mod(time * (0.05 + seed * 0.08) + seed * 5.0, 5.0) - position.y + position.y * 0.0; p.z += cos(time * 0.25 + seed * 30.0) * 0.4;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          vA = (0.4 + 0.6 * sin(time * 1.5 + seed * 60.0)) * smoothstep(0.0, 0.6, p.y - center.y) * (1.0 - smoothstep(4.0, 5.0, p.y - center.y));
          gl_PointSize = size * (0.4 + seed) / -mv.z; }`,
      fragmentShader: `uniform vec3 color; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(color * 1.6, a * vA * 0.8); }`,
    }));
    pts.frustumCulled = false;
    scene.add(pts);
    W.particles = pts; W.u.particles = pu;
  }

  W.groundY = (x, z) => {
    const d = z - o.shoreZ;
    if (d < 0) return d * 0.12;
    return d * 0.05 + Math.sin(x * 0.35) * 0.03 + Math.sin(x * 0.11 + z * 0.2) * 0.08 * Math.min(1, Math.max(0, d / 8));
  };

  W.setPhase = (phase) => {
    W.phase = phase;
    const P = paletteAt(phase);
    W.pal = P;
    skyU.cTop.value.copy(P.top); skyU.cMid.value.copy(P.mid); skyU.cHorizon.value.copy(P.horizon);
    skyU.cGlow.value.copy(P.glow); skyU.cSun.value.copy(P.sun);
    skyU.night.value = Math.max(0, phase - 1);
    seaU.cSea.value.copy(P.sea); seaU.cSeaLight.value.copy(P.seaLight); seaU.cHorizon.value.copy(P.horizon);
    seaU.cGlow.value.copy(P.glow); seaU.cSun.value.copy(P.sun);
    sandM.color.copy(P.sand);
    scene.fog.color.copy(P.fog);
    hemi.color.copy(P.hemiSky); hemi.groundColor.copy(P.hemiGround);
    key.color.copy(P.key); fill.color.copy(P.fill);
    W.u.particles.color.value.copy(P.glow);
  };

  W.update = (t, camera) => {
    skyU.time.value = t; seaU.time.value = t;
    if (W.u.foam) W.u.foam.time.value = t;
    W.u.particles.time.value = t;
    W.u.particles.center.value.set(W.focus.x, 0, W.focus.z);
    // key light follows focus; comes from the sun direction
    key.position.copy(W.focus).addScaledVector(W.sunDir, 30);
    key.position.y = Math.max(key.position.y, W.focus.y + 6);
    key.target.position.copy(W.focus);
    // fill from camera side
    fill.position.copy(camera.position).add(new THREE.Vector3(1.5, 2.5, 0));
    fill.target.position.copy(W.focus);
  };

  W.setPhase(0);
  return W;
}

// ---------------- props ----------------
export function palm(seed = 1, h = 5) {
  const r = rng(seed);
  const g = new THREE.Group();
  const trunkM = toon('#5a3a3a', { rim: 0.6 });
  const leafM = toon('#2d4a3e', { rim: 0.8, side: THREE.DoubleSide });
  const lean = (r() - 0.5) * 0.8;
  const pts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(Math.sin(t * 1.4) * lean * h * 0.35, t * h, 0)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const trunk = mesh(new THREE.TubeGeometry(curve, 24, 0.13, 8), trunkM);
  g.add(trunk);
  // trunk rings
  for (let i = 1; i < 12; i++) {
    const p = curve.getPoint(i / 12);
    const ring = mesh(new THREE.TorusGeometry(0.135, 0.025, 5, 10), trunkM, { outline: false });
    ring.position.copy(p); ring.rotation.x = Math.PI / 2; g.add(ring);
  }
  const top = curve.getPoint(1);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + r() * 0.4;
    const leaf = new THREE.Group();
    const len = 1.6 + r() * 0.6;
    for (let k = 0; k < 6; k++) {
      const t = k / 6;
      const seg = mesh(new THREE.SphereGeometry(0.22, 8, 6), leafM, { width: 0.0016 });
      seg.scale.set(1.2 - t * 0.7, 0.12, 0.7);
      seg.position.set(0, -t * t * 0.9, t * len);
      leaf.add(seg);
    }
    leaf.position.copy(top);
    leaf.rotation.y = a;
    leaf.rotation.x = -0.25 + r() * 0.2;
    g.add(leaf);
  }
  return g;
}

export function rock(seed = 1, s = 1, color = '#4b3d5c') {
  const r = rng(seed);
  const geo = new THREE.DodecahedronGeometry(s, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + r() * 0.4), p.getY(i) * (0.6 + r() * 0.3), p.getZ(i) * (0.8 + r() * 0.4));
  const flat = geo.toNonIndexed(); flat.computeVertexNormals();
  return mesh(flat, toon(color, { rim: 0.7 }));
}

export function island(seed = 1, w = 40, h = 8, color = '#3a2a4f') {
  const r = rng(seed);
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  const n = 12;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const y = Math.sin(t * Math.PI) * h * (0.6 + r() * 0.5);
    shape.lineTo(-w / 2 + t * w, y);
  }
  shape.lineTo(w / 2, 0);
  const geo = new THREE.ShapeGeometry(shape);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, fog: true }));
}

export function birds(n = 5, seed = 3) {
  const g = new THREE.Group();
  const r = rng(seed);
  const m = new THREE.MeshBasicMaterial({ color: '#2a1630', side: THREE.DoubleSide, fog: false });
  for (let i = 0; i < n; i++) {
    const b = new THREE.Group();
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.06), m);
      wing.position.x = s * 0.24; wing.name = 'w' + s;
      b.add(wing);
    }
    b.position.set((r() - 0.5) * 8, (r() - 0.5) * 1.5, (r() - 0.5) * 3);
    b.userData.seed = r();
    g.add(b);
  }
  g.userData.update = (t) => {
    g.children.forEach((b) => {
      const s = b.userData.seed;
      const flap = Math.sin(t * 7 + s * 20) * 0.5;
      b.children[0].rotation.z = -flap; b.children[1].rotation.z = flap;
      b.children[0].position.y = b.children[1].position.y = 0;
      b.position.x += 0; // driven by group
    });
  };
  return g;
}
