// Props for the "море" video. All toon-shaded with ink outlines.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon, mesh, rng } from './toon.js';

export function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  draw(c, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.userData.redraw = (fn) => { fn(c, w, h); t.needsUpdate = true; };
  return t;
}

const FONT = (px, w = 700) => `${w} ${px}px CormSC, serif`;
const SANS = (px, w = 700) => `${w} ${px}px Inter, sans-serif`;

// ---------------- car (retro convertible) ----------------
export function car(color = '#e8796a') {
  const g = new THREE.Group();
  const body = toon(color), dark = toon('#2a2430'), chrome = toon('#e9e4f0', { rim: 1.5 }), seat = toon('#f2e6d8'), glass = new THREE.MeshBasicMaterial({ color: '#9fb8e0', transparent: true, opacity: 0.1, depthWrite: false });
  const b1 = mesh(new RoundedBoxGeometry(1.7, 0.5, 3.9, 4, 0.18), body); b1.position.y = 0.55; g.add(b1);
  const hood = mesh(new RoundedBoxGeometry(1.6, 0.2, 1.3, 4, 0.1), body); hood.position.set(0, 0.84, 1.15); g.add(hood);
  const trunk = mesh(new RoundedBoxGeometry(1.6, 0.2, 0.9, 4, 0.1), body); trunk.position.set(0, 0.84, -1.4); g.add(trunk);
  // interior (cut-out look): dark tub
  const tub = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.3, 1.6), dark); tub.position.set(0, 0.86, -0.15); g.add(tub);
  for (const x of [-0.38, 0.38]) {
    const s1 = mesh(new RoundedBoxGeometry(0.6, 0.14, 0.6, 3, 0.05), seat); s1.position.set(x, 0.86, -0.25); g.add(s1);
    const s2 = mesh(new RoundedBoxGeometry(0.6, 0.65, 0.14, 3, 0.05), seat); s2.position.set(x, 1.15, -0.55); s2.rotation.x = -0.15; g.add(s2);
  }
  // windshield
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.32), glass); ws.position.set(0, 1.12, 0.52); ws.rotation.x = -0.45; ws.visible = false; g.add(ws);
  const wf = mesh(new THREE.TorusGeometry(0.02, 0.02, 4, 4), chrome, { outline: false }); g.add(wf);
  const frame = new THREE.Mesh(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.5, 0.32)), new THREE.LineBasicMaterial({ color: '#e9e4f0' }));
  frame.position.copy(ws.position); frame.rotation.copy(ws.rotation); frame.visible = false; g.add(frame);
  // steering wheel
  const sw = mesh(new THREE.TorusGeometry(0.17, 0.022, 8, 24), dark); sw.position.set(0.38, 1.12, 0.22); sw.rotation.x = -1.0; g.add(sw);
  g.userData.wheelPos = sw.position.clone();
  // wheels
  const wheels = [];
  for (const [x, z] of [[-0.82, 1.25], [0.82, 1.25], [-0.82, -1.3], [0.82, -1.3]]) {
    const w = new THREE.Group();
    const tire = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 24), dark); tire.rotation.z = Math.PI / 2; w.add(tire);
    const hub = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.28, 16), chrome, { outline: false }); hub.rotation.z = Math.PI / 2; w.add(hub);
    w.position.set(x, 0.36, z); g.add(w); wheels.push(w);
  }
  // bumpers + lights
  for (const z of [1.98, -1.98]) {
    const bp = mesh(new RoundedBoxGeometry(1.75, 0.12, 0.12, 2, 0.05), chrome); bp.position.set(0, 0.42, z); g.add(bp);
  }
  for (const x of [-0.55, 0.55]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ color: '#fff4d0' }));
    l.position.set(x, 0.7, 1.96); g.add(l);
  }
  g.userData.wheels = wheels;
  g.userData.update = (t, speed = 8) => { wheels.forEach((w) => (w.rotation.x = t * speed / 0.36)); };
  return g;
}

