/* ==========================================================================
   Solis Art — scroll engine
   - Lenis gives the page its soft, inertial scroll.
   - One requestAnimationFrame loop reads the scroll position once per frame
     and drives every pinned scene from cached measurements (no layout reads
     while scrolling, only transform / opacity writes).
   - Stepped scenes "hold" on each slide and gently snap to the closest one
     when you stop halfway, so you always land on a clean image.
   ========================================================================== */
(() => {
  'use strict';

  const body = document.body;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MOTION = reduceMotion ? 0 : 1;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
  };
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /* ------------------------------------------------------------------------
     Stepped progress: every step owns an equal slice of the scene. Within
     a slice the picture rests ("holds") and only blends to the next step in
     the middle of the scroll between two steps.
     ------------------------------------------------------------------------ */
  const HOLD = 0.46;
  function stepped(p, n, hold = HOLD) {
    const raw = clamp(p * n - 0.5, 0, n - 1);
    const i = Math.min(Math.floor(raw), n - 2);
    const f = raw - i;
    const t = i + smoothstep(hold / 2, 1 - hold / 2, f);
    return { t, raw, idx: Math.round(t) };
  }

  /* ------------------------------------------------------------------------
     Smooth scroll
     ------------------------------------------------------------------------ */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  let lenis = null;
  if (!reduceMotion && typeof window.Lenis === 'function') {
    lenis = new window.Lenis({
      lerp: 0.085,
      wheelMultiplier: 0.9,
      smoothWheel: true,
      syncTouch: false, // native touch momentum feels best on phones
    });
    lenis.stop();
  }

  const getScroll = () => (lenis ? lenis.scroll : window.scrollY);

  function scrollToY(target, duration = 1.8) {
    if (lenis) {
      lenis.scrollTo(target, { duration, easing: easeInOutCubic });
    } else {
      const top = typeof target === 'number' ? target : target.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }

  /* ------------------------------------------------------------------------
     Text splitting (title + signature)
     ------------------------------------------------------------------------ */
  function split(el) {
    const text = el.textContent.trim().replace(/\s+/g, ' ');
    el.textContent = '';
    const sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = text;
    el.append(sr);
    let i = 0;
    text.split(' ').forEach((word, wi, words) => {
      const w = document.createElement('span');
      w.className = 'w';
      w.setAttribute('aria-hidden', 'true');
      for (const ch of word) {
        const c = document.createElement('span');
        c.className = 'c';
        c.textContent = ch;
        c.style.setProperty('--i', i++);
        w.append(c);
      }
      el.append(w);
      if (wi < words.length - 1) {
        const space = document.createTextNode(' ');
        el.append(space);
        i++;
      }
    });
  }
  $$('.js-split, .js-split-sign').forEach(split);

  /* ------------------------------------------------------------------------
     Scene registry
     ------------------------------------------------------------------------ */
  let vw = window.innerWidth;
  let vh = window.innerHeight;
  const scenes = [];

  function addScene(el, setup) {
    const scene = {
      el,
      sticky: $('.scene__sticky', el),
      top: 0,
      height: 0,
      dist: 1,
      p: -1,
      n: Number(el.dataset.steps) || 0,
      measure: null,
      update: null,
    };
    setup(scene);
    scenes.push(scene);
    return scene;
  }

  /* ---------- 01 Hero: turntable with call-outs ---------- */

  const HERO_CAPTIONS = ['Vue de profil', 'Trois-quarts gauche', 'Le drapé', 'Sur la proue'];
  // a = anchor on the statue, e = elbow, x = end of the horizontal stroke.
  // Units follow the stage viewBox (0–100 wide, 0–125 high).
  const HERO_CALLOUTS = [
    [
      { a: [77, 30], e: [87, 17], x: 99, t: '5,12 m', s: 'hauteur avec le navire' },
      { a: [33, 22], e: [24, 38], x: 2, t: 'marbre blanc de Paros' },
    ],
    [
      { a: [53, 72], e: [66, 83], x: 99, t: '30 tonnes' },
      { a: [21, 86], e: [11, 96], x: 0, t: '6 blocs de marbre' },
    ],
    [
      { a: [72, 13], e: [83, 26], x: 100, t: 'vers 190 av. J.-C.', s: 'époque hellénistique' },
      { a: [19, 80], e: [9, 91], x: 0, t: 'Île de Samothrace', s: 'mer Égée' },
    ],
    [
      { a: [62, 86], e: [76, 97], x: 99, t: 'Proue de navire', s: 'marbre gris de Lartos' },
      { a: [37, 30], e: [24, 41], x: 1, t: 'Escalier Daru', s: 'Musée du Louvre' },
    ],
  ];

  let heroIntro = reduceMotion ? 1 : 0;

  const hero = addScene($('#oeuvre'), (s) => {
    const el = s.el;
    const imgs = $$('.hero__img', el);
    const stage = $('.js-hero-stage', el);
    const svg = $('.js-hero-lines', el);
    const labelsBox = $('.js-hero-labels', el);
    const num = $('.js-hero-num', el);
    const caption = $('.js-hero-caption', el);
    const segs = $$('.hero__segments i', el);
    const hint = $('.js-hint', el);
    const NS = 'http://www.w3.org/2000/svg';

    const groups = HERO_CALLOUTS.map((list) =>
      list.map((c) => {
        const side = c.x > c.e[0] ? 'r' : 'l';
        const line = document.createElementNS(NS, 'polyline');
        line.setAttribute('points', `${c.a[0]},${c.a[1]} ${c.e[0]},${c.e[1]} ${c.x},${c.e[1]}`);
        line.setAttribute('pathLength', '1');
        const dot = document.createElementNS(NS, 'circle');
        dot.setAttribute('cx', c.a[0]);
        dot.setAttribute('cy', c.a[1]);
        dot.setAttribute('r', '0.6');
        svg.append(line, dot);

        const lab = document.createElement('div');
        lab.className = `hero__label hero__label--${side}`;
        lab.style.setProperty('--x', `${c.x}%`);
        lab.style.setProperty('--y', `${(c.e[1] / 125) * 100}%`);
        lab.textContent = c.t;
        if (c.s) {
          const small = document.createElement('small');
          small.textContent = c.s;
          lab.append(small);
        }
        labelsBox.append(lab);
        return { line, dot, lab, side, tx: '0%', ty: '-100%', v: -1 };
      })
    );

    let lastIdx = 0;
    let swapTimer = 0;
    const imgState = imgs.map(() => ({ o: -1, hidden: false }));

    s.measure = () => {
      // ~1 screen pixel, whatever the stage size
      svg.style.strokeWidth = (100 / Math.max(1, stage.clientWidth)).toFixed(4);
      // Wide screens: text sits outside the stroke like the reference.
      // Narrow screens: text sits on top of the stroke so it never leaves the screen.
      const out = vw >= 900;
      for (const list of groups) {
        for (const c of list) {
          c.lab.classList.toggle('hero__label--out', out);
          if (out) {
            c.tx = c.side === 'r' ? '12px' : 'calc(-100% - 12px)';
            c.ty = '-50%';
          } else {
            c.tx = c.side === 'r' ? '-100%' : '0%';
            c.ty = '-100%';
          }
          c.v = -1;
        }
      }
    };

    s.update = (p) => {
      const st = stepped(p, s.n);

      // Images: cross-fade between views + a slow continuous "camera push"
      for (let k = 0; k < imgs.length; k++) {
        const img = imgs[k];
        const state = imgState[k];
        const o = clamp(1 - Math.abs(st.t - k));
        if (o < 0.002) {
          if (!state.hidden) {
            img.style.opacity = '0';
            img.style.visibility = 'hidden';
            state.hidden = true;
            state.o = 0;
          }
          continue;
        }
        if (state.hidden) {
          img.style.visibility = '';
          state.hidden = false;
        }
        const d = clamp(st.raw - k, -1, 1) * MOTION;
        img.style.opacity = o.toFixed(4);
        img.style.transform = `translate3d(0, ${(-d * 1.4).toFixed(3)}%, 0) scale(${(1 + d * 0.05).toFixed(4)})`;
        state.o = o;
      }

      // Call-outs: draw in on their own slide only
      for (let k = 0; k < groups.length; k++) {
        let v = clamp(1 - Math.abs(st.t - k) * 2.6);
        if (k === 0) v *= heroIntro;
        const list = groups[k];
        for (let j = 0; j < list.length; j++) {
          const c = list[j];
          const dv = clamp(v * 1.2 - j * 0.2);
          if (dv === c.v) continue;
          c.v = dv;
          const draw = easeInOutCubic(dv);
          c.line.style.strokeDashoffset = (1 - draw).toFixed(4);
          c.line.style.opacity = dv > 0 ? '1' : '0';
          c.dot.style.opacity = smoothstep(0, 0.3, dv).toFixed(3);
          const lo = smoothstep(0.55, 1, dv);
          c.lab.style.opacity = lo.toFixed(3);
          c.lab.style.transform = `translate(${c.tx}, calc(${c.ty} + ${((1 - lo) * 10).toFixed(2)}px))`;
        }
      }

      for (let k = 0; k < segs.length; k++) {
        segs[k].style.setProperty('--f', clamp(p * s.n - k).toFixed(3));
      }

      if (hint) hint.style.opacity = (1 - smoothstep(0.01, 0.06, p)).toFixed(3);

      if (st.idx !== lastIdx) {
        lastIdx = st.idx;
        num.textContent = String(st.idx + 1).padStart(2, '0');
        caption.classList.add('is-swap');
        clearTimeout(swapTimer);
        swapTimer = setTimeout(() => {
          caption.textContent = HERO_CAPTIONS[lastIdx];
          caption.classList.remove('is-swap');
        }, 220);
      }
    };
  });

  /* ---------- 02 Description: a camera over a single image ---------- */

  const detail = addScene($('#description'), (s) => {
    const el = s.el;
    const stage = $('.js-detail-stage', el);
    const img = $('.js-detail-img', el);
    const texts = $$('.detail__text', el);
    const thumbs = $$('.js-thumb', el);
    const bars = thumbs.map((t) => $('.thumb__bar b', t));
    const zoomEl = $('.js-detail-zoom', el);

    const IW = 1400;
    const IH = 2196;
    // Image is laid out at its largest zoom and only ever scaled *down*,
    // so it stays sharp at every step.
    const ZMAX = 2.7;
    const KEYS = [
      { x: 0.5, y: 0.5, z: 1 }, // overview
      { x: 0.62, y: 0.11, z: 1.95 }, // wings
      { x: 0.29, y: 0.29, z: 2.35 }, // torso / chiton
      { x: 0.36, y: 0.75, z: 2.1 }, // drapery between the legs
    ];

    let W = 1;
    let H = 1;
    let s0 = 1;
    let lastZoom = '';
    let lastActive = -1;

    s.measure = () => {
      W = stage.clientWidth;
      H = stage.clientHeight;
      s0 = Math.min(W / IW, H / IH) * 0.94;
      img.style.width = `${(IW * s0 * ZMAX).toFixed(1)}px`;
      img.style.height = `${(IH * s0 * ZMAX).toFixed(1)}px`;
    };

    s.update = (p) => {
      const st = stepped(p, s.n);
      const i = Math.min(Math.floor(st.t), KEYS.length - 2);
      const f = st.t - i;
      const a = KEYS[i];
      const b = KEYS[i + 1];

      let z = Math.exp(lerp(Math.log(a.z), Math.log(b.z), f));
      // between two close-ups, pull back a little like a real camera move
      if (i > 0) z *= 1 - 0.22 * Math.sin(Math.PI * f);
      // keep breathing slightly while resting on a slide
      z *= 1 + (st.raw - st.t) * 0.08 * MOTION;
      const cx = lerp(a.x, b.x, f);
      const cy = lerp(a.y, b.y, f);

      const S = s0 * z;
      const tx = W / 2 - cx * IW * S;
      const ty = H / 2 - cy * IH * S;
      img.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${(z / ZMAX).toFixed(5)})`;

      for (let k = 0; k < texts.length; k++) {
        const v = clamp(1 - Math.abs(st.t - k) * 1.8);
        const t = texts[k];
        t.style.opacity = v.toFixed(3);
        t.style.transform = `translate3d(0, ${((k - st.t) * 26).toFixed(2)}px, 0)`;
      }

      for (let j = 0; j < thumbs.length; j++) {
        bars[j].style.transform = `scaleX(${clamp(st.t - j).toFixed(4)})`;
      }
      if (st.idx !== lastActive) {
        lastActive = st.idx;
        thumbs.forEach((t, j) => t.classList.toggle('is-active', j + 1 === st.idx));
        texts.forEach((t, k) => t.setAttribute('aria-hidden', k === st.idx ? 'false' : 'true'));
      }

      const zt = `×${z.toFixed(1)}`;
      if (zt !== lastZoom) {
        lastZoom = zt;
        zoomEl.textContent = zt;
      }
    };

    thumbs.forEach((t) => {
      t.addEventListener('click', () => {
        const k = Number(t.dataset.step);
        scrollToY(s.top + ((k + 0.5) / s.n) * s.dist, 1.2);
      });
    });
  });

  /* ---------- 04 Chronologie: horizontal track ---------- */

  addScene($('#chronologie'), (s) => {
    const el = s.el;
    const track = $('.js-chrono-track', el);
    const cards = $$('.chrono__card', el);
    const yearEl = $('.js-chrono-year', el);
    const eraEl = $('.js-chrono-era', el);
    const line = $('.js-chrono-line', el);

    let centers = [];
    let shift = 0;
    let focus = 0;
    let lastNearest = 0;
    let yearTimer = 0;
    const cardO = cards.map(() => -1);

    s.measure = () => {
      centers = cards.map((c) => c.offsetLeft + c.offsetWidth / 2);
      // the active card is the one aligned with the content column
      focus = centers[0];
      shift = Math.max(0, centers[centers.length - 1] - focus);
    };

    s.update = (p) => {
      // each date rests for a moment before the track glides to the next one
      const q = stepped(p, cards.length, 0.32).t / (cards.length - 1);
      const x = -q * shift;
      track.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
      line.style.transform = `scaleX(${q.toFixed(4)})`;

      let nearest = 0;
      let best = Infinity;
      for (let k = 0; k < cards.length; k++) {
        const d = Math.abs(centers[k] + x - focus);
        if (d < best) {
          best = d;
          nearest = k;
        }
        const o = 1 - clamp(d / (vw * 0.5)) * 0.78;
        if (Math.abs(o - cardO[k]) > 0.002) {
          cardO[k] = o;
          cards[k].style.opacity = o.toFixed(3);
        }
      }

      if (nearest !== lastNearest) {
        lastNearest = nearest;
        yearEl.classList.add('is-swap');
        clearTimeout(yearTimer);
        yearTimer = setTimeout(() => {
          const c = cards[lastNearest];
          yearEl.textContent = c.dataset.year;
          eraEl.textContent = c.dataset.era || '';
          yearEl.classList.remove('is-swap');
        }, 180);
      }
    };
  });

  /* ---------- 05 Louvre: pull back over the Cour Napoléon ---------- */

  addScene($('#louvre'), (s) => {
    const el = s.el;
    const bg = $('.js-louvre-bg', el);
    const shade = $('.js-louvre-shade', el);
    const photo = $('.js-louvre-photo', el);
    const text = $('.js-louvre-text', el);

    s.update = (p) => {
      const z = lerp(1.38, 1, easeOutCubic(clamp(p / 0.85)));
      bg.style.transform = `scale(${z.toFixed(4)})`;
      shade.style.opacity = lerp(0.96, 0.12, smoothstep(0, 0.78, p)).toFixed(3);

      const o1 = smoothstep(0.06, 0.36, p);
      photo.style.opacity = o1.toFixed(3);
      photo.style.transform = `translate3d(0, ${((1 - o1) * 70).toFixed(2)}px, 0) scale(${lerp(0.92, 1, o1).toFixed(4)})`;

      const o2 = smoothstep(0.14, 0.44, p);
      text.style.opacity = o2.toFixed(3);
      text.style.transform = `translate3d(0, ${((1 - o2) * 46).toFixed(2)}px, 0)`;
    };
  });

  /* ------------------------------------------------------------------------
     Parallax (portrait, band) — cached positions, transform only
     ------------------------------------------------------------------------ */
  const parallax = [
    ...$$('.js-parallax').map((el) => ({ el, anchor: el.parentElement, axis: 'y', speed: Number(el.dataset.speed) || 0 })),
    ...$$('.js-band').map((el) => ({ el, anchor: el.parentElement, axis: 'x', speed: Number(el.dataset.speed) || 0 })),
  ];

  /* ------------------------------------------------------------------------
     Chapter rail + page progress
     ------------------------------------------------------------------------ */
  const railItems = $$('.rail__item');
  const railTargets = railItems.map((a) => $(a.getAttribute('href')));
  let railTops = [];
  let railActive = -1;
  const progressBar = $('.js-progress');
  let maxScroll = 1;

  /* ------------------------------------------------------------------------
     Measure (only on load / resize — never while scrolling)
     ------------------------------------------------------------------------ */
  function measure() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    const y = window.scrollY;

    for (const s of scenes) {
      const r = s.el.getBoundingClientRect();
      s.top = r.top + y;
      s.height = s.el.offsetHeight;
      s.dist = Math.max(1, s.height - s.sticky.offsetHeight);
      if (s.measure) s.measure();
      s.p = -1;
    }

    for (const it of parallax) {
      const r = it.anchor.getBoundingClientRect();
      it.top = r.top + y;
      it.h = r.height;
      it.range = it.axis === 'y' ? r.height * 0.075 : Infinity;
    }

    railTops = railTargets.map((t) => (t ? t.getBoundingClientRect().top + y : 0));
    maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
    needsRender = true;
  }

  /* ------------------------------------------------------------------------
     Render (once per frame, only when the scroll moved)
     ------------------------------------------------------------------------ */
  let needsRender = true;

  function render(scroll) {
    for (const s of scenes) {
      if (scroll < s.top - vh || scroll > s.top + s.height) continue; // off-screen
      const p = clamp((scroll - s.top) / s.dist);
      if (p === s.p) continue;
      s.p = p;
      s.update(p);
    }

    for (const it of parallax) {
      if (scroll + vh < it.top - 200 || scroll > it.top + it.h + 200) continue;
      const delta = it.top + it.h / 2 - (scroll + vh / 2);
      let v = delta * it.speed * MOTION;
      if (it.axis === 'y') {
        v = clamp(v, -it.range, it.range);
        it.el.style.transform = `translate3d(0, ${v.toFixed(2)}px, 0)`;
      } else {
        it.el.style.transform = `translate3d(${v.toFixed(2)}px, 0, 0)`;
      }
    }

    progressBar.style.transform = `scaleX(${clamp(scroll / maxScroll).toFixed(4)})`;

    let active = 0;
    for (let k = 0; k < railTops.length; k++) if (scroll + vh * 0.5 >= railTops[k]) active = k;
    if (active !== railActive) {
      railActive = active;
      railItems.forEach((a, k) => a.classList.toggle('is-active', k === active));
    }
  }

  /* ------------------------------------------------------------------------
     Soft snap: when you stop between two slides of a stepped scene, glide
     to the nearest one so the picture is never left half-blended.
     ------------------------------------------------------------------------ */
  let touching = false;
  let menuOpen = false;

  function trySnap(scroll) {
    if (!lenis || touching || menuOpen || reduceMotion) return;
    for (const s of [hero, detail]) {
      if (scroll <= s.top + 1 || scroll >= s.top + s.dist - 1) continue;
      const raw = ((scroll - s.top) / s.dist) * s.n - 0.5;
      if (raw <= 0 || raw >= s.n - 1) return; // resting on the first / last slide
      const nearest = Math.round(raw);
      if (Math.abs(raw - nearest) < HOLD / 2) return; // already on a slide
      const target = s.top + ((nearest + 0.5) / s.n) * s.dist;
      const distance = Math.abs(target - scroll);
      lenis.scrollTo(target, {
        duration: clamp(distance / 900, 0.55, 1.1),
        easing: easeInOutCubic,
      });
      return;
    }
  }

  window.addEventListener('touchstart', () => { touching = true; }, { passive: true });
  window.addEventListener('touchend', () => { touching = false; }, { passive: true });
  window.addEventListener('touchcancel', () => { touching = false; }, { passive: true });

  /* ------------------------------------------------------------------------
     Preloader — decode every image before the show starts
     ------------------------------------------------------------------------ */
  const loaderBar = $('.js-loader-bar');
  const loaderCount = $('.js-loader-count');
  let loadTarget = 0;
  let loadShown = 0;
  let started = false;
  let introStart = 0;

  function preload() {
    const imgs = $$('img');
    const total = imgs.length + 1;
    let done = 0;
    const tick = () => {
      done++;
      loadTarget = done / total;
    };
    const one = (img) =>
      new Promise((resolve) => {
        const finish = () => {
          const d = img.decode ? img.decode() : Promise.resolve();
          d.catch(() => {}).then(resolve);
        };
        if (img.complete && img.naturalWidth) finish();
        else {
          img.addEventListener('load', finish, { once: true });
          img.addEventListener('error', resolve, { once: true });
        }
      }).then(tick);
    const fonts = (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(tick);
    const all = Promise.all([...imgs.map(one), fonts]);
    const timeout = new Promise((r) => setTimeout(r, 9000));
    return Promise.race([all, timeout]);
  }

  function start() {
    if (started) return;
    started = true;
    measure();
    body.classList.remove('is-loading');
    if (lenis) lenis.start();
    introStart = performance.now();
    if (location.hash && location.hash.length > 1) {
      const t = document.getElementById(location.hash.slice(1));
      if (t) setTimeout(() => scrollToY(t, 1.6), 500);
    }
  }

  preload().then(() => {
    loadTarget = 1;
    setTimeout(start, 420);
  });

  /* ------------------------------------------------------------------------
     Main loop
     ------------------------------------------------------------------------ */
  let lastScroll = -1;
  let lastMoveAt = 0;
  let idleHandled = true;

  function loop(now) {
    if (lenis) lenis.raf(now);

    if (!started) {
      loadShown += (loadTarget - loadShown) * 0.12;
      loaderBar.style.transform = `scaleX(${loadShown.toFixed(4)})`;
      loaderCount.textContent = Math.round(loadShown * 100);
    }

    if (started && heroIntro < 1) {
      heroIntro = easeInOutCubic(clamp((now - introStart - 900) / 1500));
      hero.p = -1;
      needsRender = true;
    }

    const scroll = getScroll();
    if (scroll !== lastScroll || needsRender) {
      if (scroll !== lastScroll) {
        lastMoveAt = now;
        idleHandled = false;
      }
      lastScroll = scroll;
      needsRender = false;
      if (started) render(scroll);
    } else if (!idleHandled && now - lastMoveAt > 240) {
      idleHandled = true;
      trySnap(scroll);
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(measure, 120);
  });
  window.addEventListener('load', () => started && measure());
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => started && measure());

  /* ------------------------------------------------------------------------
     Reveal on enter
     ------------------------------------------------------------------------ */
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.12 }
  );
  $$('.reveal, .signature').forEach((el) => io.observe(el));

  /* ------------------------------------------------------------------------
     Navigation: anchors, menu, search
     ------------------------------------------------------------------------ */
  const burger = $('.js-burger');
  const menu = $('#menu');

  function setMenu(open) {
    menuOpen = open;
    body.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    menu.setAttribute('aria-hidden', String(!open));
    if (lenis) (open ? lenis.stop() : lenis.start());
  }
  burger.addEventListener('click', () => setMenu(!menuOpen));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuOpen) setMenu(false);
  });

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    const target = id === 'top' ? 0 : document.getElementById(id);
    if (target === null) return;
    e.preventDefault();
    if (menuOpen) setMenu(false);
    scrollToY(target, 1.8);
    if (id && id !== 'top') {
      try {
        history.replaceState(null, '', `#${id}`);
      } catch (err) {
        /* some embedded frames refuse history changes; scrolling still works */
      }
    }
  });

  const SEARCH = [
    [/champ|d[ée]couv|arch[ée]o|diplomat|artiste|andrinople|tours/i, 'champoiseau'],
    [/chrono|histoire|date|\b1[89]\d\d\b|\b20\d\d\b|restaur/i, 'chronologie'],
    [/louvre|mus[ée]e|paris|visite|daru|pyramide|o[uù] /i, 'louvre'],
    [/descr|aile|drap|chit|tunique|ventre|jambe/i, 'description'],
    [/victoire|nik[ée]|samothrace|statue|oeuvre|œuvre|sculpt|marbre|paros/i, 'oeuvre'],
  ];
  const searchForm = $('.js-search');
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = searchForm.q.value.trim();
    const hit = q && SEARCH.find(([re]) => re.test(q));
    if (hit) {
      scrollToY(document.getElementById(hit[1]), 1.8);
      searchForm.q.blur();
    } else {
      searchForm.classList.remove('is-miss');
      void searchForm.offsetWidth;
      searchForm.classList.add('is-miss');
    }
  });
})();
