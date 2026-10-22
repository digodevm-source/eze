import { createGrass } from './grass.js';
import Lenis from '../vendor/lenis.mjs';

const TOUCH = matchMedia('(hover: none), (pointer: coarse)').matches;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
document.documentElement.classList.add('js');

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (k, dt) => 1 - Math.exp(-k * dt);

// ---------- smooth scroll (wheel and trackpad; touch keeps native scrolling) ----------
const lenis = REDUCED ? null : new Lenis({ lerp: 0.075, wheelMultiplier: 0.9 });
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { duration: 1.8 });
    else target.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
  });
});

// ---------- hero stone: floats, tilts toward the cursor, drifts away on scroll ----------
const hero = document.getElementById('top');
const stoneEl = document.getElementById('stone');
const floatEl = stoneEl.querySelector('.stone__float');
const shadowEl = stoneEl.querySelector('.stone__shadow');
const chips = [...stoneEl.querySelectorAll('.chip')].map((el, i) => ({ el, depth: parseFloat(el.style.getPropertyValue('--d')) || 1, phase: i * 1.7 }));

let stoneMatrix = new DOMMatrix();
// Map a screen point back onto the untransformed stone (the floating layer is rotated in 3D),
// so grass grows exactly under the cursor however the stone is tilted.
function toLocal(clientX, clientY) {
  const r = stoneEl.getBoundingClientRect();
  const ox = r.width / 2, oy = r.height / 2;
  const X = clientX - r.left - ox, Y = clientY - r.top - oy;
  const m = stoneMatrix;
  // the plane z = 0 projects through a 3×3 homography
  const a = m.m11, b = m.m21, c = m.m41;
  const d = m.m12, e = m.m22, f = m.m42;
  const g = m.m14, h = m.m24, k = m.m44;
  const A = e * k - f * h, B = c * h - b * k, C = b * f - c * e;
  const D = f * g - d * k, E = a * k - c * g, F = c * d - a * f;
  const G = d * h - e * g, H = b * g - a * h, I = a * e - b * d;
  const w = G * X + H * Y + I;
  return [(A * X + B * Y + C) / w + ox, (D * X + E * Y + F) / w + oy];
}

const mossValue = document.getElementById('moss-value');
const mossBar = document.getElementById('moss-bar');
const grass = createGrass(stoneEl, {
  toLocal,
  onProgress(pct) {
    mossValue.textContent = `${pct}%`;
    mossBar.style.transform = `scaleX(${pct / 100})`;
  },
});
document.getElementById('moss-reset').addEventListener('click', () => grass.reset());

const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = (e.clientY / innerHeight) * 2 - 1;
}, { passive: true });

const intro = { start: performance.now() };
function moveStone(t, dt, heroRect) {
  mouse.sx += (mouse.x - mouse.sx) * damp(2.2, dt);
  mouse.sy += (mouse.y - mouse.sy) * damp(2.2, dt);
  const W = stoneEl.offsetWidth, H = stoneEl.offsetHeight;
  const p = clamp(-heroRect.top / heroRect.height, 0, 1.2); // how far the hero has scrolled away
  const ip = REDUCED ? 1 : clamp((performance.now() - intro.start) / 2200, 0, 1);
  const ie = 1 - Math.pow(1 - ip, 4);
  const calm = REDUCED ? 0 : 1;

  const bob = (Math.sin(t * 0.55) * 0.024 + Math.sin(t * 1.15 + 1) * 0.008) * H * calm;
  const tx = (mouse.sx * 18 + Math.sin(t * 0.21) * W * 0.012) * calm;
  const ty = bob + mouse.sy * 10 * calm - p * H * 0.45 + (1 - ie) * H * 0.18;
  const rx = (-mouse.sy * 7 + Math.sin(t * 0.37) * 2.2) * calm + p * 10;
  const ry = (mouse.sx * 11 + Math.sin(t * 0.26 + 2) * 3.5) * calm;
  const rz = Math.sin(t * 0.31) * 1.6 * calm + p * 7 - (1 - ie) * 4;
  const s = 1 - p * 0.08 - (1 - ie) * 0.06;

  const persp = new DOMMatrix();
  persp.m34 = -1 / 1600;
  stoneMatrix = persp.translate(tx, ty, 0).rotate(rx, 0, 0).rotate(0, ry, 0).rotate(0, 0, rz).scale(s);
  floatEl.style.transform = stoneMatrix.toString();
  floatEl.style.opacity = String(ie * (1 - clamp(p - 0.55, 0, 1) * 1.6));

  // the shadow tightens as the stone rises and fades as it leaves
  const lift = bob / H;
  shadowEl.style.transform = `translate3d(${tx * 0.6}px, 0, 0) scale(${(1 - lift * 3) * (1 - p * 0.5)})`;
  shadowEl.style.opacity = String(ie * (0.85 + lift * 4) * (1 - p));

  for (const c of chips) {
    const cb = Math.sin(t * (0.5 + c.depth * 0.15) + c.phase) * H * 0.03 * calm;
    const cx = mouse.sx * 26 * c.depth * calm;
    const cy = cb + mouse.sy * 16 * c.depth * calm - p * H * (0.5 + c.depth * 0.35) + (1 - ie) * H * 0.3 * c.depth;
    const cr = t * 6 * c.depth * calm + c.phase * 40;
    c.el.style.transform = `translate3d(${cx}px, ${cy}px, 0) rotate(${cr}deg)`;
    c.el.style.opacity = String(ie * (1 - clamp(p - 0.4, 0, 1) * 1.8));
  }
}