export function road(len = 400) {
  const g = new THREE.Group();
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(len, 7), toon('#4a3f55', { rim: 0 }));
  asphalt.rotation.x = -Math.PI / 2; asphalt.receiveShadow = true; g.add(asphalt);
  const dashM = new THREE.MeshBasicMaterial({ color: '#f3e3c8', fog: true });
  for (let x = -len / 2; x < len / 2; x += 4) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.14), dashM);
    d.rotation.x = -Math.PI / 2; d.position.set(x, 0.01, 0); g.add(d);
  }
  // guard rail on the sea side
  const railM = toon('#d9d2e6');
  const rail = mesh(new THREE.BoxGeometry(len, 0.1, 0.06), railM); rail.position.set(0, 0.62, -3.7); g.add(rail);
  for (let x = -len / 2; x < len / 2; x += 3) {
    const p = mesh(new THREE.BoxGeometry(0.08, 0.65, 0.08), railM, { outline: false }); p.position.set(x, 0.32, -3.7); g.add(p);
  }
  return g;
}

// ---------------- floating lyric sheets ----------------
export function paperSheet(seed = 1) {
  const r = rng(seed);
  const words = ['бла', 'вода', 'ну типа', 'рифма', 'короче', 'да-да', 'кхм', 'эээ', 'типа текст', '...'];
  const tex = canvasTex(256, 340, (c, w, h) => {
    c.fillStyle = '#f4efe6'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(80,120,190,0.35)'; c.lineWidth = 2;
    for (let y = 40; y < h; y += 26) { c.beginPath(); c.moveTo(14, y); c.lineTo(w - 14, y); c.stroke(); }
    c.fillStyle = '#2c2a44'; c.font = 'italic 600 22px DejaVu Serif, serif';
    for (let y = 36; y < h - 10; y += 26) {
      let x = 20;
      while (x < w - 50) { const wd = words[Math.floor(r() * words.length)]; c.fillText(wd, x, y); x += c.measureText(wd).width + 12; }
    }
    c.fillStyle = 'rgba(70,110,200,0.25)'; c.beginPath(); c.ellipse(w * 0.6, h * 0.7, 70, 40, 0.3, 0, 7); c.fill();
  });
  const geo = new THREE.PlaneGeometry(0.42, 0.56, 8, 8);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 8) * 0.012 + Math.cos(p.getY(i) * 6) * 0.01);
  geo.computeVertexNormals();
  const m = mesh(geo, toon('#ffffff', { map: tex, side: THREE.DoubleSide }), { width: 0.0012 });
  m.rotation.x = -Math.PI / 2;
  const g = new THREE.Group(); g.add(m);
  return g;
}

// ---------------- sun lounger + umbrella ----------------
export function lounger(color = '#7fc8c2') {
  const g = new THREE.Group();
  const wood = toon('#c98d5e'), cush = toon(color);
  const base = mesh(new RoundedBoxGeometry(0.7, 0.08, 1.4, 2, 0.03), cush); base.position.set(0, 0.38, -0.15); g.add(base);
  const back = mesh(new RoundedBoxGeometry(0.7, 0.08, 0.8, 2, 0.03), cush); back.position.set(0, 0.6, 0.8); back.rotation.x = 0.7; g.add(back);
  for (const [x, z] of [[-0.3, -0.75], [0.3, -0.75], [-0.3, 0.6], [0.3, 0.6]]) {
    const leg = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.36), wood, { outline: false }); leg.position.set(x, 0.18, z); g.add(leg);
  }
  return g;
}

