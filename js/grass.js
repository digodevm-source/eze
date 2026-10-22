// Grass that grows on the stone wherever the pointer or finger passes.
// Blades grow in tufts, taper to a point and shade from a dark root to a lighter tip.
// Finished short blades are baked into a static layer; only growing blades and the
// taller ones (which sway in the wind and bend away from the pointer) are redrawn.
// All geometry is in the stone photo's own pixels (1099 × 819), so it scales with the image.

const BASE_W = 1099;
const BASE_H = 819;
const PAD_X = 20;   // canvas overhang, matches .stone__layer in style.css
const PAD_TOP = 70;
const CANVAS_W = BASE_W + PAD_X * 2;
const CANVAS_H = BASE_H + PAD_TOP;

// Outline of the flat top of the stone, traced from the photo.
const TOP_FACE = [
  [15, 125], [100, 95], [200, 62], [300, 35], [420, 12], [510, 14], [620, 30], [760, 42],
  [870, 60], [940, 85], [1010, 110], [1088, 160], [1040, 180], [950, 215], [870, 245],
  [820, 270], [700, 275], [560, 268], [470, 250], [380, 215], [290, 200], [200, 195],
  [110, 180], [40, 160],
];

const CELL = 40;

// root (shadowed) and tip (lit) colours, sampled toward a natural meadow, not a cartoon lawn
const ROOT = ['#16200d', '#1b2711', '#202c12', '#1a230f', '#243016'];
const TIP = ['#4b6e24', '#567a2a', '#628631', '#6e9238', '#7b9c40', '#86a449', '#93ad55', '#a1b562'];
const DRY_TIP = ['#a39a62', '#8f8650', '#b2a873'];
const ROWS = 4;

function inPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c(n >> 16)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}

const easeOut = (x) => 1 - Math.pow(1 - x, 3);