// ---------- WebGL scene (the page still works without it) ----------
const sceneReady = import('./scene.js')
  .then(({ createScene }) => createScene(document.getElementById('scene')))
  .catch((err) => {
    console.warn('3D scene unavailable:', err);
    return null;
  });

// ---------- cursor ----------
const cursor = document.querySelector('.cursor');
const cur = { x: innerWidth / 2, y: innerHeight / 2, sx: innerWidth / 2, sy: innerHeight / 2 };
if (!TOUCH) {
  document.body.classList.add('has-cursor');
  addEventListener('pointermove', (e) => {
    cur.x = e.clientX;
    cur.y = e.clientY;
  }, { passive: true });
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

const peakImg = document.querySelector('.peak__figure img');
const debris = document.querySelector('.debris');
const debrisImg = debris.querySelector('img');

// one loop for everything scroll-driven: read layout first, then write
let lastT = performance.now();
let time = 0;
function tick(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  time += dt;
  lenis?.raf(now);

  const heroRect = hero.getBoundingClientRect();
  const sr = strata.getBoundingClientRect();
  const strataOn = sr.bottom > 0 && sr.top < innerHeight;
  let best = -1;
  if (strataOn) {
    let bestD = Infinity;
    minerals.forEach((m, i) => {
      const mr = m.getBoundingClientRect();
      const d = Math.abs(mr.left + mr.width / 2 - innerWidth / 2);
      if (d < bestD) { bestD = d; best = i; }
    });
  }
  const pr = peakImg.parentElement.getBoundingClientRect();
  const dr = debris.getBoundingClientRect();
  const maxX = track.scrollWidth - innerWidth;

  if (heroRect.bottom > -200) moveStone(time, dt, heroRect);

  const p = clamp(-sr.top / (sr.height - innerHeight), 0, 1);
  const target = -p * Math.max(0, maxX);
  trackX += (target - trackX) * (REDUCED ? 1 : damp(6, dt));
  track.style.transform = `translate3d(${trackX.toFixed(2)}px, 0, 0)`;
  if (best >= 0) strataNum.textContent = String(best + 1).padStart(2, '0');

  peakImg.style.setProperty('--py', `${(((pr.top + pr.height / 2 - innerHeight / 2) / innerHeight) * -40).toFixed(1)}px`);
  debrisImg.style.setProperty('--py', `${(((dr.top + dr.height / 2 - innerHeight / 2) / innerHeight) * 60).toFixed(1)}px`);

  if (!TOUCH) {
    cur.sx += (cur.x - cur.sx) * damp(14, dt);
    cur.sy += (cur.y - cur.sy) * damp(14, dt);
    cursor.style.transform = `translate3d(${cur.sx}px, ${cur.sy}px, 0)`;
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------- reveal: letters rise into headings, text drifts up out of a blur ----------
function splitLetters(el) {
  el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
  let i = 0;
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.ELEMENT_NODE) { walk(child); continue; }
      if (child.nodeType !== Node.TEXT_NODE) continue;
      const frag = document.createDocumentFragment();
      for (const part of child.textContent.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { frag.append(' '); continue; }
        const w = document.createElement('span');
        w.className = 'w';
        w.setAttribute('aria-hidden', 'true');
        for (const ch of part) {
          const c = document.createElement('span');
          c.className = 'c';
          c.textContent = ch;
          c.style.setProperty('--i', i++);
          w.append(c);
        }
        frag.append(w);
      }
      child.replaceWith(frag);
    }
  };
  walk(el);
  el.classList.add('split');
}

if (!REDUCED && 'IntersectionObserver' in window) {
  const headings = document.querySelectorAll('.hero__title, .h2, .strata__title, .mineral h3, .foot__title, .name__t');
  headings.forEach(splitLetters);
  const blocks = document.querySelectorAll([
    '.hero__text .label', '.hero__lead', '.hero__hint', '.hud',
    '.peak__head .label', '.peak__figure', '.peak__info > p', '.stats > div',
    '.float__text .label', '.float__text > p', '.facts li', '.float__note',
    '.strata__head', '.mineral__pct', '.mineral > p:not(.mineral__pct)', '.mineral__bar',
    '.chronicle__head .label', '.timeline li', '.stones__head .label', '.name__m',
    '.foot > .label', '.foot__grid > div', '.foot__note',
  ].join(','));
  // hide them without animating the hiding itself
  blocks.forEach((el) => {
    el.style.transition = 'none';
    el.classList.add('rise');
  });
  void document.body.offsetHeight;
  blocks.forEach((el) => (el.style.transition = ''));

  const io = new IntersectionObserver((entries) => {
    // things entering together come in one after another
    let n = 0;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.style.setProperty('--delay', `${Math.min(n++, 6) * 90}ms`);
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.01 });
  // horizontal cards are judged against the whole screen, since they slide in sideways
  const ioWide = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      ioWide.unobserve(e.target);
    }
  }, { rootMargin: '0px -8% 0px 0px' });

  const inStrata = (el) => el.closest('.strata__track');
  [...headings, ...blocks].forEach((el) => (inStrata(el) ? ioWide : io).observe(el));
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
        const p = Math.min(1, (now - t0) / 2000);
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