export function umbrella(c1 = '#f5efe6', c2 = '#e8796a') {
  const g = new THREE.Group();
  const tex = canvasTex(512, 64, (c, w, h) => { for (let i = 0; i < 12; i++) { c.fillStyle = i % 2 ? c1 : c2; c.fillRect(i * w / 12, 0, w / 12 + 1, h); } });
  const top = mesh(new THREE.ConeGeometry(1.5, 0.5, 24, 1, true), toon('#ffffff', { map: tex, side: THREE.DoubleSide })); top.position.y = 2.3; g.add(top);
  const pole = mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4), toon('#d9d2e6'), { outline: false }); pole.position.y = 1.2; g.add(pole);
  return g;
}

// ---------------- phone with notifications ----------------
export function phone() {
  const g = new THREE.Group();
  const bodyM = toon('#1b1a22', { rim: 1.4 });
  const b = mesh(new RoundedBoxGeometry(0.4, 0.04, 0.8, 4, 0.04), bodyM); g.add(b);
  const NOTES = [
    ['ДЕДЛАЙН', 'Свести трек — сегодня!'],
    ['Мама', 'Ты где? Перезвони'],
    ['Напоминание', 'Сделать всё'],
    ['Продюсер', 'Где куплет??'],
    ['Банк', 'Оплатите счёт'],
    ['Работа', '12 пропущенных'],
    ['Спортзал', 'Ты не был 3 недели'],
  ];
  let shown = -1;
  const tex = canvasTex(400, 800, () => {});
  const draw = (n) => tex.userData.redraw((c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#3b2a5c'); gr.addColorStop(1, '#e58a6b');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.95)'; c.textAlign = 'center';
    c.font = SANS(92, 300); c.fillText('19:47', w / 2, 150);
    c.font = SANS(24, 500); c.fillText('суббота, 18 июля', w / 2, 190);
    c.textAlign = 'left';
    for (let i = 0; i < n; i++) {
      const y = 230 + i * 78;
      c.fillStyle = 'rgba(255,255,255,0.82)';
      c.beginPath(); c.roundRect(18, y, w - 36, 68, 16); c.fill();
      c.fillStyle = '#ff5a5f'; c.beginPath(); c.roundRect(30, y + 14, 40, 40, 10); c.fill();
      c.fillStyle = '#1b1a22'; c.font = SANS(22, 700); c.fillText(NOTES[i % NOTES.length][0], 84, y + 30);
      c.font = SANS(20, 400); c.fillText(NOTES[i % NOTES.length][1], 84, y + 56);
    }
  });
  draw(0);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.72), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  scr.rotation.x = -Math.PI / 2; scr.position.y = 0.022; g.add(scr);
  g.userData.setCount = (n) => { if (n !== shown) { shown = n; draw(n); } };
  return g;
}

// ---------------- beach bar ----------------
export function beachBar() {
  const g = new THREE.Group();
  const wood = toon('#b9774f'), woodD = toon('#8a5238'), straw = toon('#e2b56b');
  const counter = mesh(new RoundedBoxGeometry(3.2, 1.05, 0.7, 2, 0.05), wood); counter.position.set(0, 0.52, 0); g.add(counter);
  const top = mesh(new RoundedBoxGeometry(3.4, 0.08, 0.9, 2, 0.03), woodD); top.position.set(0, 1.08, 0); g.add(top);
  // planks
  for (let i = 0; i < 9; i++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.0, 0.02), woodD); l.position.set(-1.5 + i * 0.375, 0.52, 0.36); g.add(l);
  }
  for (const x of [-1.6, 1.6]) {
    const p = mesh(new THREE.CylinderGeometry(0.07, 0.08, 3.0), woodD); p.position.set(x, 1.5, -0.9); g.add(p);
    const p2 = mesh(new THREE.CylinderGeometry(0.07, 0.08, 3.0), woodD); p2.position.set(x, 1.5, 0.5); g.add(p2);
  }
  const roof = mesh(new THREE.ConeGeometry(2.6, 0.9, 8), straw); roof.position.set(0, 3.2, -0.2); roof.scale.set(1, 1, 0.75); g.add(roof);
  // back shelf with bottles
  const shelf = mesh(new THREE.BoxGeometry(2.8, 0.06, 0.3), woodD); shelf.position.set(0, 1.6, -1.0); g.add(shelf);
  const cols = ['#5bbf9a', '#e86f6a', '#f3c35f', '#7f8cf0', '#c87de0', '#9fd36a'];
  for (let i = 0; i < 9; i++) {
    const b = bottle(cols[i % cols.length]); b.position.set(-1.2 + i * 0.3, 1.63, -1.0); b.scale.setScalar(0.8); g.add(b);
  }
  // string lights
  const bulbM = new THREE.MeshBasicMaterial({ color: '#ffe2a8' });
  for (let i = 0; i < 14; i++) {
    const x = -1.6 + i * (3.2 / 13);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), bulbM);
    bulb.position.set(x, 2.55 - Math.sin((i / 13) * Math.PI) * 0.25, 0.55); g.add(bulb);
  }
  // stools
  for (const x of [-0.6, 0.6]) {
    const s = new THREE.Group();
    const seat = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16), toon('#e8796a')); seat.position.y = 0.78; s.add(seat);
    const leg = mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.78), woodD, { outline: false }); leg.position.y = 0.39; s.add(leg);
    s.position.set(x, 0, 0.75); g.add(s);
  }
  g.userData.bulbM = bulbM;
  return g;
}