export function createGrass(root, { onProgress, toLocal } = {}) {
  const mossCanvas = root.querySelector('.stone__moss');
  const carpetCanvas = root.querySelector('.stone__carpet');
  const liveCanvas = root.querySelector('.stone__grass');
  const mctx = mossCanvas.getContext('2d');
  const cctx = carpetCanvas.getContext('2d');
  const lctx = liveCanvas.getContext('2d');
  const touch = matchMedia('(hover: none), (pointer: coarse)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const rand = rng(1847);
  const xs = TOP_FACE.map((p) => p[0]);
  const ys = TOP_FACE.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const samplePoint = () => {
    for (;;) {
      const x = minX + rand() * (maxX - minX);
      const y = minY + rand() * (maxY - minY);
      if (inPolygon(x, y, TOP_FACE)) return [x, y];
    }
  };

  // ----- colour buckets: depth row × root/tip pair -----
  const buckets = [];
  const bucketOf = new Map();
  function bucket(row, rootHex, tipHex) {
    const key = `${row}|${rootHex}|${tipHex}`;
    if (!bucketOf.has(key)) {
      const k = 0.72 + row * 0.1; // far rows sit in more shadow
      const b = { row, root: shade(rootHex, k), tip: shade(tipHex, k), list: [] };
      bucketOf.set(key, buckets.length);
      buckets.push(b);
    }
    return bucketOf.get(key);
  }

  // ----- blades, grown in tufts -----
  const blades = [];
  function addBlade(x, y, h, w, lean, curve, depth, tall) {
    const row = Math.min(ROWS - 1, Math.floor(depth * ROWS));
    const dry = rand() < 0.06;
    // light comes from the upper left: blades leaning left catch more of it
    let ti = Math.floor(rand() * TIP.length);
    if (lean < -0.12) ti = Math.min(TIP.length - 1, ti + 2);
    if (lean > 0.18) ti = Math.max(0, ti - 2);
    const tip = dry ? DRY_TIP[Math.floor(rand() * DRY_TIP.length)] : TIP[ti];
    const rootHex = ROOT[Math.floor(rand() * ROOT.length)];
    blades.push({
      x, y, h, w, lean, curve, tall,
      bucket: bucket(row, rootHex, tip),
      phase: rand() * Math.PI * 2,
      g: 0,
      start: Infinity,
      baked: false,
    });
  }

  const TUFTS = touch ? 1500 : 2300;
  for (let i = 0; i < TUFTS; i++) {
    const [x, y] = samplePoint();
    const depth = (y - minY) / (maxY - minY); // 0 far, 1 near
    const scale = 0.6 + depth * 0.5;
    const n = 4 + Math.floor(rand() * 7);
    const baseH = (13 + rand() * 20) * scale;
    const tuftLean = (rand() - 0.5) * 0.5;
    for (let j = 0; j < n; j++) {
      const spread = (rand() - 0.5) * 1.2;
      const tall = rand() < 0.07;
      addBlade(
        x + (rand() - 0.5) * 7 * scale,
        y + (rand() - 0.5) * 3 * scale,
        baseH * (0.5 + rand() * 0.65) * (tall ? 1.55 : 1),
        (1.4 + rand() * 1.6) * scale,
        tuftLean + spread * 0.55,
        (rand() - 0.5) * 0.6,
        depth,
        tall
      );
    }
  }
  // short filler between tufts so no bare rock shows through a grown patch
  const FILL = touch ? 2200 : 3400;
  for (let i = 0; i < FILL; i++) {
    const [x, y] = samplePoint();
    const depth = (y - minY) / (maxY - minY);
    const scale = 0.6 + depth * 0.5;
    addBlade(x, y, (5 + rand() * 8) * scale, (1.2 + rand() * 1.2) * scale, (rand() - 0.5) * 0.9, (rand() - 0.5) * 0.4, depth, false);
  }
  blades.sort((a, b) => a.y - b.y);
  // far rows first, so nearer grass overlaps it
  const drawOrder = [...buckets].sort((a, b) => a.row - b.row);

  const grid = new Map();
  for (const b of blades) {
    const key = `${Math.floor(b.x / CELL)},${Math.floor(b.y / CELL)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(b);
  }

  const facePath = new Path2D();
  TOP_FACE.forEach(([x, y], i) => (i ? facePath.lineTo(x, y) : facePath.moveTo(x, y)));
  facePath.closePath();

  // ----- blade drawing -----
  // A blade is a tapered quadratic curve from its root to its tip.
  const SEG = [0, 0.3, 0.6, 0.85, 1];
  const lx = new Float32Array(SEG.length), ly = new Float32Array(SEG.length);
  const rx = new Float32Array(SEG.length), ry = new Float32Array(SEG.length);
  function traceBlade(ctx, b, h, bend, w) {
    const x0 = b.x, y0 = b.y;
    const cx = x0 + bend * 0.2 + b.curve * h * 0.25, cy = y0 - h * 0.55;
    const x2 = x0 + bend, y2 = y0 - h * (1 - Math.min(0.35, (Math.abs(bend) / (h + 1)) * 0.3));
    for (let i = 0; i < SEG.length; i++) {
      const t = SEG[i], it = 1 - t;
      const px = it * it * x0 + 2 * it * t * cx + t * t * x2;
      const py = it * it * y0 + 2 * it * t * cy + t * t * y2;
      let tx = 2 * it * (cx - x0) + 2 * t * (x2 - cx);
      let ty = 2 * it * (cy - y0) + 2 * t * (y2 - cy);
      const len = Math.hypot(tx, ty) || 1;
      tx /= len;
      ty /= len;
      const half = w * 0.5 * Math.pow(it, 0.85);
      lx[i] = px - ty * half; ly[i] = py + tx * half;
      rx[i] = px + ty * half; ry[i] = py - tx * half;
    }
    ctx.moveTo(lx[0], ly[0]);
    for (let i = 1; i < SEG.length; i++) ctx.lineTo(lx[i], ly[i]);
    for (let i = SEG.length - 1; i >= 0; i--) ctx.lineTo(rx[i], ry[i]);
    ctx.closePath();
  }

  function drawBuckets(ctx, lists, poseOf) {
    for (const bk of drawOrder) {
      const list = lists.get(bk);
      if (!list || !list.length) continue;
      ctx.fillStyle = bk.tip;
      ctx.beginPath();
      for (const b of list) { const p = poseOf(b); traceBlade(ctx, b, p.h, p.bend, p.w); }
      ctx.fill();
      // darker lower part of each blade, in the shade of its neighbours
      ctx.fillStyle = bk.root;
      ctx.beginPath();
      for (const b of list) { const p = poseOf(b); traceBlade(ctx, b, p.h * 0.42, p.bend * 0.18, p.w); }
      ctx.fill();
    }
  }

  // ----- sizing -----
  let scale = 1;
  let grown = 0;
  const specks = [];
  const stamps = [];

  function localRect() {
    // untransformed layout box of the canvas inside the floating stone
    return { left: liveCanvas.offsetLeft, top: liveCanvas.offsetTop, width: liveCanvas.offsetWidth, height: liveCanvas.offsetHeight };
  }

  function resize() {
    const r = localRect();
    if (!r.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(r.width * dpr);
    const h = Math.round(r.height * dpr);
    if (w === liveCanvas.width && h === liveCanvas.height) return;
    for (const c of [mossCanvas, carpetCanvas, liveCanvas]) { c.width = w; c.height = h; }
    scale = w / CANVAS_W;
    // replay everything already painted at the new resolution
    for (const [x, y, k] of stamps) paintMoss(x, y, k);
    paintSpecks(specks);
    const lists = new Map();
    for (const b of blades) if (b.baked) pushTo(lists, b);
    if (lists.size) {
      setBase(cctx);
      drawBuckets(cctx, lists, bakedPose);
    }
  }

  function setBase(ctx) {
    ctx.setTransform(scale, 0, 0, scale, PAD_X * scale, PAD_TOP * scale);
  }

  function pushTo(lists, b) {
    const bk = buckets[b.bucket];
    if (!lists.has(bk)) lists.set(bk, []);
    lists.get(bk).push(b);
  }

  // ----- painting -----
  let brush = 78;
  const pointer = { x: -999, y: -999, sx: -999, sy: -999, inside: false, last: null };

  function paintMoss(x, y, k = 1) {
    // darkens the rock to damp soil under the grass (multiplied over the photo)
    mctx.save();
    setBase(mctx);
    mctx.clip(facePath);
    const g = mctx.createRadialGradient(x, y, 0, x, y, brush * 1.05);
    g.addColorStop(0, `rgba(78, 86, 46, ${0.34 * k})`);
    g.addColorStop(0.6, `rgba(96, 104, 64, ${0.16 * k})`);
    g.addColorStop(1, 'rgba(140, 140, 110, 0)');
    mctx.fillStyle = g;
    mctx.fillRect(x - brush * 1.2, y - brush * 1.2, brush * 2.4, brush * 2.4);
    mctx.restore();
  }

  const SPECK = ['#1c2610', '#25331a', '#2e3f1c', '#3a4d22', '#141b0c'];
  function paintSpecks(list) {
    if (!list.length) return;
    setBase(cctx);
    for (let k = 0; k < SPECK.length; k++) {
      cctx.fillStyle = SPECK[k];
      cctx.beginPath();
      for (let i = k; i < list.length; i += SPECK.length) {
        const s = list[i];
        cctx.moveTo(s[0] + s[2], s[1]);
        cctx.arc(s[0], s[1], s[2], 0, Math.PI * 2);
      }
      cctx.fill();
    }
  }

  function toBase(clientX, clientY) {
    const r = localRect();
    let lx0, ly0;
    if (toLocal) {
      [lx0, ly0] = toLocal(clientX, clientY);
      lx0 -= r.left;
      ly0 -= r.top;
    } else {
      const b = liveCanvas.getBoundingClientRect();
      lx0 = ((clientX - b.left) / b.width) * r.width;
      ly0 = ((clientY - b.top) / b.height) * r.height;
    }
    return [(lx0 / r.width) * CANVAS_W - PAD_X, (ly0 / r.height) * CANVAS_H - PAD_TOP];
  }

  function stamp(x, y, now, k = 1) {
    stamps.push([x, y, k]);
    paintMoss(x, y, k);
    const fresh = [];
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * brush * 0.9;
      const sx = x + Math.cos(a) * d, sy = y + Math.sin(a) * d * 0.6;
      if (inPolygon(sx, sy, TOP_FACE)) fresh.push([sx, sy, 0.7 + Math.random() * 1.3]);
    }
    specks.push(...fresh);
    paintSpecks(fresh);

    const r = brush;
    const cx0 = Math.floor((x - r) / CELL), cx1 = Math.floor((x + r) / CELL);
    const cy0 = Math.floor((y - r) / CELL), cy1 = Math.floor((y + r) / CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const cell = grid.get(`${cx},${cy}`);
        if (!cell) continue;
        for (const b of cell) {
          if (b.start !== Infinity) continue;
          const d = Math.hypot(b.x - x, (b.y - y) * 1.6);
          if (d > r) continue;
          b.start = now + d * 5 + Math.random() * 220;
          grown++;
        }
      }
    }
  }

  function paintTo(x, y) {
    const now = performance.now();
    const last = pointer.last;
    if (last) {
      const dist = Math.hypot(x - last[0], y - last[1]);
      const steps = Math.min(40, Math.ceil(dist / (brush * 0.35)));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        stamp(last[0] + (x - last[0]) * t, last[1] + (y - last[1]) * t, now);
      }
    } else {
      stamp(x, y, now);
    }
    pointer.last = [x, y];
    report();
    wake();
  }

  let reported = -1;
  function report() {
    const pct = Math.round((grown / blades.length) * 100);
    if (pct !== reported) {
      reported = pct;
      onProgress?.(pct);
    }
  }

  function onMove(e) {
    const [x, y] = toBase(e.clientX, e.clientY);
    pointer.x = x;
    pointer.y = y;
    pointer.inside = true;
    const hit = x > -40 && x < BASE_W + 40 && y > -40 && y < BASE_H * 0.62;
    // a mouse paints on hover; a finger or pen paints while touching
    if (hit && (e.pointerType === 'mouse' || e.buttons || e.type === 'pointerdown')) {
      paintTo(x, y);
    } else {
      pointer.last = null;
    }
    wake();
  }
  function onLeave() {
    pointer.inside = false;
    pointer.last = null;
  }
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerdown', (e) => {
    pointer.last = null;
    onMove(e);
  });
  root.addEventListener('pointerup', () => (pointer.last = null));
  root.addEventListener('pointerleave', onLeave);
  root.addEventListener('pointercancel', onLeave);

  // ----- animation -----
  let running = false;
  let visible = true;
  let lastT = performance.now();
  let time = 0;
  const pose = { h: 0, bend: 0, w: 0 };

  function bakedPose(b) {
    pose.h = b.h;
    pose.bend = b.lean * b.h;
    pose.w = b.w;
    return pose;
  }

  function wake() {
    if (!running && visible) {
      running = true;
      lastT = performance.now();
      requestAnimationFrame(frame);
    }
  }

  // ----- grass that grows by itself: spreads out from a few spots over `duration` ms -----
  const queue = [];
  function grow(duration = 6000) {
    const now = performance.now();
    const seeds = [[240, 120, 0], [720, 150, 0.12], [980, 170, 0.22]];
    const spacing = 46;
    const pts = [];
    for (let y = minY - 10; y <= maxY + 10; y += spacing * 0.7) {
      for (let x = minX - 10; x <= maxX + 10; x += spacing) {
        const px = x + (Math.random() - 0.5) * spacing * 0.6;
        const py = y + (Math.random() - 0.5) * spacing * 0.4;
        if (!inPolygon(px, py, TOP_FACE)) continue;
        let t = Infinity;
        for (const [sx, sy, off] of seeds) t = Math.min(t, off + Math.hypot(px - sx, (py - sy) * 1.8) / 620);
        pts.push([px, py, t + Math.random() * 0.08]);
      }
    }
    const max = Math.max(...pts.map((p) => p[2]));
    // the last spots are reached a little before the end so their blades can finish growing
    const span = Math.max(0, duration - 500);
    for (const [x, y, t] of pts) queue.push({ x, y, at: now + (t / max) * span });
    queue.sort((a, b) => a.at - b.at);
    wake();
  }

  function frame(now) {
    let stamped = false;
    while (queue.length && queue[0].at <= now) {
      const q = queue.shift();
      stamp(q.x, q.y, now, 0.45);
      stamped = true;
    }
    if (stamped) report();

    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    time += dt;
    pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 8);
    pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 8);

    const k = Math.min(1, dt * (reduced ? 20 : 2.2));
    const live = new Map();
    const toBake = new Map();
    let growing = false;
    let swaying = false;
    for (const b of blades) {
      if (b.baked || b.start > now) continue;
      if (b.g < 0.999) {
        b.g = Math.min(1, b.g + (1 - b.g) * k + 0.002);
        growing = true;
        pushTo(live, b);
      } else if (b.tall && !reduced) {
        swaying = true;
        pushTo(live, b);
      } else {
        b.baked = true;
        pushTo(toBake, b);
      }
    }

    if (toBake.size) {
      setBase(cctx);
      drawBuckets(cctx, toBake, bakedPose);
    }

    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
    setBase(lctx);
    const wind = reduced ? 0 : Math.sin(time * 0.7) * 0.5 + Math.sin(time * 1.9) * 0.25;
    const R = brush * 1.4;
    const px = pointer.sx, py = pointer.sy, pin = pointer.inside;
    const livePose = (b) => {
      const e = easeOut(b.g);
      const h = b.h * e;
      let bend = b.lean * h * (0.6 + 0.4 * e);
      if (!reduced) bend += Math.sin(time * 1.3 + b.phase + b.x * 0.02) * h * 0.08 + wind * h * 0.1;
      if (pin) {
        const dx = b.x - px, dy = b.y - py;
        const d = Math.hypot(dx, dy * 1.6);
        if (d < R) bend += Math.sign(dx || 1) * (1 - d / R) * h * 0.7;
      }
      pose.h = h;
      pose.bend = bend;
      pose.w = b.w * (0.55 + 0.45 * e);
      return pose;
    };
    drawBuckets(lctx, live, livePose);

    const keepGoing = visible && (growing || swaying || pin || queue.length > 0);
    if (keepGoing) requestAnimationFrame(frame);
    else running = false;
  }

  function reset() {
    queue.length = 0;
    for (const b of blades) {
      b.g = 0;
      b.start = Infinity;
      b.baked = false;
    }
    grown = 0;
    specks.length = 0;
    stamps.length = 0;
    for (const [c, ctx] of [[mossCanvas, mctx], [carpetCanvas, cctx], [liveCanvas, lctx]]) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
    }
    report();
    wake();
  }

  function brushScreenRadius() {
    const r = localRect();
    const px = r.width / CANVAS_W; // layout px per base px
    brush = Math.max(56, Math.min(120, (touch ? 44 : 34) / Math.max(px, 0.2)));
    return brush * px;
  }

  const ro = new ResizeObserver(() => {
    resize();
    brushScreenRadius();
    wake();
  });
  ro.observe(liveCanvas);

  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) wake();
  });
  io.observe(root);

  resize();
  brushScreenRadius();
  report();

  return { reset, grow, brushScreenRadius };
}
