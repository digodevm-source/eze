// Grass and moss that grow on the stone wherever the pointer or finger passes.
// All geometry is in the stone photo's own pixels (1099 × 819), so it scales with the image.

const BASE_W = 1099;
const BASE_H = 819;
const PAD_X = 20;   // canvas overhang, matches .stone__grass in style.css
const PAD_TOP = 60;
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

// colour buckets: three depth rows (back → front), six greens each
const ROWS = 3;
const GREENS = [
  [96, 52, 26], [88, 58, 31], [104, 48, 36], [80, 45, 22], [92, 62, 42], [72, 40, 30],
];

export function createGrass(root, { onProgress } = {}) {
  const mossCanvas = root.querySelector('.stone__moss');
  const grassCanvas = root.querySelector('.stone__grass');
  const mctx = mossCanvas.getContext('2d');
  const gctx = grassCanvas.getContext('2d');
  const touch = matchMedia('(hover: none), (pointer: coarse)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const rand = rng(1847);
  const xs = TOP_FACE.map((p) => p[0]);
  const ys = TOP_FACE.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  // ----- blades -----
  const COUNT = touch ? 3200 : 4600;
  const blades = [];
  while (blades.length < COUNT) {
    const x = minX + rand() * (maxX - minX);
    const y = minY + rand() * (maxY - minY);
    if (!inPolygon(x, y, TOP_FACE)) continue;
    const depth = (y - minY) / (maxY - minY); // 0 far, 1 near
    const scale = 0.7 + depth * 0.45;
    const row = Math.min(ROWS - 1, Math.floor(depth * ROWS));
    blades.push({
      x, y,
      h: (14 + rand() * 26) * scale,
      lean: (rand() - 0.5) * 0.7,
      bucket: row * GREENS.length + Math.floor(rand() * GREENS.length),
      phase: rand() * Math.PI * 2,
      g: 0,
      start: Infinity,
      flower: rand() < 0.018 ? (rand() < 0.6 ? '#f3efe1' : '#f0cf62') : null,
    });
  }
  blades.sort((a, b) => a.y - b.y);

  const buckets = [];
  for (let r = 0; r < ROWS; r++) {
    for (const [h, s, l] of GREENS) {
      const light = l * (0.82 + r * 0.14);
      buckets.push({ color: `hsl(${h} ${s}% ${light}%)`, width: 1.5 + r * 0.55, list: [] });
    }
  }

  const grid = new Map();
  for (const b of blades) {
    const key = `${Math.floor(b.x / CELL)},${Math.floor(b.y / CELL)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(b);
  }

  const facePath = new Path2D();
  TOP_FACE.forEach(([x, y], i) => (i ? facePath.lineTo(x, y) : facePath.moveTo(x, y)));
  facePath.closePath();

  // ----- sizing -----
  let scale = 1;
  let dpr = 1;
  function resize() {
    const rect = grassCanvas.getBoundingClientRect();
    if (!rect.width) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    // keep painted moss across resizes
    let keep = null;
    if (mossCanvas.width && mossCanvas.height && grown > 0) {
      keep = document.createElement('canvas');
      keep.width = mossCanvas.width;
      keep.height = mossCanvas.height;
      keep.getContext('2d').drawImage(mossCanvas, 0, 0);
    }
    for (const c of [mossCanvas, grassCanvas]) { c.width = w; c.height = h; }
    scale = w / CANVAS_W;
    if (keep) mctx.drawImage(keep, 0, 0, w, h);
  }

  // ----- painting -----
  let brush = 78;
  let grown = 0;
  let activeCount = 0;
  const pointer = { x: -999, y: -999, sx: -999, sy: -999, inside: false, last: null };

  function toBase(clientX, clientY) {
    const rect = grassCanvas.getBoundingClientRect();
    return [
      ((clientX - rect.left) / rect.width) * CANVAS_W - PAD_X,
      ((clientY - rect.top) / rect.height) * CANVAS_H - PAD_TOP,
    ];
  }

  function stamp(x, y, now) {
    // moss tint (multiplied over the photo, so the rock texture shows through)
    mctx.save();
    mctx.setTransform(scale, 0, 0, scale, PAD_X * scale, PAD_TOP * scale);
    mctx.clip(facePath);
    const g = mctx.createRadialGradient(x, y, 0, x, y, brush * 1.1);
    g.addColorStop(0, 'rgba(92, 140, 52, 0.30)');
    g.addColorStop(0.6, 'rgba(110, 150, 70, 0.14)');
    g.addColorStop(1, 'rgba(140, 160, 100, 0)');
    mctx.fillStyle = g;
    mctx.fillRect(x - brush * 1.2, y - brush * 1.2, brush * 2.4, brush * 2.4);
    mctx.restore();

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
          b.start = now + d * 5 + Math.random() * 160;
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

  function wake() {
    if (!running && visible) {
      running = true;
      lastT = performance.now();
      requestAnimationFrame(frame);
    }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 8);
    pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 8);

    for (const bk of buckets) bk.list.length = 0;
    activeCount = 0;
    let growing = false;
    const k = Math.min(1, dt * (reduced ? 20 : 2.6));
    const flowers = [];
    for (const b of blades) {
      if (b.start > now) continue;
      if (b.g < 0.999) {
        b.g += (1 - b.g) * k;
        growing = true;
      }
      activeCount++;
      buckets[b.bucket].list.push(b);
      if (b.flower && b.g > 0.9) flowers.push(b);
    }

    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.clearRect(0, 0, grassCanvas.width, grassCanvas.height);
    gctx.setTransform(scale, 0, 0, scale, PAD_X * scale, PAD_TOP * scale);
    gctx.lineCap = 'round';

    const t = now / 1000;
    const wind = reduced ? 0 : Math.sin(t * 0.7) * 0.5 + Math.sin(t * 1.9) * 0.25;
    const R = brush * 1.4;
    const px = pointer.sx, py = pointer.sy, pin = pointer.inside;

    for (const bk of buckets) {
      if (!bk.list.length) continue;
      gctx.strokeStyle = bk.color;
      gctx.lineWidth = bk.width;
      gctx.beginPath();
      for (const b of bk.list) {
        const h = b.h * easeOut(b.g);
        let bend = b.lean * h + (reduced ? 0 : Math.sin(t * 1.4 + b.phase + b.x * 0.02) * h * 0.09 + wind * h * 0.12);
        if (pin) {
          const dx = b.x - px, dy = b.y - py;
          const d = Math.hypot(dx, dy * 1.6);
          if (d < R) bend += Math.sign(dx || 1) * (1 - d / R) * h * 0.75;
        }
        const tx = b.x + bend;
        const ty = b.y - h * (1 - Math.min(0.35, Math.abs(bend) / (h + 1) * 0.3));
        gctx.moveTo(b.x, b.y);
        gctx.quadraticCurveTo(b.x + bend * 0.15, b.y - h * 0.55, tx, ty);
        b.tx = tx;
        b.ty = ty;
      }
      gctx.stroke();
    }

    for (const f of flowers) {
      gctx.fillStyle = f.flower;
      gctx.beginPath();
      gctx.arc(f.tx, f.ty, 2.6 * f.g, 0, Math.PI * 2);
      gctx.fill();
    }

    const keepGoing = visible && (growing || (activeCount > 0 && !reduced) || pin);
    if (keepGoing) requestAnimationFrame(frame);
    else running = false;
  }

  function easeOut(x) {
    return 1 - Math.pow(1 - x, 3);
  }

  function reset() {
    for (const b of blades) {
      b.g = 0;
      b.start = Infinity;
    }
    grown = 0;
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, mossCanvas.width, mossCanvas.height);
    report();
    wake();
  }

  function setBrushFromWidth() {
    // a finger covers more stone than a cursor ring
    const rect = grassCanvas.getBoundingClientRect();
    const px = rect.width / CANVAS_W; // screen px per base px
    brush = Math.max(56, Math.min(120, (touch ? 44 : 34) / Math.max(px, 0.2)));
    root.style.setProperty('--brush-px', `${brush * px * 2}px`);
    return brush * px;
  }

  const ro = new ResizeObserver(() => {
    resize();
    setBrushFromWidth();
    wake();
  });
  ro.observe(grassCanvas);

  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) wake();
  });
  io.observe(root);

  resize();
  report();

  return {
    reset,
    brushScreenRadius: () => setBrushFromWidth(),
  };
}