export function bottle(color = '#5bbf9a') {
  const g = new THREE.Group();
  const pts = [[0.0, 0], [0.07, 0], [0.075, 0.02], [0.075, 0.2], [0.06, 0.24], [0.025, 0.29], [0.022, 0.36], [0.026, 0.37], [0.0, 0.37]].map(([x, y]) => new THREE.Vector2(x, y));
  const m = mesh(new THREE.LatheGeometry(pts, 16), toon(color, { rim: 1.5 })); g.add(m);
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.077, 0.077, 0.08, 16, 1, true), toon('#f3ead8'));
  label.position.y = 0.11; g.add(label);
  return g;
}

// glass: type 'tumbler' | 'shot' | 'cocktail'
export function glass(type = 'tumbler', liquid = '#f2a64a', fill = 0.7) {
  const g = new THREE.Group();
  const glassM = new THREE.MeshToonMaterial({ color: '#dfe9ff', transparent: true, opacity: 0.18, depthWrite: false });
  let h, r;
  if (type === 'shot') { h = 0.075; r = 0.028; }
  else if (type === 'cocktail') { h = 0.2; r = 0.055; }
  else { h = 0.12; r = 0.045; }
  const gl = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, h, 20, 1, true), glassM); gl.position.y = h / 2; g.add(gl);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0035, 4, 24), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  edge.rotation.x = Math.PI / 2; edge.position.y = h; g.add(edge);
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r * 0.85, 0.012, 20), glassM); bottom.position.y = 0.006; g.add(bottom);
  const liqM = new THREE.MeshBasicMaterial({ color: liquid, transparent: true, opacity: 0.88, fog: true });
  const liq = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.94, r * 0.82, 1, 20), liqM);
  g.add(liq);
  const setFill = (f) => { f = Math.max(0.001, f); liq.scale.y = h * f * 0.95; liq.position.y = 0.012 + (h * f * 0.95) / 2; liq.visible = f > 0.01; };
  setFill(fill);
  g.userData = { setFill, h, r, liqM };
  // ink outline around glass silhouette
  const bot = new THREE.Mesh(new THREE.TorusGeometry(r * 0.85, 0.003, 4, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6 }));
  bot.rotation.x = Math.PI / 2; bot.position.y = 0.002; g.add(bot);
  return g;
}

