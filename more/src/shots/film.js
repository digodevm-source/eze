// The whole "море" verse: 25 shots cut to the lyric timing.
import * as THREE from 'three';
import { buildWorld, palm, island, rock, birds } from '../world.js';
import { buildCharacter } from '../character.js';
import { P, blend, rapLayer, breathe, blinkAt } from '../anim.js';
import * as PR from '../props.js';
import { lerp, smooth, easeOut, easeInOut, clamp01, toon } from '../toon.js';
const PR_toon = (tex) => toon('#ffffff', { map: tex, rim: 0 });

export const MAIN = { seed: 3 };
export const BRO = {
  seed: 9, tee: '#e9e4dc', teePrint: 'wave', shorts: '#2b2d3a', shoes: '#26252b', sole: '#d8d4cc',
  hair: { type: 'straight', color: '#14121a', light: '#3a3550' }, iris: '#6b4a36', irisDark: '#3a261b', skin: '#eec0a6',
};
const BARMAN = {
  seed: 21, tee: '#3a8f86', teePrint: 'none', shorts: '#e9dcc4', shoes: '#8a5238', sole: '#3b2a22', skin: '#d9a07e',
  hair: { type: 'straight', color: '#3b2418', light: '#6a4430' }, iris: '#4a3020', irisDark: '#2a1a10', face: { mustache: true, sleepy: 0.15 },
};
const GIRL = (i) => ({
  seed: 40 + i, tee: ['#e8457a', '#7f8cf0', '#f3c35f', '#5fd0c4', '#c87de0'][i % 5], teePrint: 'none', shorts: '#2a2238', shoes: '#f3ead8',
  hair: { type: 'long', color: ['#1a1220', '#5a3020', '#d8b070', '#2a1a14', '#8a3a2a'][i % 5], light: '#6a5060' },
  skin: ['#f1c6ae', '#d9a07e', '#f5d0b8', '#c98f6c', '#eec0a6'][i % 5], iris: '#5a7a8a', face: { sleepy: 0.2 }, headScale: 1.12,
});

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export async function build(E, params) {
  const T = await (await fetch('audio/timing.json')).json();
  const scene = E.scene, cam = E.camera;
  const world = buildWorld(scene, { shoreZ: -2 });
  const gy = world.groundY;

  // ---------- environment dressing ----------
  const env = new THREE.Group(); scene.add(env);
  [[-150, -380, 160, 14, '#3a2a4f', 2], [110, -360, 90, 8, '#4a3060', 5], [10, -420, 70, 22, '#2e2244', 9]].forEach(([x, z, w, h, c, s]) => {
    const isl = island(s, w, h, c); isl.position.set(x, -0.5, z); env.add(isl);
  });
  const palms = [];
  [[-6, 3], [-9, 6], [7, 4.5], [11, 2.5], [-20, 4], [24, 5], [-34, 3], [32, 2]].forEach(([x, z], i) => {
    const p = palm(i * 3 + 1, 5 + (i % 3)); p.position.set(x, gy(x, z), z); p.rotation.y = i * 1.3; env.add(p); palms.push(p);
  });
  [[2.5, -1.2, 0.45], [-3.4, -0.6, 0.6], [5, 0.5, 0.35], [-28, -1, 0.7]].forEach(([x, z, s], i) => { const r = rock(i + 3, s); r.position.set(x, gy(x, z), z); env.add(r); });
  const flock = birds(6, 3); flock.position.set(0, 9, -40); scene.add(flock);

  // road + embankment + roadside palms (car shots)
  const ROADZ = 12;
  const roadG = new THREE.Group(); scene.add(roadG);
  {
    const r = PR.road(500); r.position.set(0, 1.0, ROADZ); roadG.add(r);
    const emb = new THREE.Mesh(new THREE.BoxGeometry(500, 1.2, 7.6), world.sandM); emb.position.set(0, 0.39, ROADZ); emb.receiveShadow = true; roadG.add(emb);
    for (let i = 0; i < 40; i++) {
      const x = -200 + i * 10 + (i % 3) * 2.5;
      const p = palm(100 + i, 5 + (i % 3)); p.position.set(x, gy(x, ROADZ - 6), ROADZ - 6 - (i % 2) * 2); p.rotation.y = i; roadG.add(p);
    }
  }
  const carG = PR.car('#e8796a'); scene.add(carG);

  // characters
  const A = buildCharacter(MAIN), B = buildCharacter(BRO), C = buildCharacter(BARMAN);
  scene.add(A.root, B.root, C.root);
  const girls = [];
  for (let i = 0; i < 5; i++) { const g = buildCharacter(GIRL(i)); scene.add(g.root); girls.push(g); }

  // props
  const sheets = new THREE.Group(); scene.add(sheets);
  for (let i = 0; i < 9; i++) { const s = PR.paperSheet(i + 1); s.scale.setScalar(1.7); s.userData.base = V((i % 3 - 1) * 1.0 + (i * 0.37 % 0.5) - 0.2, 0, -3.4 - Math.floor(i / 3) * 1.3); sheets.add(s); }
  const LNG = V(-14, 0, 2);
  const loungeG = new THREE.Group(); scene.add(loungeG);
  const l1 = PR.lounger('#7fc8c2'), l2 = PR.lounger('#f3c35f');
  l1.position.set(LNG.x - 0.55, gy(LNG.x, LNG.z), LNG.z); l2.position.set(LNG.x + 0.55, gy(LNG.x, LNG.z), LNG.z);
  loungeG.add(l1, l2);
  const umb = PR.umbrella(); umb.position.set(LNG.x, gy(LNG.x, LNG.z), LNG.z + 0.3); loungeG.add(umb);
  const ph = PR.phone(); scene.add(ph);
  const BAR = V(16, 0, 4);
  const bar = PR.beachBar(); bar.position.set(BAR.x, gy(BAR.x, BAR.z), BAR.z); scene.add(bar);
  const pourBottle = PR.bottle('#f3c35f');
  const barGlasses = [PR.glass('tumbler', '#f2a64a', 0), PR.glass('tumbler', '#f2a64a', 0)];
  barGlasses.forEach((g, i) => { g.position.set(BAR.x - 0.25 + i * 0.5, gy(BAR.x, BAR.z) + 1.12, BAR.z + 0.15); scene.add(g); });
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 8), new THREE.MeshBasicMaterial({ color: '#f2a64a' })); scene.add(stream);
  const lames = []; for (let i = 0; i < 4; i++) { const l = PR.lame(i + 2); scene.add(l); lames.push(l); }
  const signG = PR.sign('ВЫХОДНЫЕ', 'не беспокоить'); scene.add(signG);
  const glassesA = PR.sunglasses(), glassesB = PR.sunglasses();
  A.J.head.add(glassesA); B.J.head.add(glassesB);
  const mags = [['МОДА', 'что носить летом', '#e8457a'], ['STYLE', 'must have 2026', '#7f8cf0'], ['ТРЕНД', 'все так ходят', '#f3a14a'], ['ГЛЯНЕЦ', 'новый сезон', '#5fd0c4'], ['VOGA', 'ты не в тренде', '#c87de0'], ['МОДА', 'топ-10 образов', '#ff6f61']]
    .map(([a, b, c], i) => { const m = PR.magazine(a, b, c, i + 1); scene.add(m); return m; });
  const arrow = PR.trendArrow(); scene.add(arrow);
  const splashG = PR.splash(60, 3); scene.add(splashG);
  const wind = PR.windLines(30, 4); scene.add(wind);
  const PIER = V(-30, 0, -2);
  const pierG = PR.pier(16); pierG.position.set(PIER.x, 0, PIER.z + 0.5); scene.add(pierG);
  const tumA = PR.glass('tumbler', '#f2a64a', 0.6), tumB = PR.glass('tumbler', '#f2a64a', 0.6);
  scene.add(tumA, tumB);
  const drops = PR.splash(30, 8, '#f2a64a'); drops.scale.setScalar(0.08); scene.add(drops);
  const ctl = PR.cocktail(); scene.add(ctl);
  const shots4 = [0, 1, 2, 3].map(() => PR.glass('shot', '#f4f0ff', 0.75)); shots4.forEach((g) => scene.add(g));

  const ALL = [roadG, carG, A.root, B.root, C.root, ...girls.map((g) => g.root), sheets, loungeG, ph, bar, pourBottle, ...barGlasses, stream, ...lames, signG, ...mags, arrow, splashG, wind, pierG, tumA, tumB, drops, ctl, ...shots4, flock];
  const show = (...objs) => { ALL.forEach((o) => (o.visible = false)); objs.forEach((o) => (o.visible = true)); };

  // ---------- helpers ----------
  const fps = T.fps;
  const sample = (arr, t) => { const f = t * fps; const i = Math.floor(f); const k = f - i; const a = arr[Math.max(0, Math.min(arr.length - 1, i))], b = arr[Math.max(0, Math.min(arr.length - 1, i + 1))]; return a + (b - a) * k; };
  const beatPhase = (t) => { const bs = T.beats; let i = 0; while (i < bs.length - 1 && bs[i + 1] <= t) i++; const d = (bs[i + 1] ?? bs[i] + 0.464) - bs[i]; return clamp01((t - bs[i]) / d); };
  let shake = 0.006;
  const setCam = (p, tg, fov = 35, t = 0) => {
    const k = sample(T.kick, t);
    cam.position.copy(p);
    cam.position.x += Math.sin(t * 1.7) * shake + Math.sin(t * 4.3) * shake * 0.4;
    cam.position.y += Math.sin(t * 2.3 + 1) * shake;
    cam.lookAt(tg);
    cam.fov = fov * (1 - k * 0.012);
    cam.updateProjectionMatrix();
  };
  const camPath = (p0, p1, t0, t1, k, fov, t) => setCam(p0.clone().lerp(p1, k), t0.clone().lerp(t1, k), fov, t);
  const seatHips = (ch, hp, ry = 0, rx = 0) => {
    ch.root.rotation.set(rx, ry, 0);
    ch.root.updateMatrix();
    const off = V(0, ch.J.hips.position.y, 0).applyEuler(ch.root.rotation);
    ch.root.position.copy(hp).sub(off);
  };
  const place = (ch, x, z, ry = 0, dy = 0) => { ch.root.position.set(x, gy(x, z) + dy, z); ch.root.rotation.set(0, ry, 0); };
  const faceUpdate = (t, extraA = {}, extraB = {}) => {
    A.face.set({ open: sample(T.mouthA, t), oShape: sample(T.oA, t), blink: blinkAt(t, 1), lookX: 0, lookY: 0, smile: 0, wink: 0, squint: 0, brow: 0, lid: null, ...extraA });
    B.face.set({ open: sample(T.mouthB, t), oShape: sample(T.oB, t), blink: blinkAt(t, 2), lookX: 0, lookY: 0, smile: 0, wink: 0, squint: 0, brow: 0, lid: null, ...extraB });
  };
  const singer = (t) => { for (const L of T.lines) if (t >= L.t0 - 0.1 && t < L.until) return L.singer; return null; };
  const pose = (ch, base, t, { rap = 0, hand = 'R' } = {}) => {
    let p = breathe(base, t + (ch === B ? 1.3 : 0));
    const m = sample(ch === A ? T.mouthA : T.mouthB, t);
    if (rap > 0) p = rapLayer(p, t, m, beatPhase(t), rap, hand);
    else {
      const nod = Math.pow(Math.max(0, Math.cos(beatPhase(t) * Math.PI * 2)), 6) * 0.04;
      p.head = [p.head[0] + nod, p.head[1], p.head[2]];
    }
    ch.apply(p);
  };
  const hairWind = (ch, amt, t) => { ch.J.hairMesh.rotation.z = Math.sin(t * 7 + ch.o.seed) * 0.03 * amt; ch.J.hairMesh.rotation.x = -Math.abs(Math.sin(t * 5.3)) * 0.04 * amt; };
  const resetChars = () => {
    [A, B].forEach((ch) => { ch.longBangs(0); ch.root.rotation.set(0, 0, 0); hairWind(ch, 0, 0); });
    glassesA.visible = glassesB.visible = false;
  };
  const w = (li, wi) => T.lines[li].words[wi];

  // ---------- shots ----------
  const S = [];
  const shot = (t0, t1, fn, opts = {}) => S.push({ t0, t1, fn, ...opts });
  const L = T.lines;

  // 0 — intro: glide over the water towards the sun
  shot(0, L[0].t0 - 0.12, (lt, t, d) => {
    show(flock); world.setPhase(0.0);
    const k = easeInOut(lt / d);
    camPath(V(0, 2.6, 6), V(0, 1.2, -6), V(0, 2.2, -60), V(0, 1.4, -60), k, 40, t);
    world.focus.set(0, 0, -4); world.u.sea.amp.value = 1;
  }, { title: true });

  // 1 — car, side tracking
  shot(L[0].t0 - 0.12, w(0, 5).t0 - 0.05, (lt, t) => {
    show(roadG, carG, A.root, B.root); world.setPhase(0.05);
    const x = 40 - t * 9;
    carG.position.set(x, 1.0, ROADZ); carG.rotation.set(0, -Math.PI / 2, 0); carG.userData.update(t, 9);
    carG.position.y += Math.sin(t * 13) * 0.008;
    seatIn(A, carG, 0.38, P.drive, t, 0); seatIn(B, carG, -0.38, P.sitSeat, t, 0);
    hairWind(A, 1, t); hairWind(B, 1, t);
    faceUpdate(t, {}, { smile: 0.5 });
    camPath(V(x - 4.6, 3.3, ROADZ + 3.4), V(x - 4.0, 3.1, ROADZ + 3.0), V(x - 0.1, 2.35, ROADZ + 0.0), V(x - 0.1, 2.4, ROADZ + 0.0), smooth(lt / 2), 34, t);
    world.focus.set(x, 1, ROADZ);
  });

  // 2 — "и чёлка до колена": bangs grow to the knees
  shot(w(0, 5).t0 - 0.05, L[1].t0 - 0.05, (lt, t, d) => {
    show(roadG, carG, A.root, B.root); world.setPhase(0.07);
    const x = 40 - t * 9;
    carG.position.set(x, 1.0, ROADZ); carG.rotation.set(0, -Math.PI / 2, 0); carG.userData.update(t, 9);
    seatIn(A, carG, 0.38, P.drive, t, 0); seatIn(B, carG, -0.38, P.sitSeat, t, 0);
    const grow = easeOut((t - w(0, 6).t0 + 0.1) / 1.0);
    A.longBangs(grow, t);
    hairWind(A, 1.4, t); hairWind(B, 1, t);
    faceUpdate(t, {}, { smile: 0.8, open: 0.35 * grow, squint: 0.6 * grow, lookX: -0.6 });
    // front 3/4 view, car coming towards camera (car moves -x)
    camPath(V(x - 1.35, 2.75, ROADZ + 2.1), V(x - 1.2, 2.65, ROADZ + 1.9), V(x + 0.05, 2.4, ROADZ + 0.38), V(x + 0.05, 2.3, ROADZ + 0.38), smooth(lt / d), 36, t);
    world.focus.set(x, 1, ROADZ);
  });

  // 3 — lyric sheets floating on the water
  shot(L[1].t0 - 0.05, w(1, 5).t0 - 0.1, (lt, t, d) => {
    show(sheets, flock); world.setPhase(0.1);
    sheets.children.forEach((s, i) => {
      const b = s.userData.base;
      const x = b.x + Math.sin(t * 0.5 + i) * 0.15 + lt * 0.12, z = b.z + lt * 0.15;
      const hgt = Math.sin(x * 1.1 + t * 1.3) * 0.08 + Math.sin(z * 0.9 + t * 1.9) * 0.04;
      s.position.set(x, hgt + 0.2, z);
      s.rotation.set(Math.sin(t * 1.3 + i) * 0.12, i * 0.7 + t * 0.05, Math.cos(t * 1.1 + i) * 0.12);
    });
    camPath(V(-0.5, 0.95, -1.2), V(0.2, 0.85, -1.7), V(0, 0.1, -4.4), V(0.2, 0.15, -5.2), smooth(lt / d), 38, t);
    world.focus.set(0, 0, -4);
  });

  // 4 — knee-deep in the sea
  shot(w(1, 5).t0 - 0.1, L[2].t0 - 0.05, (lt, t, d) => {
    show(A.root, B.root, flock); world.setPhase(0.12);
    place(A, 0.35, -4.2, -0.15); A.root.position.y = -0.72;
    place(B, -0.4, -4.0, 0.2); B.root.position.y = -0.72;
    pose(A, P.crossed, t); pose(B, P.pockets, t);
    faceUpdate(t, { lid: 0.45 }, { lid: 0.45, smile: 0.2 });
    camPath(V(0.0, 0.5, 1.0), V(0.0, 0.5, 0.4), V(0, 0.72, -4.1), V(0, 0.75, -4.1), smooth(lt / d), 34, t);
    world.focus.set(0, 0, -4);
  });

  // 5 — phone blowing up with notifications
  shot(L[2].t0 - 0.05, w(2, 4).t0 - 0.08, (lt, t, d) => {
    show(ph, loungeG); world.setPhase(0.14);
    ph.position.set(LNG.x - 0.55, gy(LNG.x, LNG.z) + 0.43, LNG.z + 0.0); ph.rotation.set(0, 0.15, 0);
    const n = L[2].words.filter((x) => x.t0 <= t + 0.05).length;
    ph.userData.setCount(Math.min(7, 1 + n));
    ph.position.y += Math.abs(Math.sin(t * 60)) * 0.004 * (n > 0 ? 1 : 0);
    const c = ph.position;
    camPath(V(c.x + 0.05, c.y + 1.0, c.z + 0.25), V(c.x, c.y + 0.85, c.z + 0.18), c.clone(), c.clone(), smooth(lt / d), 40, t);
    world.focus.copy(c);
  });

  // 6 — lazy on the loungers
  shot(w(2, 4).t0 - 0.08, L[3].t0 - 0.05, (lt, t, d) => {
    show(loungeG, A.root, B.root, ph); world.setPhase(0.17);
    const y0 = gy(LNG.x, LNG.z);
    for (const [ch, dx] of [[A, -0.55], [B, 0.55]]) seatHips(ch, V(LNG.x + dx, y0 + 0.55, LNG.z + 0.25), Math.PI, 0.95);
    pose(A, P.lounge, t); pose(B, P.lounge, t + 0.6);
    const flip = easeOut((t - w(2, 7).t0) / 0.35);
    ph.position.set(LNG.x - 1.0, y0 + 0.43, LNG.z - 0.3); ph.rotation.set(0, 0, Math.PI * flip);
    ph.position.y += Math.sin(flip * Math.PI) * 0.12;
    faceUpdate(t, { lid: 0.62 }, { lid: 0.7, smile: 0.3 });
    camPath(V(LNG.x - 0.3, y0 + 1.25, LNG.z - 3.2), V(LNG.x - 0.15, y0 + 1.15, LNG.z - 2.8), V(LNG.x, y0 + 0.75, LNG.z + 0.3), V(LNG.x, y0 + 0.75, LNG.z + 0.3), smooth(lt / d), 36, t);
    world.focus.set(LNG.x, 1, LNG.z);
  });

  // 7 — watching the sunset from behind
  shot(L[3].t0 - 0.05, w(3, 4).t0 - 0.12, (lt, t, d) => {
    show(A.root, B.root, flock); world.setPhase(0.2);
    seatHips(A, V(0.42, gy(0.42, -0.6) + 0.14, -0.6), Math.PI); seatHips(B, V(-0.42, gy(-0.42, -0.6) + 0.14, -0.6), Math.PI);
    pose(A, P.sitSand, t); pose(B, P.sitSand, t + 0.5);
    faceUpdate(t);
    camPath(V(0.0, 1.05, 2.6), V(0.0, 1.0, 1.9), V(0, 1.2, -20), V(0, 1.1, -20), smooth(lt / d), 36, t);
    world.focus.set(0, 0.5, -0.6);
  });

  // 8 — "бармен, ты пока лей нам"
  shot(w(3, 4).t0 - 0.12, L[4].t0 - 0.05, (lt, t, d) => {
    show(bar, C.root, A.root, B.root, pourBottle, ...barGlasses, stream); world.setPhase(0.24);
    const y0 = gy(BAR.x, BAR.z);
    C.root.position.set(BAR.x, y0, BAR.z - 0.55); C.root.rotation.set(0, 0, 0);
    const pourK = clamp01((t - w(3, 5).t0) / 1.3);
    const tilt = smooth(clamp01((t - w(3, 4).t0) / 0.3)) * (1 - smooth(clamp01((t - w(3, 8).t1) / 0.3)));
    C.apply(blend(P.stand, P.pose ?? P.stand, 0));
    const cp = blend(P.relaxed, P.holdChest, 1);
    cp.shoulderR = [-1.2 - tilt * 0.3, 0.25, -0.2]; cp.elbowR = [-0.6, 0, 0]; cp.wristR = [0, 0, 0];
    C.apply(cp);
    C.face.set({ open: 0, smile: 0.6, blink: blinkAt(t, 5), lookY: -0.4 });
    // bottle in the barman's right hand
    C.J.gripR.add(pourBottle); pourBottle.position.set(0, -0.02, 0); pourBottle.rotation.set(Math.PI - 0.1 - tilt * 1.2, 0, 0);
    const gi = pourK < 0.5 ? 0 : 1;
    barGlasses.forEach((g, i) => g.userData.setFill(i < gi ? 0.75 : i === gi ? ((pourK % 0.5) / 0.5) * 0.75 : 0));
    const target = barGlasses[gi].position;
    stream.visible = tilt > 0.6 && pourK < 1;
    stream.position.set(target.x, target.y + 0.3, target.z); stream.scale.y = 0.55;
    C.root.position.x = BAR.x + (gi === 0 ? -0.15 : 0.25);
    // brothers on stools, seen from behind
    for (const [ch, dx] of [[A, 0.75], [B, -0.75]]) seatHips(ch, V(BAR.x + dx, y0 + 0.88, BAR.z + 0.95), Math.PI);
    pose(A, blend(P.sitSeat, P.pointUp, smooth(clamp01((t - w(3, 7).t0) / 0.2)) * 0.6), t); pose(B, P.sitSeat, t);
    faceUpdate(t);
    camPath(V(BAR.x + 0.1, y0 + 2.05, BAR.z + 3.0), V(BAR.x + 0.05, y0 + 1.95, BAR.z + 2.6), V(BAR.x, y0 + 1.45, BAR.z - 0.3), V(BAR.x, y0 + 1.45, BAR.z - 0.3), smooth(lt / d), 36, t);
    world.focus.set(BAR.x, 1, BAR.z);
  });

  // 9 — sending off the lames
  shot(L[4].t0 - 0.05, w(4, 3).t0 - 0.1, (lt, t, d) => {
    show(A.root, B.root, ...lames, flock); world.setPhase(0.27);
    place(A, 0.4, 1.0, Math.PI - 0.15); place(B, -0.45, 1.1, Math.PI + 0.1);
    const wave = smooth(clamp01((t - w(4, 2).t0 + 0.25) / 0.25));
    const pa = blend(P.stand, P.waveOff, wave);
    pa.shoulderR = [pa.shoulderR[0], pa.shoulderR[1] + Math.sin(t * 14) * 0.35 * wave, pa.shoulderR[2]];
    pose(A, pa, t); pose(B, P.crossed, t);
    const diss = clamp01((t - w(4, 2).t0 - 0.05) / 0.9);
    lames.forEach((l, i) => {
      const x = (i - 1.5) * 1.6, z = -3.6 - (i % 2) * 0.9 + Math.min(lt, 1.5) * 0.3;
      l.position.set(x, -0.35, z); l.rotation.set(0, Math.sin(t + i) * 0.1, 0);
      l.userData.setDissolve(diss, t);
    });
    faceUpdate(t);
    camPath(V(1.3, 2.5, 5.8), V(1.1, 2.4, 5.3), V(-0.2, 1.0, -1.6), V(-0.2, 1.0, -1.6), smooth(lt / d), 40, t);
    world.focus.set(0, 1, 0);
  });

  // 10 — sunglasses + weekend sign
  shot(w(4, 3).t0 - 0.1, L[5].t0 - 0.05, (lt, t, d) => {
    show(A.root, B.root, signG); world.setPhase(0.3);
    place(A, 0.42, 0, -0.08); place(B, -0.42, 0.05, 0.1);
    pose(A, P.pockets, t); pose(B, P.crossed, t);
    const drop = easeOut((t - w(4, 4).t0 + 0.12) / 0.3);
    glassesA.visible = glassesB.visible = true;
    for (const gl of [glassesA, glassesB]) gl.position.set(0, 0.215 + (1 - drop) * 0.9, 0.205);
    const pop = clamp01((t - w(4, 5).t0 + 0.1) / 0.35);
    const sp = pop >= 1 ? 1 : easeOut(pop) * (1 + Math.sin(pop * 9) * 0.15 * (1 - pop));
    signG.scale.setScalar(0.62);
    signG.position.set(0.0, gy(0, 1.6) - 1.2 * (1 - sp), 1.6); signG.rotation.set(0, 0, Math.sin(t * 3) * 0.03);
    faceUpdate(t, { smile: 0.3 }, { smile: 0.4 });
    camPath(V(0.0, 1.2, 5.6), V(0.0, 1.2, 5.1), V(0, 1.3, 0), V(0, 1.35, 0), smooth(lt / d), 38, t);
    world.focus.set(0, 1, 0);
  });

  // 11 — fashion magazines blow past
  shot(L[5].t0 - 0.05, w(5, 4).t0 - 0.1, (lt, t, d) => {
    show(A.root, B.root, ...mags); world.setPhase(0.33);
    glassesA.visible = glassesB.visible = true;
    place(A, 0.42, 0, -0.1); place(B, -0.42, 0.05, 0.1);
    const sh = smooth(clamp01((t - w(5, 3).t0 + 0.3) / 0.3));
    pose(A, blend(P.stand, P.shrug, sh), t); pose(B, blend(P.pockets, P.shrug, sh * 0.8), t);
    mags.forEach((m, i) => {
      const k = lt * 0.75 - i * 0.24;
      m.position.set(1.6 - k * 2.6, 1.6 + Math.sin(k * 3 + i) * 0.3 - (i % 3) * 0.3, 1.6 + (i % 3) * 0.7);
      m.rotation.set(t * 3 + i, t * 2.3 + i * 2, t * 1.7);
    });
    faceUpdate(t, { lid: 0.4 }, { smile: 0.3 });
    camPath(V(0.0, 1.35, 5.0), V(0.0, 1.35, 4.6), V(0, 1.35, 0), V(0, 1.35, 0), smooth(lt / d), 34, t);
    world.focus.set(0, 1, 0);
  });

  // 12 — the trend arrow falls into the sea
  shot(w(5, 4).t0 - 0.1, L[6].t0 - 0.05, (lt, t, d) => {
    show(A.root, B.root, arrow, splashG); world.setPhase(0.38);
    glassesA.visible = glassesB.visible = true;
    place(A, 2.1, 0.9, Math.PI * 0.8); place(B, 2.8, 1.3, Math.PI * 0.85);
    pose(A, P.pockets, t); pose(B, P.pockets, t);
    const fall = clamp01((t - w(5, 6).t0) / 0.55);
    arrow.position.set(-0.6, gy(-0.6, -1.7), -1.7);
    arrow.rotation.set(-easeInOut(fall) * 1.45, 0.25, 0);
    arrow.scale.setScalar(1.1);
    const sk = clamp01((t - w(5, 6).t0 - 0.5) / 1.1);
    splashG.position.set(-0.6, 0, -3.8); splashG.userData.set(sk * 1.1);
    faceUpdate(t, { lookX: -0.5 }, { lookX: -0.5 });
    camPath(V(1.2, 1.45, 4.4), V(1.0, 1.5, 4.0), V(-0.4, 1.0, -2.0), V(-0.6, 0.9, -2.6), smooth(lt / d), 40, t);
    world.focus.set(0, 1, 0);
  });

  // 13 — brother's profile watching the waves
  shot(L[6].t0 - 0.05, w(6, 5).t0 - 0.1, (lt, t, d) => {
    show(B.root, flock); world.setPhase(0.5 + lt * 0.04);
    place(B, 0, -0.8, Math.PI);
    pose(B, P.pockets, t);
    hairWind(B, 1.5, t);
    world.u.sea.amp.value = 1.6;
    faceUpdate(t, {}, { lookX: 0.1 });
    camPath(V(1.3, 1.8, -2.25), V(1.15, 1.76, -2.15), V(0, 1.68, -0.85), V(0, 1.66, -0.9), smooth(lt / d), 32, t);
    world.focus.set(0, 1, -0.8);
  });

  // 14 — wind over the waves
  shot(w(6, 5).t0 - 0.1, L[7].t0 - 0.05, (lt, t, d) => {
    show(B.root, wind, flock); world.setPhase(0.6 + lt * 0.05);
    place(B, 0, -0.8, Math.PI);
    pose(B, P.pockets, t); hairWind(B, 2, t);
    world.u.sea.amp.value = 2.0;
    wind.position.set(-1.6, 0.4, -1.6); wind.rotation.y = Math.PI / 2; wind.userData.update(t);
    faceUpdate(t);
    camPath(V(-3.6, 0.8, -3.2), V(-3.2, 0.9, -3.3), V(0, 1.2, -1.0), V(0, 1.2, -0.95), smooth(lt / d), 40, t);
    world.focus.set(0, 1, -1.5);
  });

  // pier helpers
  const pierEnd = V(PIER.x, 0.94, PIER.z + 0.5 - 15.9 + 0.2);
  const onPier = (t, ra = 0, rb = 0) => {
    seatHips(A, V(pierEnd.x + 0.36, pierEnd.y + 0.1, pierEnd.z), Math.PI + ra);
    seatHips(B, V(pierEnd.x - 0.36, pierEnd.y + 0.1, pierEnd.z), Math.PI + rb);
  };

  // 15 — on the pier: "со своим хоуми" fist bump
  shot(L[7].t0 - 0.05, w(7, 5).t0 - 0.1, (lt, t, d) => {
    show(pierG, A.root, B.root); world.setPhase(0.82 + lt * 0.05);
    onPier(t);
    const bump = smooth(clamp01((t - w(7, 4).t0 + 0.35) / 0.3)) * (1 - smooth(clamp01((t - w(7, 4).t1 - 0.25) / 0.3)));
    const pa = blend(P.sitEdge, P.fistOut, bump), pb = blend(P.sitEdge, mirrorArm(P.fistOut), bump);
    onPier(t, -0.3 * bump, 0.3 * bump);
    pose(A, pa, t); pose(B, pb, t);
    faceUpdate(t, { smile: 0.5 * bump, lookX: 0.6 * bump }, { smile: 0.4, lookX: -0.6 * bump });
    camPath(V(pierEnd.x + 0.0, 1.55, pierEnd.z - 3.3), V(pierEnd.x + 0.0, 1.6, pierEnd.z - 2.9), V(pierEnd.x, 1.55, pierEnd.z), V(pierEnd.x, 1.55, pierEnd.z), smooth(lt / d), 38, t);
    world.focus.copy(pierEnd);
  });

  // 16 — pier wide, evening
  shot(w(7, 5).t0 - 0.1, L[8].t0 - 0.05, (lt, t, d) => {
    show(pierG, A.root, B.root, flock); world.setPhase(0.95 + lt * 0.08);
    onPier(t);
    pose(A, P.sitEdge, t); pose(B, P.sitEdge, t + 0.7);
    faceUpdate(t);
    camPath(V(PIER.x + 6, 2.4, PIER.z + 3.5), V(PIER.x + 5, 3.2, PIER.z + 4.5), V(pierEnd.x, 1.0, pierEnd.z), V(pierEnd.x, 1.0, pierEnd.z - 2), smooth(lt / d), 34, t);
    world.focus.copy(pierEnd);
  });

  // 17 — cheers close-up
  shot(L[8].t0 - 0.05, w(8, 2).t0 - 0.1, (lt, t, d) => {
    show(tumA, tumB, drops, pierG); world.setPhase(1.1);
    const clink = w(8, 1).t0;
    const k = easeOut(clamp01((t - (clink - 0.5)) / 0.5));
    const base = V(pierEnd.x, 1.55, pierEnd.z - 0.75);
    tumA.position.copy(base).add(V(0.25 * (1 - k) + 0.047, 0, 0)); tumB.position.copy(base).add(V(-0.25 * (1 - k) - 0.047, 0, 0));
    tumA.rotation.set(0, 0, 0.12 * k); tumB.rotation.set(0, 0, -0.12 * k);
    drops.position.copy(base).add(V(0, 0.13, 0)); drops.userData.set(clamp01((t - clink) / 0.8) * 0.9);
    faceUpdate(t);
    camPath(V(base.x + 0.1, base.y + 0.12, base.z - 0.95), V(base.x - 0.05, base.y + 0.1, base.z - 0.85), base.clone().add(V(0, 0.08, 0)), base.clone().add(V(0, 0.08, 0)), smooth(lt / d), 30, t);
    world.focus.copy(base);
  });

  // 18 — panorama of the bay, moon rises
  shot(w(8, 2).t0 - 0.1, L[9].t0 - 0.05, (lt, t, d) => {
    show(pierG, A.root, B.root, bar, flock); world.setPhase(1.2 + lt * 0.1);
    onPier(t);
    pose(A, P.sitEdge, t); pose(B, P.sitEdge, t + 0.7);
    tumA.visible = tumB.visible = false;
    faceUpdate(t);
    const k = easeInOut(lt / d);
    camPath(V(pierEnd.x - 0.4, 1.4, pierEnd.z + 2.0), V(pierEnd.x - 4, 6.5, pierEnd.z + 9), V(pierEnd.x, 1.2, pierEnd.z - 8), V(pierEnd.x + 8, 1.5, pierEnd.z - 40), k, 40, t);
    world.focus.copy(pierEnd);
  });

  // 19 — lying on the sand (top-down)
  const LIE = V(4, 0, 3);
  const towels = new THREE.Group(); scene.add(towels); ALL.push(towels);
  [['#e8457a', '#fff1e0', 0.38], ['#5fd0c4', '#fff1e0', -0.38]].forEach(([c1, c2, dx]) => {
    const tex = PR.canvasTex(64, 256, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? c1 : c2; c.fillRect(0, i * h / 8, w, h / 8 + 1); } });
    const tw = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 2.1), PR_toon(tex));
    tw.rotation.x = -Math.PI / 2; tw.position.set(LIE.x + dx, gy(LIE.x + dx, LIE.z) + 0.03, LIE.z + 0.05); tw.receiveShadow = true; towels.add(tw);
  });
  shot(L[9].t0 - 0.05, w(9, 3).t0 - 0.1, (lt, t, d) => {
    show(A.root, B.root, towels); world.setPhase(1.5 + lt * 0.05);
    for (const [ch, dx] of [[A, 0.38], [B, -0.38]]) {
      ch.root.position.set(LIE.x + dx, gy(LIE.x, LIE.z) + 0.16, LIE.z + 1.0);
      ch.root.rotation.set(-Math.PI / 2, 0, 0);
    }
    const ang = (Math.sin(t * 4) * 0.5 + 0.5);
    pose(A, blend(P.lie, P.lieAngel, ang), t); pose(B, blend(P.lie, P.lieAngel, 1 - ang), t);
    faceUpdate(t, { smile: 0.4 }, { smile: 0.6, lid: 0.9 });
    const c = V(LIE.x, gy(LIE.x, LIE.z) + 0.2, LIE.z);
    cam.up.set(0, 0, -1);
    cam.up.set(0, 1, 0);
    camPath(c.clone().add(V(0.5, 2.7, 2.3)), c.clone().add(V(0.35, 2.4, 2.0)), c.clone().add(V(0, 0, -0.1)), c.clone().add(V(0, 0, -0.1)), smooth(lt / d), 38, t);
    world.focus.copy(c);
  });

  // 20 — surrounded by beauties
  shot(w(9, 3).t0 - 0.1, L[10].t0 - 0.05, (lt, t, d) => {
    show(A.root, B.root, ...girls.map((g) => g.root)); world.setPhase(1.6 + lt * 0.05);
    show(...girls.map((g) => g.root)); world.setPhase(1.6 + lt * 0.05);
    const c = V(LIE.x, gy(LIE.x, LIE.z) + 0.25, LIE.z);
    girls.forEach((g, i) => {
      const a = (i / girls.length) * Math.PI * 2 + 0.3 + lt * 0.05;
      const x = LIE.x + Math.cos(a) * 1.05, z = LIE.z + Math.sin(a) * 1.05;
      place(g, x, z, Math.atan2(LIE.x - x, LIE.z - z));
      const sway = Math.sin(t * 3.2 + i * 1.3) * 0.1;
      const wave = i % 2 ? Math.sin(t * 9 + i) * 0.4 : 0;
      g.apply({ ...P.stand, hips: [0, 0, sway * 0.5], spine: [0.42, 0, -sway], neck: [0.25, 0, 0], head: [0.45, 0, sway * 2],
        shoulderL: [-0.4, 0, 0.3 + (i % 2 ? 2.2 + wave : 0)], elbowL: [-0.3, 0, 0], shoulderR: [-0.4, 0, -0.3], elbowR: [-0.3, 0, 0] });
      g.face.set({ smile: 0.75, blink: blinkAt(t, i + 3), open: i === 2 ? 0.3 : 0, lookY: -0.6, wink: i === 1 && lt > 1.0 && lt < 1.4 ? 1 : 0 });
    });
    cam.up.set(0, 0, -1);
    const sp = lt * 0.12;
    cam.up.set(Math.sin(sp), 0, -Math.cos(sp));
    camPath(c.clone().add(V(0, 0, 0)), c.clone().add(V(0, 0.15, 0)), c.clone().add(V(0.001, 10, 0)), c.clone().add(V(0.001, 10, 0)), easeOut(lt / d), 70, t);
    world.focus.copy(c);
  });

  // 21 — cocktail macro
  shot(L[10].t0 - 0.05, w(10, 5).t0 - 0.1, (lt, t, d) => {
    show(bar, ctl); world.setPhase(1.85);
    const y0 = gy(BAR.x, BAR.z) + 1.12;
    ctl.position.set(BAR.x, y0, BAR.z + 0.15); ctl.rotation.set(0, t * 0.3, 0);
    const c = ctl.position.clone().add(V(0, 0.33, 0));
    const a = 0.6 + lt * 0.35;
    camPath(c.clone().add(V(Math.sin(a) * 0.75, 0.12, Math.cos(a) * 0.75)), c.clone().add(V(Math.sin(a + 0.2) * 0.7, 0.08, Math.cos(a + 0.2) * 0.7)), c, c, smooth(lt / d), 36, t);
    world.focus.copy(c);
  });

  // 22 — wink: "поверь, что не сок там"
  shot(w(10, 5).t0 - 0.1, L[11].t0 - 0.05, (lt, t, d) => {
    show(bar, B.root, ctl); world.setPhase(1.9);
    const y0 = gy(BAR.x, BAR.z);
    place(B, BAR.x + 0.1, BAR.z + 0.85, 0.1);
    const pb = P.drink;
    const sip = smooth(clamp01((t - w(10, 6).t0 + 0.2) / 0.3));
    const hold = blend(P.holdChest, mirrorArm(P.holdChest), 0);
    const p = blend({ ...hold, shoulderR: [-0.85, 0.2, -0.1], elbowR: [-1.6, 0, 0], shoulderL: [0.05, 0, 0.12], elbowL: [-0.2, 0, 0] }, pb, 0);
    pose(B, p, t);
    B.J.gripR.add(ctl); ctl.position.set(0, -0.12, 0.03); ctl.rotation.set(Math.PI, 0, 0); ctl.scale.setScalar(0.42);
    const wink = clamp01(1 - Math.abs(t - (w(10, 6).t0 + 0.25)) / 0.35) > 0 ? 1 : 0;
    faceUpdate(t, {}, { wink: wink, smile: 0.7 });
    const c = V(BAR.x + 0.1, y0 + 1.68, BAR.z + 0.85);
    camPath(c.clone().add(V(0.45, 0.1, 2.1)), c.clone().add(V(0.3, 0.06, 1.8)), c.clone().add(V(0, -0.1, 0)), c.clone().add(V(0, -0.08, 0)), smooth(lt / d), 34, t);
    world.focus.copy(c);
  });

  // 23 — both hands up with shots
  const FIN = V(0, 0, -0.4);
  shot(L[11].t0 - 0.05, w(11, 4).t0 - 0.1, (lt, t, d) => {
    show(A.root, B.root, ...shots4, flock); world.setPhase(1.95);
    ctl.scale.setScalar(1); scene.add(ctl); ctl.visible = false;
    place(A, FIN.x + 0.45, FIN.z, -0.12); place(B, FIN.x - 0.45, FIN.z, 0.12);
    const up = easeOut(clamp01((t - L[11].t0 + 0.1) / 0.5));
    pose(A, blend(P.stand, P.raiseBoth, up), t); pose(B, blend(P.stand, P.raiseBoth, up), t);
    attachShots();
    faceUpdate(t, { smile: 0.5 }, { smile: 0.6 });
    camPath(V(0, 0.75, 4.6), V(0, 0.7, 4.0), V(0, 1.75, 0), V(0, 1.8, 0), smooth(lt / d), 38, t);
    world.focus.set(0, 1, 0);
  });

  // 24 — "51 грамм": cheers + pull back to the moon
  shot(w(11, 4).t0 - 0.1, T.duration + 0.1, (lt, t, d) => {
    show(A.root, B.root, ...shots4, flock); world.setPhase(2.0);
    place(A, FIN.x + 0.45, FIN.z, -0.12); place(B, FIN.x - 0.45, FIN.z, 0.12);
    pose(A, P.raiseBoth, t); pose(B, P.raiseBoth, t);
    attachShots();
    faceUpdate(t, { smile: 0.7 }, { smile: 0.8 });
    const k = easeInOut(clamp01((lt - 0.5) / (d - 0.5)));
    camPath(V(0, 0.8, 4.0), V(0, 7.5, 14), V(0, 1.8, 0), V(0, 6, -60), k, 38, t);
    world.focus.set(0, 1, 0);
  }, { title: 'end' });

  function attachShots() {
    const hands = [A.J.gripL, A.J.gripR, B.J.gripL, B.J.gripR];
    shots4.forEach((g, i) => { if (g.parent !== hands[i]) hands[i].add(g); g.position.set(0, -0.06, 0.02); g.rotation.set(Math.PI, 0, 0); g.scale.setScalar(1.3); });
  }

  // seat a character into the car (car local coords)
  function seatIn(ch, carObj, sx, base, t, rap) {
    const p = V(sx, 0.95 - 1.0 + 0.0, -0.25);
    carObj.updateMatrixWorld();
    const wp = p.clone().applyMatrix4(carObj.matrixWorld);
    ch.root.position.copy(wp);
    ch.root.rotation.set(0, carObj.rotation.y, 0);
    pose(ch, base, t, { rap });
  }
  function mirrorArm(p) {
    const q = JSON.parse(JSON.stringify(p));
    for (const [a, b] of [['shoulderL', 'shoulderR'], ['elbowL', 'elbowR'], ['wristL', 'wristR']]) {
      const l = p[a], r = p[b];
      q[a] = [r[0], -r[1], -r[2]]; q[b] = [l[0], -l[1], -l[2]];
    }
    return q;
  }

  // ---------- frame update ----------
  let current = -1;
  const update = (t) => {
    let si = S.findIndex((s) => t >= s.t0 && t < s.t1);
    if (si < 0) si = t < S[0].t0 ? 0 : S.length - 1;
    const s = S[si];
    if (si !== current) { current = si; resetChars(); cam.up.set(0, 1, 0); world.u.sea.amp.value = 1; }
    // moon rises after dusk
    const ph = world.phase;
    const elev = ph < 1 ? 0.07 : 0.07 + (ph - 1) * 0.22;
    world.sunDir.set(ph < 1 ? 0 : 0.25 * (ph - 1), elev, -1).normalize();
    world.u.sky.sunSize.value = ph < 1 ? 0.9968 : 0.9984;
    s.fn(t - s.t0, t, s.t1 - s.t0);
    world.update(t, cam);
    flock.position.set(-6 + t * 0.6, 8, -36); flock.userData.update(t);
    if (bar.userData.bulbM) bar.userData.bulbM.color.set(world.phase > 0.8 ? '#ffe2a8' : '#c9a98a');
    // flashes on the drop and on "грамм"
    const fl = (tt) => Math.max(0, 1 - Math.abs(t - tt) / 0.12);
    E.grade.uniforms.flash.value = Math.max(fl(L[0].t0 - 0.12) * 0.35, fl(w(11, 5).t0) * 0.45);
  };

  const overlay = (ctx, t, drawCaption) => {
    // fade in/out
    let fade = Math.min(clamp01(t / 0.4), clamp01((T.duration - t) / 0.5));
    // title cards
    if (t < L[0].t0) {
      const a = clamp01((t - 0.3) / 0.5) * (1 - clamp01((t - (L[0].t0 - 0.5)) / 0.4));
      titleCard(ctx, a);
    }
    if (t > L[11].t1 + 0.55) titleCard(ctx, clamp01((t - L[11].t1 - 0.55) / 0.5));
    // lyrics
    for (const line of L) {
      if (t >= line.t0 - 0.15 && t < line.until) {
        const end = line === L[L.length - 1] ? line.t1 + 0.35 : line.until - 0.12;
        drawCaption(ctx, line.words, t, { top: 300, size: 80, end, maxWidth: 920 });
      }
    }
    if (fade < 1) { ctx.fillStyle = `rgba(0,0,0,${1 - fade})`; ctx.fillRect(0, 0, 1080, 1920); }
  };
  function titleCard(ctx, a) {
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(255,190,140,0.8)'; ctx.shadowBlur = 40;
    ctx.font = '700 230px CormSC, serif';
    ctx.filter = `blur(${((1 - a) * 10).toFixed(1)}px)`;
    ctx.fillText('МОРЕ', 540, 760);
    ctx.shadowBlur = 16;
    ctx.font = '600 58px CormSC, serif';
    ctx.fillText('rmw  ×  newera', 540, 850);
    ctx.restore();
  }

  return { world, duration: T.duration, update, overlay, shots: S };
}
