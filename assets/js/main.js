/* California Modulars — slide engine & interactions */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const EASE = 'cubic-bezier(.22,.8,.2,1)';
  const EASE_IO = 'cubic-bezier(.7,0,.2,1)';
  const EASE_IN = 'cubic-bezier(.6,0,.9,.4)';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* -----------------------------------------------------------
     Text splitting
  ----------------------------------------------------------- */
  function splitChars(el) {
    if (el.dataset.splitDone) return;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span');
            w.className = 'w';
            for (const ch of part) {
              const c = document.createElement('span');
              c.className = 'c';
              c.textContent = ch;
              w.appendChild(c);
            }
            frag.appendChild(w);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') {
          walk(n);
        }
      });
    };
    walk(el);
    el.dataset.splitDone = '1';
  }
  function splitWords(el) {
    if (el.dataset.splitDone) return;
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    words.forEach((w, i) => {
      const s = document.createElement('span');
      s.className = 'l';
      s.style.display = 'inline-block';
      s.textContent = w;
      el.appendChild(s);
      if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
    });
    el.dataset.splitDone = '1';
  }
  $$('.split, .split-num').forEach(splitChars);
  $$('.split-lines').forEach(splitWords);

  const chars = (el) => (el ? $$('.c', el) : []);
  const stop = (els) => els.forEach((e) => e.getAnimations().forEach((a) => a.cancel()));

  /* letters slide in from the right with blur — the "spread" reveal */
  function textIn(el, { delay = 0, stagger = 24, dur = 760, shift = 0.6 } = {}) {
    const cs = chars(el);
    stop(cs);
    if (reduced) return 0;
    cs.forEach((c, i) => {
      c.animate(
        [
          { opacity: 0, transform: `translateX(${shift}em)`, filter: 'blur(4px)' },
          { opacity: 1, transform: 'none', filter: 'blur(0px)' },
        ],
        { duration: dur, delay: delay + i * stagger, easing: EASE, fill: 'both' }
      );
    });
    return delay + cs.length * stagger + dur;
  }
  /* letters disappear from the end, like backspacing */
  function textOut(el, { delay = 0, stagger = 9, dur = 320 } = {}) {
    const cs = chars(el).reverse();
    if (reduced) { cs.forEach((c) => (c.style.opacity = 0)); return 0; }
    cs.forEach((c, i) => {
      c.getAnimations().forEach((a) => a.cancel());
      c.animate(
        [
          { opacity: 1, transform: 'none', filter: 'blur(0px)' },
          { opacity: 0, transform: 'translateX(-.15em)', filter: 'blur(2px)' },
        ],
        { duration: dur, delay: delay + i * stagger, easing: EASE_IN, fill: 'both' }
      );
    });
    return delay + cs.length * stagger + dur;
  }
  /* digits rise and grow one after another */
  function numIn(el, { delay = 0, stagger = 85, dur = 900 } = {}) {
    const cs = chars(el);
    stop(cs);
    cs.forEach((c, i) => {
      c.style.transformOrigin = '0% 90%';
      c.animate(
        [
          { opacity: 0, transform: 'translateY(.18em) scale(.32)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: dur, delay: delay + i * stagger, easing: EASE, fill: 'both' }
      );
    });
    return delay + cs.length * stagger + dur;
  }
  function numOut(el, { delay = 0, stagger = 55, dur = 420 } = {}) {
    const cs = chars(el).reverse();
    cs.forEach((c, i) => {
      c.getAnimations().forEach((a) => a.cancel());
      c.style.transformOrigin = '0% 90%';
      c.animate(
        [
          { opacity: 1, transform: 'none' },
          { opacity: 0, transform: 'translateY(.12em) scale(.3)' },
        ],
        { duration: dur, delay: delay + i * stagger, easing: EASE_IN, fill: 'both' }
      );
    });
    return delay + cs.length * stagger + dur;
  }
  /* paragraph: words rise line by line */
  function linesIn(el, { delay = 0, step = 70, dur = 900 } = {}) {
    const ws = $$('.l', el);
    stop(ws);
    const tops = [...new Set(ws.map((w) => w.offsetTop))].sort((a, b) => a - b);
    ws.forEach((w) => {
      const li = tops.indexOf(w.offsetTop);
      w.animate(
        [
          { opacity: 0, transform: 'translateY(70%)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: dur, delay: delay + li * step, easing: EASE, fill: 'both' }
      );
    });
    return delay + tops.length * step + dur;
  }
  function linesOut(el, { delay = 0, dur = 380 } = {}) {
    const ws = $$('.l', el);
    ws.forEach((w) => {
      w.getAnimations().forEach((a) => a.cancel());
      w.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-30%)' }], {
        duration: dur, delay, easing: EASE_IN, fill: 'both',
      });
    });
    return delay + dur;
  }
  function anim(el, frames, opts) {
    if (!el) return null;
    return el.animate(frames, Object.assign({ fill: 'both', easing: EASE }, opts));
  }
  function clearAnims(root) {
    [root, ...$$('*', root)].forEach((e) => e.getAnimations().forEach((a) => a.cancel()));
  }

  /* -----------------------------------------------------------
     State
  ----------------------------------------------------------- */
  const body = document.body;
  const slides = $$('.slide');
  const ids = slides.map((s) => s.id);
  let cur = -1;
  let busy = true;
  const COVER = new Set(['accelerate', 'flexible', 'final']);

  const cta = $('#cta');
  const ctaLabel = $('#ctaLabel');
  const CTA_MODES = {
    card: { label: 'Get a free consultation', x: 117, y: 307, w: 47, h: 71, wide: false },
    read: { label: 'Read more', x: 305, y: 349, w: 65, h: 23, wide: true },
    calc: { label: 'Calculate cost', x: 304, y: 351, w: 67, h: 23, wide: true },
  };
  let ctaMode = 'none';
  function setCTA(mode) {
    if (mode === ctaMode) return;
    const prev = ctaMode;
    ctaMode = mode;
    if (mode === 'none' || !CTA_MODES[mode]) { cta.classList.remove('is-on'); return; }
    const m = CTA_MODES[mode];
    const portrait = matchMedia('(max-aspect-ratio: 1/1)').matches;
    const apply = () => {
      if (portrait) {
        cta.style.left = `calc(50% - ${m.w / 2} * var(--p))`;
        cta.style.top = `calc(100% - ${m.h + 18} * var(--p))`;
      } else {
        cta.style.left = `calc(${m.x} * var(--x))`;
        cta.style.top = `calc(${m.y} * var(--y))`;
      }
      cta.style.width = `calc(${m.w} * var(--p))`;
      cta.style.height = `calc(${m.h} * var(--p))`;
      cta.classList.toggle('is-wide', m.wide);
    };
    if (prev === 'none') {
      apply();
      ctaLabel.textContent = m.label;
      cta.classList.add('is-on');
    } else {
      cta.classList.add('is-swap');
      apply();
      setTimeout(() => { ctaLabel.textContent = m.label; cta.classList.remove('is-swap'); }, 450);
    }
    const target = mode === 'read' ? '#premium' : '#flexible';
    cta.setAttribute('href', target);
  }

  /* -----------------------------------------------------------
     Slide definitions: enter(dir) → ms, outro(dir) → ms
  ----------------------------------------------------------- */
  const D = {};

  // 0 — HERO
  D.hero = {
    enter(dir, el) {
      const img = $('.media img', el);
      anim(img, [{ opacity: 0, transform: 'scale(1.14)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 2200 });
      const a = textIn($('.hero__title', el), { delay: 650, stagger: 26 });
      const b = textIn($('.hero__sub', el), { delay: 1000, stagger: 10, dur: 600 });
      return Math.max(a, b) - 400;
    },
    outro(dir, el) {
      textOut($('.hero__sub', el), { stagger: 4 });
      return textOut($('.hero__title', el), { stagger: 7 }) * 0.6;
    },
  };

  // 1 — INVESTORS
  D.investors = {
    enter(dir, el) {
      const img = $('.media img', el);
      if (dir > 0) {
        anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
        anim(img, [{ transform: 'scale(1.42) translate(-4%, 3%)' }, { transform: 'scale(1)' }], { duration: 1900 });
      } else {
        anim(el, [{ transform: 'translateY(-100%)' }, { transform: 'none' }], { duration: 1100, easing: EASE_IO });
        anim(img, [{ transform: 'translateY(30%) scale(1.1)' }, { transform: 'none' }], { duration: 1100, easing: EASE_IO });
      }
      return textIn($('.inv__title', el), { delay: dir > 0 ? 650 : 500, stagger: 30 }) - 300;
    },
    outro(dir, el) {
      const t = textOut($('.inv__title', el), { stagger: 10 });
      if (dir > 0) {
        anim($('.media', el), [{ transform: 'none' }, { transform: 'translateY(-100%)' }], { duration: 1050, delay: 150, easing: EASE_IO });
        anim($('.media img', el), [{ transform: 'none' }, { transform: 'translateY(35%)' }], { duration: 1050, delay: 150, easing: EASE_IO });
        return Math.max(t, 900);
      }
      return t * 0.5;
    },
  };

  // 2 — MAXIMIZE (carousel)
  const MAX = {
    el: $('#maximize'),
    i: 0,
    n: 3,
    expanded: false,
    cards: $$('.max__card'),
    notes: $$('.max__note'),
    nums: $$('.max__num'),
    layout() {
      [this.cards, this.notes, this.nums].forEach((list) =>
        list.forEach((e, k) => {
          e.style.setProperty('--off', k - this.i);
          e.classList.toggle('is-current', k === this.i);
        })
      );
    },
    setExpanded(v) {
      if (this.expanded === v) return;
      this.expanded = v;
      this.el.classList.toggle('is-expanded', v);
      const img = $('img', this.cards[this.i]);
      img.getAnimations().forEach((a) => a.cancel());
    },
    go(d) {
      const ni = this.i + d;
      if (ni < 0 || ni >= this.n) return false;
      this.setExpanded(false);
      const old = this.i;
      textOut(this.notes[old], { stagger: 5 });
      this.i = ni;
      this.layout();
      // inner parallax of photos while sliding
      this.cards.forEach((c) => {
        const img = $('img', c);
        anim(img, [
          { transform: `translateX(${d * 14}%) scale(1.12)` },
          { transform: 'none' },
        ], { duration: 1200, easing: EASE_IO });
      });
      textIn(this.notes[ni], { delay: 650, stagger: 9, dur: 600, shift: 0.4 });
      return true;
    },
  };
  MAX.layout();
  D.maximize = {
    enter(dir, el) {
      MAX.layout();
      anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 400 });
      const card = MAX.cards[MAX.i];
      anim(card, [{ clipPath: 'inset(99.4% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)' }], { duration: 1150, delay: 150, easing: EASE_IO });
      anim($('img', card), [
        { transform: 'scale(1.35)', filter: 'blur(14px)' },
        { transform: 'none', filter: 'blur(0px)' },
      ], { duration: 1500, delay: 150 });
      MAX.cards.forEach((c) => { if (c !== card) anim(c, [{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: 900 }); });
      const t1 = textIn($('.max__title', el), { delay: 250, stagger: 30 });
      MAX.nums.forEach((n, k) => (k === MAX.i ? numIn(n, { delay: 500 }) : anim(n, [{ opacity: 0 }, { opacity: 1 }], { duration: 800, delay: 1100 })));
      MAX.notes.forEach((n, k) => (k === MAX.i ? textIn(n, { delay: 800, stagger: 9, dur: 600, shift: 0.4 }) : null));
      anim($('#maxDot'), [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 800, delay: 1000 });
      return Math.max(t1, 1500) - 300;
    },
    outro(dir, el) {
      MAX.setExpanded(false);
      const card = MAX.cards[MAX.i];
      textOut($('.max__title', el), { stagger: 8 });
      textOut(MAX.notes[MAX.i], { stagger: 4 });
      const t = numOut(MAX.nums[MAX.i]);
      MAX.nums.forEach((n, k) => k !== MAX.i && anim(n, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 }));
      MAX.cards.forEach((c) => c !== card && anim(c, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 }));
      anim(card, [{ clipPath: 'inset(0% 0 0 0)' }, { clipPath: 'inset(99.4% 0 0 0)' }], { duration: 850, delay: 250, easing: EASE_IO });
      anim($('img', card), [
        { transform: 'none', filter: 'blur(0px)' },
        { transform: 'scale(1.2)', filter: 'blur(10px)' },
      ], { duration: 850, delay: 250, easing: EASE_IO });
      anim($('#maxDot'), [{ transform: 'scale(1)' }, { transform: 'scale(0)' }], { duration: 400 });
      return Math.max(t, 1100);
    },
    step(dir) {
      return MAX.go(dir);
    },
    reset() { MAX.setExpanded(false); },
  };

  // 3 — ACCELERATE
  D.accelerate = {
    enter(dir, el) {
      anim($('.media img', el), [{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 1800 });
      return textIn($('.acc__title', el), { delay: 600, stagger: 24 }) - 400;
    },
    outro(dir, el) {
      textOut($('.acc__title', el), { stagger: 6 });
      return 220;
    },
  };

  // 4 — FLEXIBLE + calculator
  D.flexible = {
    enter(dir, el) {
      anim($('.media img', el), [{ transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 1800 });
      const a = textIn($('.flex__title', el), { delay: 550, stagger: 26 });
      linesIn($('.flex__text', el), { delay: 750 });
      const parts = [$('.calc__display', el), ...$$('.calc__keys button', el), ...$$('.calc__field', el), $('.calc__send', el)];
      parts.forEach((p, k) => anim(p, [{ opacity: 0, transform: 'translateY(30%)' }, { opacity: 1, transform: 'none' }], { duration: 800, delay: 500 + k * 28 }));
      return a - 400;
    },
    outro(dir, el) {
      textOut($('.flex__title', el), { stagger: 6 });
      linesOut($('.flex__text', el));
      return 220;
    },
  };

  // 5 — PREMIUM
  D.premium = {
    enter(dir, el) {
      anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 500 });
      anim($('.prem__media img', el), [
        { opacity: 0, transform: `translateY(${dir > 0 ? 9 : -9}%) scale(.9) rotate(-3deg)` },
        { opacity: 1, transform: 'none' },
      ], { duration: 1700, delay: 100 });
      const a = textIn($('.prem__title', el), { delay: 300, stagger: 24 });
      linesIn($('.prem__text', el), { delay: 700 });
      return a - 300;
    },
    outro(dir, el) {
      textOut($('.prem__title', el), { stagger: 6 });
      linesOut($('.prem__text', el));
      anim($('.prem__media img', el), [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateY(${dir > 0 ? -6 : 6}%) scale(.96)` }], { duration: 700, easing: EASE_IO });
      return 650;
    },
  };

  // 6 — WHY
  const whyItems = $$('#whyList li');
  D.why = {
    enter(dir, el) {
      anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 400 });
      anim($('.why__bg img', el), [{ opacity: 0, transform: 'translateY(6%)' }, { opacity: 1, transform: 'none' }], { duration: 1600, delay: 200 });
      const a = textIn($('.why__title', el), { delay: 150, stagger: 28 });
      anim($('#whyList'), [{ borderTopColor: 'rgba(255,255,255,0)' }, { borderTopColor: 'rgba(255,255,255,.34)' }], { duration: 600, delay: 450 });
      whyItems.forEach((li, k) => {
        anim(li, [{ opacity: 0, transform: 'translateY(60%)' }, { opacity: 1, transform: 'none' }], { duration: 900, delay: 450 + k * 75 });
      });
      return Math.max(a, 450 + whyItems.length * 75 + 600) - 300;
    },
    outro(dir, el) {
      textOut($('.why__title', el), { stagger: 8 });
      whyItems.slice().reverse().forEach((li, k) => {
        anim(li, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(80%)' }], { duration: 420, delay: k * 55, easing: EASE_IN });
      });
      anim($('.why__bg img', el), [{ opacity: 1 }, { opacity: 0, transform: 'translateY(4%)' }], { duration: 700 });
      return 750;
    },
    reset() { whyItems.forEach((li) => { li.classList.remove('is-open'); $('p', li).style.height = '0px'; }); },
  };

  // 7 — PROJECTS
  const PROJ = {
    vp: $('#projViewport'),
    track: $('#projTrack'),
    cards: $$('.proj__card'),
    x: 0, target: 0, v: 0, min: 0, max: 0, drag: false, raf: 0,
    unit() { return this.vp.clientWidth / 673; },
    measure() {
      const u = matchMedia('(max-aspect-ratio: 1/1)').matches ? 16 * (this.vp.clientWidth / 380) : 18 * this.unit();
      this.max = u;
      this.min = Math.min(u, this.vp.clientWidth - this.track.scrollWidth - u);
    },
    set(x) { this.x = x; this.track.style.transform = `translate3d(${x}px,0,0)`; },
    reset() { this.measure(); this.v = 0; this.target = this.max; this.set(this.max); },
    loop() {
      cancelAnimationFrame(this.raf);
      const tick = () => {
        if (!this.drag) {
          if (Math.abs(this.v) > 0.05) { this.target += this.v; this.v *= 0.92; }
          if (this.target > this.max) { this.target = lerp(this.target, this.max, 0.18); this.v *= 0.5; }
          if (this.target < this.min) { this.target = lerp(this.target, this.min, 0.18); this.v *= 0.5; }
        }
        const nx = lerp(this.x, this.target, this.drag ? 0.35 : 0.12);
        this.set(nx);
        const skew = clamp((this.target - this.x) * 0.012, -4, 4);
        this.cards.forEach((c) => (c.style.transform = `skewX(${-skew * 0.4}deg)`));
        if (this.drag || Math.abs(this.target - this.x) > 0.3 || Math.abs(this.v) > 0.05) this.raf = requestAnimationFrame(tick);
        else this.cards.forEach((c) => (c.style.transform = ''));
      };
      this.raf = requestAnimationFrame(tick);
    },
    step(dir) {
      this.measure();
      const cw = this.cards[0].getBoundingClientRect().width + parseFloat(getComputedStyle(this.track).columnGap || 0);
      if (dir > 0 && this.target <= this.min + 2) return false;
      if (dir < 0 && this.target >= this.max - 2) return false;
      this.v = 0;
      this.target = clamp(this.target - dir * cw, this.min, this.max);
      this.loop();
      return true;
    },
  };
  (() => {
    let sx = 0, st = 0, lx = 0, lt = 0;
    PROJ.vp.addEventListener('pointerdown', (e) => {
      if (ids[cur] !== 'projects') return;
      PROJ.measure();
      PROJ.drag = true; sx = lx = e.clientX; st = PROJ.target; lt = performance.now(); PROJ.v = 0;
      PROJ.vp.setPointerCapture(e.pointerId);
      cursor.el.classList.add('is-pressing');
      PROJ.loop();
    });
    PROJ.vp.addEventListener('pointermove', (e) => {
      if (!PROJ.drag) return;
      const dx = e.clientX - sx;
      let t = st + dx;
      if (t > PROJ.max) t = PROJ.max + (t - PROJ.max) * 0.35;
      if (t < PROJ.min) t = PROJ.min + (t - PROJ.min) * 0.35;
      PROJ.target = t;
      const now = performance.now();
      PROJ.v = ((e.clientX - lx) / Math.max(1, now - lt)) * 16;
      cursor.el.classList.toggle('dir-right', e.clientX - lx > 0);
      lx = e.clientX; lt = now;
    });
    const end = () => {
      if (!PROJ.drag) return;
      PROJ.drag = false;
      cursor.el.classList.remove('is-pressing');
      if (performance.now() - lt > 80) PROJ.v = 0;
      PROJ.loop();
    };
    PROJ.vp.addEventListener('pointerup', end);
    PROJ.vp.addEventListener('pointercancel', end);
  })();
  D.projects = {
    enter(dir, el) {
      anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 400 });
      PROJ.reset();
      const a = textIn($('.proj__title', el), { delay: 150, stagger: 26 });
      PROJ.cards.forEach((c, k) => {
        anim(c, [{ transform: 'translateX(105vw)' }, { transform: 'none' }], { duration: 1400, delay: 350 + k * 90, easing: 'cubic-bezier(.16,1,.3,1)' });
      });
      return Math.max(a, 1500) - 300;
    },
    outro(dir, el) {
      textOut($('.proj__title', el), { stagger: 8 });
      PROJ.cards.forEach((c, k) => {
        anim(c, [{ transform: 'none' }, { transform: 'translateX(-110vw)' }], { duration: 900, delay: k * 60, easing: EASE_IO });
      });
      return 800;
    },
    step(dir) { return PROJ.step(dir); },
  };

  // 8 — TESTIMONIALS
  const tcards = $$('.tcard');
  D.testimonials = {
    enter(dir, el) {
      anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 400 });
      anim($('.test__bg img', el), [{ opacity: 0, transform: 'translateY(-6%) scale(1.05)' }, { opacity: 1, transform: 'none' }], { duration: 1800 });
      const a = textIn($('.test__title', el), { delay: 250, stagger: 22 });
      tcards.forEach((c, k) => {
        anim(c, [{ transform: 'translateY(115vh)' }, { transform: 'none' }], { duration: 1500, delay: 300 + [0, 120, 60, 180][k], easing: 'cubic-bezier(.16,1,.3,1)' });
      });
      return Math.max(a, 1500) - 300;
    },
    outro(dir, el) {
      textOut($('.test__title', el), { stagger: 7 });
      tcards.forEach((c, k) => {
        anim(c, [{ transform: 'none' }, { transform: 'translateY(115vh)' }], { duration: 950, delay: [60, 0, 120, 30][k], easing: EASE_IO });
      });
      anim($('.test__bg img', el), [{ opacity: 1 }, { opacity: 0 }], { duration: 700, delay: 400 });
      return 900;
    },
  };

  // 9 — FINAL
  D.final = {
    enter(dir, el) {
      if (window.Logo3D) window.Logo3D.play(true);
      const a = textIn($('.final__title', el), { delay: 700, stagger: 20 });
      textIn($('.final__sub', el), { delay: 1300, stagger: 6, dur: 500, shift: 0.3 });
      return a - 400;
    },
    outro(dir, el) {
      textOut($('.final__title', el), { stagger: 5 });
      textOut($('.final__sub', el), { stagger: 2 });
      return 400;
    },
    after() { if (window.Logo3D) window.Logo3D.play(false); },
  };

  /* -----------------------------------------------------------
     Transition engine
  ----------------------------------------------------------- */
  const scrollBar = $('#scrollBar');
  const navLinks = $$('.header__nav a');

  function applyChrome(el) {
    body.classList.toggle('theme-light', el.dataset.theme === 'light');
    body.classList.toggle('theme-dark', el.dataset.theme !== 'light');
    body.classList.toggle('show-lines', el.hasAttribute('data-lines'));
    setCTA(el.dataset.cta || 'none');
    scrollBar.style.transform = `scaleY(${(slides.indexOf(el) + 1) / slides.length})`;
    navLinks.forEach((a) => a.classList.toggle('is-current', a.getAttribute('href') === '#' + el.id));
    if (el.id !== 'projects') cursor.el.classList.remove('is-drag', 'is-pressing');
    if (history.replaceState) history.replaceState(null, '', '#' + el.id);
  }

  function enterSlide(el, dir) {
    clearAnims(el);
    el.classList.add('is-active');
    applyChrome(el);
    if (COVER.has(el.id)) {
      const from = el.id === 'final' ? 'inset(100% 0 0 0)' : dir > 0 ? 'translateY(100%)' : 'translateY(-100%)';
      if (el.id === 'final') {
        anim(el, [{ clipPath: dir > 0 ? 'inset(100% 0 0 0)' : 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 1150, easing: EASE_IO });
      } else {
        anim(el, [{ transform: from }, { transform: 'none' }], { duration: 1150, easing: EASE_IO });
      }
    }
    return D[el.id].enter(dir, el);
  }

  async function goTo(idx, opts = {}) {
    idx = clamp(idx, 0, slides.length - 1);
    if (idx === cur || (busy && !opts.force)) return;
    busy = true;
    const dir = idx > cur ? 1 : -1;
    const fromEl = slides[cur];
    const toEl = slides[idx];
    setCTA(toEl.dataset.cta || 'none');
    let outMs = 0;
    if (fromEl) {
      fromEl.classList.add('is-leaving');
      fromEl.classList.remove('is-active');
      if (D[fromEl.id].reset) D[fromEl.id].reset();
      outMs = D[fromEl.id].outro(dir, fromEl);
      const toCover = COVER.has(toEl.id) || (toEl.id === 'investors' && dir < 0);
      if (toCover) {
        // the new slide covers the old one; push the old one away a bit (parallax)
        await wait(Math.min(outMs, 260));
        anim(fromEl, [{ transform: 'none', filter: 'brightness(1)' }, { transform: `translateY(${-dir * 22}%)`, filter: 'brightness(.45)' }], { duration: 1150, easing: EASE_IO });
      } else {
        await wait(outMs * 0.85);
        anim(fromEl, [{ opacity: 1 }, { opacity: 0 }], { duration: 450, easing: EASE });
        await wait(toEl.id === 'investors' ? 0 : 180);
      }
    }
    cur = idx;
    const inMs = enterSlide(toEl, dir);
    const settle = Math.max(1150, Math.min(inMs, 1700));
    setTimeout(() => {
      if (fromEl) {
        fromEl.classList.remove('is-leaving');
        clearAnims(fromEl);
        if (D[fromEl.id].after) D[fromEl.id].after();
      }
    }, 1250);
    await wait(settle);
    busy = false;
  }

  function intent(dir) {
    if (busy || cur < 0) return;
    const d = D[ids[cur]];
    if (d.step && d.step(dir)) {
      busy = true;
      setTimeout(() => (busy = false), ids[cur] === 'maximize' ? 1150 : 450);
      return;
    }
    goTo(cur + dir);
  }

  /* -----------------------------------------------------------
     Input: wheel / keys / touch / links
  ----------------------------------------------------------- */
  (() => {
    let last = 0, lastAbs = 0;
    window.addEventListener('wheel', (e) => {
      if ($('#search').classList.contains('is-open')) return;
      e.preventDefault();
      const now = performance.now();
      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : (ids[cur] === 'projects' || ids[cur] === 'maximize' ? e.deltaX : 0);
      const abs = Math.abs(delta);
      const gap = now - last;
      const fresh = gap > 160 || abs > lastAbs * 1.6 + 4;
      last = now; lastAbs = abs;
      if (abs < 3 || busy || !fresh) return;
      intent(delta > 0 ? 1 : -1);
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
      if ($('#search').classList.contains('is-open')) { if (e.key === 'Escape') closeSearch(); return; }
      const k = e.key;
      if (['ArrowDown', 'PageDown', ' '].includes(k)) { e.preventDefault(); intent(1); }
      else if (['ArrowUp', 'PageUp'].includes(k)) { e.preventDefault(); intent(-1); }
      else if (k === 'ArrowRight' && D[ids[cur]].step) { e.preventDefault(); intent(1); }
      else if (k === 'ArrowLeft' && D[ids[cur]].step) { e.preventDefault(); intent(-1); }
      else if (k === 'Home') goTo(0);
      else if (k === 'End') goTo(slides.length - 1);
    });

    let ty = 0, tx = 0, tt = 0;
    window.addEventListener('touchstart', (e) => { ty = e.touches[0].clientY; tx = e.touches[0].clientX; tt = Date.now(); }, { passive: true });
    window.addEventListener('touchend', (e) => {
      const t = e.changedTouches[0];
      const dy = ty - t.clientY, dx = tx - t.clientX;
      if (Date.now() - tt > 900) return;
      if (Math.abs(dy) > 45 && Math.abs(dy) > Math.abs(dx)) {
        if (e.target.closest('.calc')) return;
        intent(dy > 0 ? 1 : -1);
      } else if (Math.abs(dx) > 45 && ids[cur] === 'maximize') {
        intent(dx > 0 ? 1 : -1);
      }
    }, { passive: true });

    document.addEventListener('click', (e) => {
      const a = e.target.closest('a.js-goto');
      if (!a) return;
      const id = a.getAttribute('href').slice(1);
      const i = ids.indexOf(id);
      if (i < 0) return;
      e.preventDefault();
      goTo(i);
    });
  })();

  /* -----------------------------------------------------------
     Maximize: hover / click to expand photo
  ----------------------------------------------------------- */
  (() => {
    const el = MAX.el;
    const hit = $('#maxHit');
    const inRect = (x, y, pad) => {
      const r = hit.getBoundingClientRect();
      return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
    };
    el.addEventListener('pointermove', (e) => {
      if (busy || ids[cur] !== 'maximize' || e.pointerType !== 'mouse') return;
      if (!MAX.expanded && inRect(e.clientX, e.clientY, 0)) MAX.setExpanded(true);
      else if (MAX.expanded && !inRect(e.clientX, e.clientY, 6)) MAX.setExpanded(false);
    });
    el.addEventListener('pointerleave', () => MAX.setExpanded(false));
    $('#maxDot').addEventListener('click', () => MAX.setExpanded(!MAX.expanded));
    MAX.cards.forEach((c) => c.addEventListener('click', (e) => { if (e.pointerType !== 'mouse') MAX.setExpanded(!MAX.expanded); }));
  })();

  /* -----------------------------------------------------------
     Why: accordion
  ----------------------------------------------------------- */
  whyItems.forEach((li) => {
    $('button', li).addEventListener('click', () => {
      const open = !li.classList.contains('is-open');
      whyItems.forEach((o) => { o.classList.remove('is-open'); $('p', o).style.height = '0px'; });
      if (open) {
        li.classList.add('is-open');
        const p = $('p', li);
        p.style.height = p.scrollHeight + 'px';
      }
    });
  });

  /* -----------------------------------------------------------
     Testimonials: floating parallax
  ----------------------------------------------------------- */
  (() => {
    let mx = 0, my = 0, sx = 0, sy = 0;
    window.addEventListener('pointermove', (e) => {
      mx = e.clientX / innerWidth - 0.5;
      my = e.clientY / innerHeight - 0.5;
    });
    const tick = (t) => {
      requestAnimationFrame(tick);
      if (ids[cur] !== 'testimonials') return;
      sx = lerp(sx, mx, 0.06); sy = lerp(sy, my, 0.06);
      const u = innerWidth / 673;
      tcards.forEach((c, k) => {
        const d = parseFloat(c.style.getPropertyValue('--d')) || 1;
        const fy = Math.sin(t / 1400 + k * 1.7) * 2.2;
        c.style.setProperty('--mx', `${(-sx * 14 * d) * u}px`);
        c.style.setProperty('--my', `${(-sy * 10 * d + fy) * u}px`);
      });
    };
    requestAnimationFrame(tick);
  })();

  /* -----------------------------------------------------------
     Calculator
  ----------------------------------------------------------- */
  (() => {
    const disp = $('#calcDisplay');
    const income = $('#calcIncome');
    const msg = $('#calcMsg');
    const RATE = 250; // $ per sq ft per year
    let val = '120', acc = 0, pending = false, fresh = false;
    const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US');
    const render = () => {
      disp.textContent = val;
      income.textContent = 'Income: ' + fmt((Number(val) || 0) * RATE);
      disp.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 250 });
    };
    $$('.calc__keys button').forEach((b) =>
      b.addEventListener('click', () => {
        const k = b.dataset.k;
        if (/\d/.test(k)) {
          if (fresh || val === '0') { val = k; fresh = false; }
          else if (val.length < 7) val += k;
        } else if (k === '+') {
          acc += Number(val) || 0; pending = true; fresh = true; val = String(acc);
        } else if (k === '=') {
          if (pending) { val = String(acc + (fresh ? 0 : Number(val) || 0)); acc = 0; pending = false; fresh = true; }
        } else if (k === 'C') {
          val = '0'; acc = 0; pending = false; fresh = false;
        }
        msg.textContent = '';
        render();
      })
    );
    const zip = $('#calcZip'), days = $('#calcDays');
    [zip, days].forEach((i) => i.addEventListener('input', () => { i.value = i.value.replace(/\D/g, ''); msg.textContent = ''; }));
    $('#calc').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!/^\d{5}$/.test(zip.value)) { msg.textContent = 'Please enter a 5-digit zip code'; zip.focus(); return; }
      const d = Number(days.value);
      if (!d || d > 365) { msg.textContent = 'Number of days: 1 – 365'; days.focus(); return; }
      const est = (Number(val) || 0) * RATE * (d / 365);
      msg.textContent = `Thank you! Estimated income for ${d} days: ${fmt(est)}. We'll contact you shortly.`;
    });
  })();

  /* -----------------------------------------------------------
     Search overlay
  ----------------------------------------------------------- */
  const search = $('#search');
  function closeSearch() { search.classList.remove('is-open'); search.setAttribute('aria-hidden', 'true'); }
  $('#searchBtn').addEventListener('click', () => {
    search.classList.add('is-open'); search.setAttribute('aria-hidden', 'false');
    setTimeout(() => $('input', search).focus(), 100);
  });
  $('#searchClose').addEventListener('click', closeSearch);
  search.addEventListener('click', (e) => { if (e.target === search) closeSearch(); });

  /* -----------------------------------------------------------
     Custom cursor
  ----------------------------------------------------------- */
  const cursor = { el: $('#cursor'), x: innerWidth / 2, y: innerHeight / 2, tx: innerWidth / 2, ty: innerHeight / 2 };
  (() => {
    const c = cursor;
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      c.tx = e.clientX; c.ty = e.clientY;
      c.el.classList.remove('is-hidden');
      const t = e.target;
      c.el.classList.toggle('is-drag', !!t.closest('.proj__viewport') && ids[cur] === 'projects');
      c.el.classList.toggle('is-hover', !!t.closest('a, button, input, .max__card'));
    });
    document.addEventListener('pointerleave', () => c.el.classList.add('is-hidden'));
    document.documentElement.addEventListener('mouseleave', () => c.el.classList.add('is-hidden'));
    const tick = () => {
      c.x = lerp(c.x, c.tx, 0.28); c.y = lerp(c.y, c.ty, 0.28);
      c.el.style.transform = `translate3d(${c.x}px,${c.y}px,0)`;
      requestAnimationFrame(tick);
    };
    tick();
  })();

  /* -----------------------------------------------------------
     Preloader
  ----------------------------------------------------------- */
  const loader = $('#loader');
  const loaderNum = $('#loaderNum');
  const loaderBar = $('#loaderBar');
  const outlinePaths = $$('.loader__outline path');

  function preload() {
    const srcs = [...new Set($$('img').map((i) => i.currentSrc || i.src))];
    let done = 0;
    const total = srcs.length + 1; // + fonts
    const state = { p: 0 };
    const bump = () => { done++; state.p = done / total; };
    srcs.forEach((s) => {
      const im = new Image();
      im.onload = im.onerror = bump;
      im.src = s;
    });
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(bump);
    setTimeout(() => { state.p = 1; }, 9000); // never get stuck
    return state;
  }

  function startLoader() {
    const state = preload();
    requestAnimationFrame(() => loader.classList.add('is-in'));
    const MIN = reduced ? 300 : 2600;
    const t0 = performance.now();
    let shown = 0;
    return new Promise((resolve) => {
      const tick = (now) => {
        const timeP = Math.min(1, (now - t0) / MIN);
        const target = Math.min(timeP, state.p);
        shown = lerp(shown, target, 0.12);
        if (target >= 1 && shown > 0.995) shown = 1;
        const pct = Math.round(shown * 100);
        loaderNum.textContent = pct;
        loaderBar.style.transform = `scaleX(${shown})`;
        outlinePaths.forEach((p, k) => (p.style.strokeDashoffset = String(1 - clamp(shown * 1.25 - k * 0.15, 0, 1))));
        if (shown >= 1) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  async function boot() {
    await startLoader();
    await wait(350);
    loader.classList.remove('is-in');
    await wait(500);
    loader.classList.add('is-done');
    body.classList.remove('is-loading');
    await wait(250);
    body.classList.add('ui-in');
    navLinks.forEach((a, k) => textIn(a, { delay: 200 + k * 90, stagger: 22, dur: 600, shift: 0.8 }));
    const fromHash = ids.indexOf(location.hash.slice(1));
    busy = false;
    goTo(fromHash > 0 ? fromHash : 0, { force: true });
  }

  window.addEventListener('resize', () => {
    if (ids[cur] === 'projects') { PROJ.measure(); PROJ.target = clamp(PROJ.target, PROJ.min, PROJ.max); PROJ.loop(); }
    if (ctaMode !== 'none') { const m = ctaMode; ctaMode = 'none'; cta.classList.remove('is-on'); setCTA(m); }
  });

  // expose for debugging / tests
  window.CM = { goTo: (i) => goTo(typeof i === 'string' ? ids.indexOf(i) : i), get index() { return cur; }, get busy() { return busy; } };

  boot();
})();