export function cocktail() {
  const g = new THREE.Group();
  const pts = [[0.0, 0], [0.12, 0], [0.12, 0.012], [0.02, 0.03], [0.018, 0.16], [0.07, 0.22], [0.1, 0.32], [0.11, 0.45], [0.105, 0.46]].map(([x, y]) => new THREE.Vector2(x, y));
  const glassM = new THREE.MeshToonMaterial({ color: '#e6efff', transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
  const gl = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), glassM); g.add(gl);
  const ol = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), new THREE.MeshBasicMaterial({ color: '#1b0f16', side: THREE.BackSide }));
  ol.scale.set(1.05, 1.0, 1.05); g.add(ol);
  // liquid gradient
  const lp = [[0, 0.17], [0.03, 0.17], [0.07, 0.225], [0.095, 0.32], [0.103, 0.41], [0, 0.41]].map(([x, y]) => new THREE.Vector2(x, y));
  const liqTex = canvasTex(8, 128, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffcf5a'); gr.addColorStop(0.5, '#ff8a4c'); gr.addColorStop(1, '#e8457a'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
  const liq = new THREE.Mesh(new THREE.LatheGeometry(lp, 32), new THREE.MeshBasicMaterial({ map: liqTex, transparent: true, opacity: 0.92 }));
  g.add(liq);
  // ice
  for (let i = 0; i < 3; i++) {
    const ice = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.05, 0.05, 2, 0.01), new THREE.MeshBasicMaterial({ color: '#fff7ec', transparent: true, opacity: 0.6 }));
    ice.position.set(Math.cos(i * 2.1) * 0.04, 0.39 + i * 0.008, Math.sin(i * 2.1) * 0.04); ice.rotation.set(i, i * 2, 0); g.add(ice);
  }
  // straw
  const straw = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.42, 8), toon('#f04f7a'), { width: 0.001 });
  straw.position.set(0.03, 0.45, 0.0); straw.rotation.z = -0.28; g.add(straw);
  // paper umbrella
  const tex = canvasTex(256, 32, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#5fd0c4' : '#fff1e0'; c.fillRect(i * w / 8, 0, w / 8 + 1, h); } });
  const um = new THREE.Group();
  const cone = mesh(new THREE.ConeGeometry(0.11, 0.05, 16, 1, true), toon('#ffffff', { map: tex, side: THREE.DoubleSide }), { width: 0.001 });
  cone.position.y = 0.22; um.add(cone);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.24), toon('#e9d9bf')); stick.position.y = 0.11; um.add(stick);
  um.position.set(-0.05, 0.38, 0.02); um.rotation.z = 0.35; g.add(um);
  // orange slice
  const sl = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 20), toon('#ffb347')); sl.rotation.x = Math.PI / 2; sl.position.set(0.1, 0.44, 0); g.add(sl);
  return g;
}

// ---------------- "lames": shadow figures with glowing eyes ----------------
export function lame(seed = 1) {
  const r = rng(seed);
  const g = new THREE.Group();
  const black = toon('#120d18', { rim: 0.6 });
  const h = 1.7 + r() * 0.4;
  const body = mesh(new THREE.CapsuleGeometry(0.22, h - 0.7, 6, 14), black); body.position.y = (h - 0.7) / 2 + 0.22; body.scale.set(1, 1, 0.7); g.add(body);
  const head = mesh(new THREE.SphereGeometry(0.2, 16, 12), black); head.position.y = h - 0.05; g.add(head);
  const hat = mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.25, 16), black); hat.position.y = h + 0.17; g.add(hat);
  const eyeM = new THREE.MeshBasicMaterial({ color: '#ff3b3b' });
  for (const x of [-0.07, 0.07]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), eyeM); e.position.set(x, h - 0.03, 0.17); e.scale.set(1, 0.6, 0.5); g.add(e); }
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), eyeM); heart.position.set(0.05, h * 0.62, 0.16); g.add(heart);
  // shards for the dissolve
  const shards = new THREE.Group();
  const sm = toon('#120d18', { rim: 0.4 });
  for (let i = 0; i < 40; i++) {
    const s = new THREE.Mesh(new THREE.TetrahedronGeometry(0.06 + r() * 0.06), sm);
    s.userData.v = new THREE.Vector3((r() - 0.5) * 2.5, r() * 2.5, (r() - 0.5) * 2.5);
    s.userData.p0 = new THREE.Vector3((r() - 0.5) * 0.4, r() * h, (r() - 0.5) * 0.3);
    s.userData.rv = new THREE.Vector3(r() * 6, r() * 6, r() * 6);
    shards.add(s);
  }
  shards.visible = false;
  g.add(shards);
  g.userData.setDissolve = (k, t) => {
    const whole = k <= 0;
    g.children.forEach((c) => { if (c !== shards) c.visible = whole; });
    shards.visible = !whole;
    if (!whole) shards.children.forEach((s) => {
      const d = s.userData;
      s.position.copy(d.p0).addScaledVector(d.v, k).add(new THREE.Vector3(0, -2.2 * k * k, 0));
      s.rotation.set(d.rv.x * k, d.rv.y * k, d.rv.z * k);
      s.scale.setScalar(Math.max(0.001, 1 - k * 0.9));
    });
  };
  return g;
}

