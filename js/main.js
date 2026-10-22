import { createGrass } from './grass.js';

const TOUCH = matchMedia('(hover: none), (pointer: coarse)').matches;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
document.documentElement.classList.add('js');

// ---------- grass on the hero stone ----------
const stoneEl = document.getElementById('stone');
const mossValue = document.getElementById('moss-value');
const mossBar = document.getElementById('moss-bar');
const grass = createGrass(stoneEl, {
  onProgress(pct) {
    mossValue.textContent = `${pct}%`;
    mossBar.style.transform = `scaleX(${pct / 100})`;
  },
});
document.getElementById('moss-reset').addEventListener('click', () => grass.reset());

// ---------- WebGL scene (the page still works without it) ----------
const sceneReady = import('./scene.js')
  .then(({ createScene }) => createScene(document.getElementById('scene')))
  .catch((err) => {
    console.warn('3D scene unavailable:', err);
    return null;
  });

// ---------- cursor ----------
if (!TOUCH) {
  document.body.classList.add('has-cursor');
  const cursor = document.querySelector('.cursor');
  const pos = { x: innerWidth / 2, y: innerHeight / 2, sx: innerWidth / 2, sy: innerHeight / 2 };
  addEventListener('pointermove', (e) => {
    pos.x = e.clientX;
    pos.y = e.clientY;
  }, { passive: true });
  const loop = () => {
    pos.sx += (pos.x - pos.sx) * 0.2;
    pos.sy += (pos.y - pos.sy) * 0.2;
    cursor.style.transform = `translate3d(${pos.sx}px, ${pos.sy}px, 0)`;
    requestAnimationFrame(loop);
  };
  loop();
  stoneEl.addEventListener('pointerenter', () => {
    cursor.style.setProperty('--brush', (grass.brushScreenRadius() * 2) / 34);
    cursor.classList.add('is-stone');
  });
  stoneEl.addEventListener('pointerleave', () => cursor.classList.remove('is-stone'));
  document.querySelectorAll('a, button').forEach((el) => {
    el.addEventListener('pointerenter', () => cursor.classList.add('is-link'));
    el.addEventListener('pointerleave', () => cursor.classList.remove('is-link'));
  });
}

// ---------- strata: vertical scroll drives a horizontal track ----------
const strata = document.getElementById('strata');
const track = document.getElementById('strata-track');
const strataNum = document.getElementById('strata-num');
const minerals = [...track.querySelectorAll('.mineral')];
let trackX = 0;
let trackTarget = 0;
function strataTarget() {
  const r = strata.getBoundingClientRect();
  const total = r.height - innerHeight;
  const p = Math.min(1, Math.max(0, -r.top / total));
  const max = track.scrollWidth - innerWidth;
  trackTarget = -p * Math.max(0, max);
  // which mineral card sits nearest the middle of the screen
  let best = 0, bestD = Infinity;
  minerals.forEach((m, i) => {
    const mr = m.getBoundingClientRect();
    const d = Math.abs(mr.left + mr.width / 2 - innerWidth / 2);
    if (d < bestD) { bestD = d; best = i; }
  });
  strataNum.textContent = String(best + 1).padStart(2, '0');
}

// ---------- parallax on the mountain photo ----------
const peakImg = document.querySelector('.peak__figure img');
const debrisImg = document.querySelector('.debris img');

function tick() {
  strataTarget();
  trackX += (trackTarget - trackX) * (REDUCED ? 1 : 0.09);
  track.style.transform = `translate3d(${trackX.toFixed(2)}px, 0, 0)`;
  const pr = peakImg.getBoundingClientRect();
  const off = (pr.top + pr.height / 2 - innerHeight / 2) / innerHeight;
  peakImg.style.setProperty('--py', `${(off * -40).toFixed(1)}px`);
  const dr = debrisImg.parentElement.getBoundingClientRect();
  const doff = (dr.top + dr.height / 2 - innerHeight / 2) / innerHeight;
  debrisImg.style.setProperty('--py', `${(doff * 60).toFixed(1)}px`);
  requestAnimationFrame(tick);
}
tick();

// ---------- reveal on scroll (only for things that start below the fold) ----------
if (!REDUCED && 'IntersectionObserver' in window) {
  const targets = document.querySelectorAll(
    '.peak__head, .peak__figure, .peak__info, .float__text, .chronicle__head, .timeline li, .stones__head, .name, .foot__title, .foot__grid'
  );
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.remove('pre');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -8% 0px' });
  targets.forEach((el, i) => {
    if (el.getBoundingClientRect().top < innerHeight) return;
    el.classList.add('reveal', 'pre');
    el.style.transitionDelay = `${(i % 4) * 70}ms`;
    io.observe(el);
  });
}

// ---------- counters ----------
const fmt = (v, dec) => {
  const s = Math.abs(v).toFixed(dec).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (v < 0 ? '−' : '') + s;
};
if (!REDUCED && 'IntersectionObserver' in window) {
  const nums = document.querySelectorAll('[data-count]');
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const el = e.target;
      const to = parseFloat(el.dataset.count);
      const dec = parseInt(el.dataset.decimals || '0', 10);
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / 1800);
        const eased = 1 - Math.pow(1 - p, 4);
        el.textContent = fmt(to * eased, dec);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }, { threshold: 0.6 });
  nums.forEach((n) => {
    if (n.getBoundingClientRect().top > innerHeight) io.observe(n);
  });
}

// re-measure scroll anchors once fonts settle the layout
document.fonts?.ready.then(() => sceneReady.then((s) => s?.measure()));