// ---------------- wooden sign ----------------
export function sign(text1 = 'ВЫХОДНЫЕ', text2 = 'не беспокоить') {
  const g = new THREE.Group();
  const wood = toon('#b9774f');
  const post = mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), wood); post.position.y = 0.8; g.add(post);
  const tex = canvasTex(640, 260, (c, w, h) => {
    c.fillStyle = '#c98a5c'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(90,50,30,0.35)'; c.lineWidth = 3;
    for (let y = 20; y < h; y += 34) { c.beginPath(); c.moveTo(0, y + Math.sin(y) * 4); c.bezierCurveTo(w * 0.3, y + 8, w * 0.6, y - 8, w, y); c.stroke(); }
    c.fillStyle = '#fff6e8'; c.textAlign = 'center'; c.font = FONT(120); c.fillText(text1, w / 2, 140);
    c.font = FONT(56, 600); c.fillText(text2, w / 2, 215);
  });
  const board = mesh(new RoundedBoxGeometry(1.5, 0.62, 0.07, 2, 0.03), toon('#ffffff', { map: tex }));
  board.position.set(0, 1.45, 0.06); g.add(board);
  // fix map on the front face only: use a separate plane
  board.material = toon('#c98a5c');
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 0.58), toon('#ffffff', { map: tex }));
  face.position.set(0, 1.45, 0.1); g.add(face);
  return g;
}

// ---------------- magazines ----------------
export function magazine(title = 'МОДА', sub = 'тренды сезона', color = '#e8457a', seed = 1) {
  const r = rng(seed);
  const tex = canvasTex(300, 400, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, color); gr.addColorStop(1, '#2a1f4f');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.ellipse(w * 0.55, h * 0.62, 80, 120, 0, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.arc(w * 0.55, h * 0.4, 42, 0, 7); c.fill();
    c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.font = FONT(88); c.fillText(title, w / 2, 90);
    c.font = SANS(22, 600); c.fillText(sub.toUpperCase(), w / 2, h - 40);
    c.font = SANS(18, 500); c.textAlign = 'left'; c.fillText('№' + (1 + Math.floor(r() * 12)) + ' / 2026', 16, h - 12);
  });
  const g = new THREE.Group();
  const m = mesh(new THREE.BoxGeometry(0.3, 0.4, 0.012), [toon('#f3ead8'), toon('#f3ead8'), toon('#f3ead8'), toon('#f3ead8'), toon('#ffffff', { map: tex }), toon('#f3ead8')], { width: 0.0012 });
  g.add(m);
  return g;
}

export function trendArrow() {
  const s = new THREE.Shape();
  const pts = [[0, 0], [0.5, 0.9], [0.9, 0.55], [1.6, 1.5], [1.35, 1.65], [2.0, 1.95], [1.9, 1.25], [1.7, 1.42], [0.92, 0.25], [0.5, 0.55], [0.18, -0.05]];
  s.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(([x, y]) => s.lineTo(x, y)); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
  geo.translate(-1.0, 0, -0.09);
  const m = mesh(geo, toon('#ff4d5e', { rim: 1.2 }));
  const g = new THREE.Group(); g.add(m);
  const tex = canvasTex(512, 128, (c, w, h) => { c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.font = SANS(84, 800); c.fillText('ТРЕНДЫ', w / 2, 96); });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  label.position.set(-0.1, -0.35, 0.12); g.add(label);
  return g;
}

// ---------------- pier ----------------
export function pier(len = 14) {
  const g = new THREE.Group();
  const wood = toon('#9b6648'), woodD = toon('#6e4433');
  for (let i = 0; i < len / 0.3; i++) {
    const p = mesh(new THREE.BoxGeometry(2.2, 0.08, 0.26), i % 3 ? wood : woodD, { width: 0.0012 });
    p.position.set(0, 0.9, -i * 0.3); g.add(p);
  }
  for (let i = 0; i <= len / 2; i++) for (const x of [-1.05, 1.05]) {
    const post = mesh(new THREE.CylinderGeometry(0.08, 0.09, 2.4), woodD); post.position.set(x, 0.1, -i * 2); g.add(post);
  }
  const lampM = new THREE.MeshBasicMaterial({ color: '#ffd9a0' });
  const lamps = [];
  for (let i = 1; i <= len / 4; i++) for (const x of [-1.05, 1.05]) {
    const lp = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2), woodD, { outline: false }); lp.position.set(x, 1.5, -i * 4 + 1); g.add(lp);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), lampM); b.position.set(x, 2.15, -i * 4 + 1); g.add(b); lamps.push(b);
  }
  g.userData.lampM = lampM;
  return g;
}

// ---------------- sunglasses (attach to head) ----------------
export function sunglasses() {
  const g = new THREE.Group();
  const m = toon('#0e0c12', { rim: 2.0 });
  for (const x of [-0.075, 0.075]) {
    const l = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 24), m, { width: 0.0012 }); l.rotation.x = Math.PI / 2; l.scale.set(1.15, 1, 0.85); l.position.x = x; g.add(l);
  }
  const br = mesh(new THREE.BoxGeometry(0.06, 0.014, 0.014), m, { outline: false }); g.add(br);
  return g;
}

// splash droplets
export function splash(n = 40, seed = 3, color = '#e8f3ff') {
  const r = rng(seed);
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color });
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.04 + r() * 0.05, 8, 6), m);
    const a = r() * Math.PI * 2, sp = 0.8 + r() * 2.2;
    s.userData.v = new THREE.Vector3(Math.cos(a) * sp * 0.6, 2.5 + r() * 3.5, Math.sin(a) * sp * 0.6);
    g.add(s);
  }
  g.userData.set = (k) => {
    g.children.forEach((s) => {
      const v = s.userData.v;
      s.position.set(v.x * k, v.y * k - 4.9 * k * k, v.z * k);
      s.visible = k > 0 && s.position.y > -0.05;
      s.scale.setScalar(Math.max(0.01, 1 - k * 0.6));
    });
  };
  g.userData.set(0);
  return g;
}

// anime wind streaks
export function windLines(n = 26, seed = 4) {
  const r = rng(seed);
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide });
  for (let i = 0; i < n; i++) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(1.5 + r() * 2.5, 0.025 + r() * 0.03), m);
    l.userData = { y: r() * 2.6, z: (r() - 0.5) * 3, sp: 6 + r() * 6, ph: r() * 20 };
    g.add(l);
  }
  g.userData.update = (t) => g.children.forEach((l) => { const d = l.userData; l.position.set(((t * d.sp + d.ph) % 16) - 8, d.y, d.z); });
  return g;
}
