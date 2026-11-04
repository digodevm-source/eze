/* ==========================================================================
   Altai Ridge — interactions

   Desktop ("stage" mode): every slide is a layer of one fixed scene and each
   change of slide is its own short film — push from the left, a camera that
   flies through the screen, an iris, a window opening onto the valley,
   a 3D flip, shutters, a diagonal wipe, a card dealt from the corner,
   doors opening into the house. Only transforms, opacity and clip-path are
   animated, and only the two slides involved are rendered.

   Phones / small screens: natural scrolling with scroll-linked card entrances.
   ========================================================================== */
(() => {
  'use strict';

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const root = document.documentElement;
  const pad = (n) => String(n).padStart(2, '0');

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const stageMQ = matchMedia('(min-width: 1024px) and (min-height: 620px)');
  const hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  const motion = hasGsap && !reduce;
  const stage = motion && stageMQ.matches;

  const slides = $$('.slide');
  const header = $('#header');
  const preloader = $('.preloader');
  const easeInOutQuart = (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);

  let lenis = null;
  let modalOpen = false;
  let menuOpen = false;
  let current = 0;
  let goToSlide = null; // set by the active engine

  if (hasGsap) gsap.registerPlugin(ScrollTrigger);
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (stage) root.classList.add('is-stage');
  // the two layouts are built differently, so crossing the breakpoint rebuilds the page
  if (motion && stageMQ.addEventListener) stageMQ.addEventListener('change', () => location.reload());

  /* ------------------------------------------------------------------------
     Text splitting (words / chars) for mask reveals
     ------------------------------------------------------------------------ */
  function splitWords(el) {
    const frag = document.createDocumentFragment();
    const walk = (node, parent) => {
      node.childNodes.forEach((n) => {
        if (n.nodeType === 3) {
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { parent.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span');
            const i = document.createElement('span');
            w.className = 'w'; i.className = 'wi'; i.textContent = part;
            w.appendChild(i); parent.appendChild(w);
          });
        } else if (n.nodeName === 'BR') {
          parent.appendChild(document.createElement('br'));
        } else if (n.nodeType === 1) {
          const clone = n.cloneNode(false);
          walk(n, clone);
          parent.appendChild(clone);
        }
      });
    };
    walk(el, frag);
    el.textContent = '';
    el.appendChild(frag);
  }
  function splitChars(el) {
    const text = el.textContent;
    el.textContent = '';
    [...text].forEach((c) => {
      const s = document.createElement('span');
      s.className = 'ch';
      s.textContent = c;
      el.appendChild(s);
    });
  }
  if (motion) {
    $$('[data-split]').forEach(splitWords);
    $$('[data-chars]').forEach(splitChars);
  }

  /* ------------------------------------------------------------------------
     Content intro of a slide: hide (prepare) → play (run)
     ------------------------------------------------------------------------ */
  const HERO_BITS = ['.hero__meta li', '.status', '.hero__facts li', '.hero__text', '.hero__cta', '.scroll-hint'];
  const CLIP_IMG = ':scope > img:not(.pimg):not(.pside__img)';

  function countUp(el, delay = 0) {
    if (el._count) el._count.kill();
    const end = parseFloat(el.dataset.count);
    const o = { v: 0 };
    el.textContent = '0';
    el._count = gsap.to(o, { v: end, duration: 2, delay, ease: 'power3.out', onUpdate: () => { el.textContent = Math.round(o.v); } });
  }

  function introTargets(slide) {
    const clips = $$('[data-clip]', slide);
    const hero = slide.classList.contains('slide--hero');
    return {
      words: $$('[data-split] .wi', slide),
      chars: $$('.ch', slide),
      reveals: $$('[data-reveal]', slide).concat(hero ? HERO_BITS.flatMap((q) => $$(q, slide)) : []),
      clips,
      clipImgs: clips.flatMap((c) => $$(CLIP_IMG, c)),
      bars: $$('[data-progress]', slide),
      counts: $$('[data-count]', slide),
      draw: $('.steps__draw', slide),
      big: stage ? $$('.nature__word span, .docs__word span', slide) : [],
    };
  }

  function prepareIntro(slide) {
    if (slide._intro) { slide._intro.kill(); slide._intro = null; }
    const t = introTargets(slide);
    if (t.words.length) gsap.set(t.words, { yPercent: 110 });
    if (t.chars.length) gsap.set(t.chars, { yPercent: 115 });
    if (t.reveals.length) gsap.set(t.reveals, { autoAlpha: 0, y: 30 });
    if (t.clips.length) gsap.set(t.clips, { clipPath: 'inset(100% 0% 0% 0%)' });
    if (t.clipImgs.length) gsap.set(t.clipImgs, { scale: 1.25 });
    if (t.bars.length) gsap.set(t.bars, { scaleX: 0 });
    t.counts.forEach((c) => { if (c._count) c._count.kill(); c.textContent = '0'; });
    if (t.draw) gsap.set(t.draw, { strokeDashoffset: 1 });
    if (t.big.length) gsap.set(t.big, { xPercent: 14, autoAlpha: 0 });
  }

  function runIntro(slide) {
    if (slide._intro) slide._intro.kill();
    const t = introTargets(slide);
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    if (t.chars.length) tl.to(t.chars, { yPercent: 0, duration: 1.4, stagger: 0.05 }, 0);
    if (t.words.length) tl.to(t.words, { yPercent: 0, duration: 1.15, stagger: 0.016 }, 0.05);
    if (t.reveals.length) tl.to(t.reveals, { autoAlpha: 1, y: 0, duration: 1.05, stagger: 0.045, clearProps: 'transform' }, 0.15);
    if (t.clips.length) tl.to(t.clips, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.25, ease: 'expo.inOut', stagger: 0.08 }, 0);
    if (t.clipImgs.length) tl.to(t.clipImgs, { scale: 1, duration: 1.9, clearProps: 'transform' }, 0.1);
    if (t.bars.length) tl.to(t.bars, { scaleX: (i, el) => el.dataset.progress / 100, duration: 1.7, ease: 'expo.inOut', stagger: 0.1 }, 0.3);
    if (t.counts.length) tl.add(() => t.counts.forEach((c) => countUp(c)), 0.2);
    if (t.draw) tl.to(t.draw, { strokeDashoffset: 0, duration: 2.1, ease: 'power2.inOut' }, 0.3);
    if (t.big.length) tl.to(t.big, { xPercent: 0, autoAlpha: 1, duration: 2.2 }, 0);
    slide._intro = tl;
    return tl;
  }

  /* ------------------------------------------------------------------------
     Pager + header state (shared by both engines)
     ------------------------------------------------------------------------ */
  const pagerCur = $('.pager__cur');
  const pagerDots = $('.pager__dots');
  const navLinks = $$('.nav a');
  $('.pager__total').textContent = pad(slides.length);
  const dots = slides.map((s, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', `${pad(i + 1)} — ${s.dataset.title}`);
    b.innerHTML = `<span>${s.dataset.title}</span>`;
    b.addEventListener('click', () => goToSlide && goToSlide(i));
    li.appendChild(b);
    pagerDots.appendChild(li);
    return b;
  });
  let pagerIndex = -1;
  function setActive(i) {
    if (i === pagerIndex) return;
    pagerIndex = i;
    dots.forEach((d, k) => d.classList.toggle('is-active', k === i));
    const id = slides[i].id;
    navLinks.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${id}`));
    if (motion) {
      gsap.timeline()
        .to(pagerCur, { yPercent: -60, autoAlpha: 0, duration: 0.2, ease: 'power2.in' })
        .add(() => { pagerCur.textContent = pad(i + 1); })
        .fromTo(pagerCur, { yPercent: 60, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.45, ease: 'expo.out' });
    } else {
      pagerCur.textContent = pad(i + 1);
    }
  }
  const headerSolid = () => menuOpen || (stage ? current > 0 : window.scrollY > window.innerHeight * 0.35);
  const updateHeader = () => header.classList.toggle('is-solid', headerSolid());
  setActive(0);

  // in-page links: "#projects" etc.
  const slideIndexOf = (hash) => {
    let t = null;
    try { t = hash && hash.length > 1 ? document.querySelector(hash) : null; } catch (err) { t = null; }
    const s = t && t.closest('.slide');
    return s ? slides.indexOf(s) : -1;
  };
  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const i = slideIndexOf(a.getAttribute('href'));
    if (menuOpen) toggleMenu(false);
    if (i < 0 || !goToSlide) return;
    e.preventDefault();
    goToSlide(i);
  }));

  /* ==========================================================================
     STAGE ENGINE (desktop)
     ========================================================================== */
  function initStage() {
    const S = slides.map((el) => {
      const card = $('.card', el);
      const shade = document.createElement('div');
      shade.className = 'card__shade';
      card.appendChild(shade);
      return { el, card, shade, inner: $('.card__inner', el), bg: $('.card__bg img', el) };
    });
    const shutter = document.createElement('div');
    shutter.className = 'shutter';
    shutter.setAttribute('aria-hidden', 'true');
    shutter.innerHTML = '<i></i>'.repeat(7);
    $('.slides').appendChild(shutter);
    const blades = $$('i', shutter);
    const IO = 'expo.inOut';

    /* FX[k] animates slide k → k+1. Going back plays the same film in reverse.
       front: which of the two slides is drawn on top while it runs.
       Each build starts with A at rest / B before entering, and ends with
       B at rest / A gone — so reversing it is always exact.
       All tweens finish together, so a reversed film starts moving at once.
       intro: when the arriving slide's own content starts to animate. */
    const FX = [
      { // 01 → 02 — the next slide pushes in from the left, its content trailing behind
        name: 'push-left', front: 'b', intro: 0.3,
        build: (tl, a, b) => tl
          .fromTo(b.card, { xPercent: -104, rotate: -1.5, scale: 0.94 }, { xPercent: 0, rotate: 0, scale: 1, duration: 1.3, ease: IO }, 0)
          .fromTo(b.inner, { xPercent: -16 }, { xPercent: 0, duration: 1.3, ease: IO }, 0)
          .fromTo(a.card, { xPercent: 0, scale: 1 }, { xPercent: 26, scale: 0.88, duration: 1.3, ease: IO }, 0)
          .fromTo(a.shade, { opacity: 0 }, { opacity: 0.75, duration: 1.3, ease: 'power2.inOut' }, 0),
      },
      { // 02 → 03 — the camera flies through the screen into the next room
        name: 'fly-through', front: 'a', intro: 0.55,
        build: (tl, a, b) => tl
          .fromTo(a.card, { scale: 1, opacity: 1 }, { scale: 1.55, opacity: 0, duration: 0.9, ease: 'power3.in' }, 0)
          .fromTo(b.card, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 1.05, ease: 'expo.out' }, 0.4)
          .fromTo(b.shade, { opacity: 0.7 }, { opacity: 0, duration: 1.05, ease: 'power2.out' }, 0.4),
      },
      { // 03 → 04 — an iris opens from the centre of the screen
        name: 'iris', front: 'b', intro: 0.35,
        build: (tl, a, b) => tl
          .fromTo(b.card, { clipPath: 'circle(0% at 50% 55%)' }, { clipPath: 'circle(80% at 50% 55%)', duration: 1.4, ease: IO }, 0)
          .fromTo(b.inner, { scale: 1.18 }, { scale: 1, duration: 1.25, ease: 'expo.out' }, 0.15)
          .fromTo(a.card, { scale: 1 }, { scale: 0.9, duration: 1.4, ease: IO }, 0)
          .fromTo(a.shade, { opacity: 0 }, { opacity: 0.7, duration: 1.4 }, 0),
      },
      { // 04 → 05 — a window opens onto the valley and the camera pulls back
        name: 'window', front: 'b', intro: 0.65,
        build: (tl, a, b) => tl
          .fromTo(b.card, { clipPath: 'inset(36% 33% 36% 33% round 28px)' }, { clipPath: 'inset(0% 0% 0% 0% round 28px)', duration: 1.45, ease: IO }, 0)
          .fromTo(b.bg, { scale: 1.9 }, { scale: 1, duration: 1.5, ease: 'expo.inOut' }, 0)
          .fromTo(b.inner, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: 'expo.out' }, 0.7)
          .fromTo(a.card, { scale: 1, yPercent: 0 }, { scale: 0.84, yPercent: -4, duration: 1.45, ease: IO }, 0)
          .fromTo(a.shade, { opacity: 0 }, { opacity: 0.8, duration: 1.45 }, 0),
      },
      { // 05 → 06 — the next slide flips up in 3D, the current one tips back
        name: 'flip-up', front: 'b', intro: 0.55,
        build: (tl, a, b) => tl
          .fromTo(b.card,
            { yPercent: 105, rotateX: -50, transformOrigin: '50% 100%', transformPerspective: 1800 },
            { yPercent: 0, rotateX: 0, transformOrigin: '50% 100%', transformPerspective: 1800, duration: 1.4, ease: IO }, 0)
          .fromTo(a.card,
            { yPercent: 0, rotateX: 0, scale: 1, transformOrigin: '50% 0%', transformPerspective: 1800 },
            { yPercent: -10, rotateX: 22, scale: 0.86, transformOrigin: '50% 0%', transformPerspective: 1800, duration: 1.4, ease: IO }, 0)
          .fromTo(a.shade, { opacity: 0 }, { opacity: 0.8, duration: 1.4 }, 0),
      },
      { // 06 → 07 — shutters close over the slide and open on the next one
        name: 'shutters', front: 'a', intro: 0.95,
        build: (tl, a, b) => tl
          .set(shutter, { autoAlpha: 1 }, 0)
          .fromTo(blades, { scaleY: 0, transformOrigin: '50% 100%' }, { scaleY: 1, transformOrigin: '50% 100%', duration: 0.5, stagger: 0.045, ease: 'power3.in' }, 0)
          .fromTo(a.card, { scale: 1 }, { scale: 0.94, duration: 0.78, ease: 'power2.in' }, 0)
          .set(a.card, { opacity: 0 }, 0.8)
          .fromTo(blades, { scaleY: 1, transformOrigin: '50% 0%' }, { scaleY: 0, transformOrigin: '50% 0%', duration: 0.55, stagger: 0.045, ease: 'power3.out', immediateRender: false }, 0.84)
          .fromTo(b.card, { scale: 1.12 }, { scale: 1, duration: 0.95, ease: 'expo.out' }, 0.8)
          .set(shutter, { autoAlpha: 0 }, 1.66),
      },
      { // 07 → 08 — a slanted wipe sweeps across
        name: 'diagonal', front: 'b', intro: 0.35,
        build: (tl, a, b) => tl
          .fromTo(b.card,
            { clipPath: 'polygon(0% 0%, 0% 0%, -40% 100%, -40% 100%)' },
            { clipPath: 'polygon(0% 0%, 140% 0%, 100% 100%, -40% 100%)', duration: 1.35, ease: IO }, 0)
          .fromTo(b.inner, { xPercent: -12 }, { xPercent: 0, duration: 1.35, ease: IO }, 0)
          .fromTo(a.card, { xPercent: 0 }, { xPercent: 14, duration: 1.35, ease: IO }, 0)
          .fromTo(a.shade, { opacity: 0 }, { opacity: 0.7, duration: 1.35 }, 0),
      },
      { // 08 → 09 — the next card is dealt in from the corner
        name: 'deal', front: 'b', intro: 0.5,
        build: (tl, a, b) => tl
          .fromTo(b.card,
            { xPercent: 75, yPercent: 55, rotate: 14, scale: 0.55, transformOrigin: '100% 100%' },
            { xPercent: 0, yPercent: 0, rotate: 0, scale: 1, transformOrigin: '100% 100%', duration: 1.45, ease: IO }, 0)
          .fromTo(a.card, { xPercent: 0, rotate: 0, scale: 1 }, { xPercent: -10, rotate: -3, scale: 0.88, duration: 1.45, ease: IO }, 0)
          .fromTo(a.shade, { opacity: 0 }, { opacity: 0.75, duration: 1.45 }, 0),
      },
      { // 09 → 10 — doors open and the camera flies into the house
        name: 'doors', front: 'b', intro: 0.45,
        build: (tl, a, b) => tl
          .fromTo(b.card, { clipPath: 'inset(0% 50% 0% 50%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.3, ease: IO }, 0)
          .fromTo(b.bg, { scale: 1.75 }, { scale: 1, duration: 1.35, ease: 'power3.out' }, 0)
          .fromTo(a.card, { scale: 1 }, { scale: 1.12, duration: 1.3, ease: IO }, 0)
          .fromTo(a.shade, { opacity: 0 }, { opacity: 0.85, duration: 1.3 }, 0),
      },
    ];

    // menu / pager jumps over several slides: a vertical curtain in the travel direction
    const JUMP = {
      name: 'jump', front: 'b', intro: 0.3,
      build: (tl, a, b, dir) => tl
        .fromTo(b.card,
          { clipPath: dir > 0 ? 'inset(100% 0% 0% 0% round 28px)' : 'inset(0% 0% 100% 0% round 28px)' },
          { clipPath: 'inset(0% 0% 0% 0% round 28px)', duration: 1.2, ease: IO }, 0)
        .fromTo(b.bg || b.inner, { scale: 1.3 }, { scale: 1, duration: 1.2, ease: 'power3.out' }, 0)
        .fromTo(a.card, { scale: 1, yPercent: 0 }, { scale: 0.9, yPercent: dir > 0 ? -6 : 6, duration: 1.2, ease: IO }, 0)
        .fromTo(a.shade, { opacity: 0 }, { opacity: 0.8, duration: 1.2 }, 0),
    };

    let busy = false;
    let running = null;
    let lockCall = null;
    let introCall = null;

    function layout(i) {
      S.forEach((o, k) => {
        o.el.classList.toggle('is-on', k === i);
        o.el.classList.toggle('is-near', Math.abs(k - i) === 1);
        o.el.inert = k !== i;
      });
    }

    function finishRunning() {
      if (!running) return;
      const r = running;
      running = null;
      r.tl.progress(r.reverse ? 0 : 1, true);
      r.done();
    }

    function go(to, { instant = false } = {}) {
      to = Math.max(0, Math.min(S.length - 1, to));
      if (to === current || busy) return;
      finishRunning();
      if (lockCall) lockCall.kill();
      if (introCall) introCall.kill();

      const from = current;
      current = to;
      setActive(to);
      updateHeader();
      const target = S[to];

      if (instant) {
        layout(to);
        prepareIntro(target.el);
        runIntro(target.el);
        return;
      }

      const adjacent = Math.abs(to - from) === 1;
      const reverse = adjacent && to < from;
      const k = Math.min(from, to);
      const fx = adjacent ? FX[k] : JUMP;
      const A = adjacent ? S[k] : S[from];
      const B = adjacent ? S[k + 1] : S[to];

      // only the two slides of this transition are rendered
      S.forEach((o) => {
        const on = o === A || o === B;
        o.el.classList.toggle('is-on', on);
        o.el.classList.remove('is-near');
        o.el.classList.toggle('is-moving', on);
        o.el.inert = true;
      });
      const front = fx.front === 'a' ? A : B;
      (front === A ? A : B).el.style.zIndex = 4;
      (front === A ? B : A).el.style.zIndex = 3;
      prepareIntro(target.el);

      const tl = gsap.timeline({ paused: true });
      fx.build(tl, A, B, to > from ? 1 : -1);
      busy = true;

      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        if (running && running.tl === tl) running = null;
        gsap.set([A.card, A.inner, A.shade, B.card, B.inner, B.shade, A.bg, B.bg, shutter, ...blades].filter(Boolean), { clearProps: 'all' });
        [A, B].forEach((o) => { o.el.style.zIndex = ''; o.el.classList.remove('is-moving'); });
        layout(current);
      };
      running = { tl, reverse, done };

      const speed = reverse ? 1.12 : 1;
      if (reverse) {
        tl.progress(1, true);
        tl.eventCallback('onReverseComplete', done);
        tl.timeScale(speed).reverse();
      } else {
        tl.eventCallback('onComplete', done);
        tl.play();
      }
      const total = tl.duration() / speed;
      // input opens again slightly before the film ends; a new move first snaps this one to its end
      lockCall = gsap.delayedCall(total * 0.9, () => { busy = false; });
      introCall = gsap.delayedCall(reverse ? total * 0.35 : (fx.intro ?? 0.5), () => runIntro(target.el));
    }
    goToSlide = (i) => go(i);

    /* ---------- input: wheel, touch, keyboard ---------- */
    let lastWheel = 0;
    let wheelAcc = 0;
    let gestureUsed = false;
    window.addEventListener('wheel', (e) => {
      if (modalOpen || menuOpen) return;
      if (e.target.closest && e.target.closest('[data-lenis-prevent]')) return;
      e.preventDefault();
      const now = performance.now();
      const gap = now - lastWheel;
      lastWheel = now;
      // a pause in the wheel stream means a new gesture; trackpad inertia never pauses
      if (gap > 220) { gestureUsed = false; wheelAcc = 0; }
      if (gestureUsed || busy) return;
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      if (Math.abs(e.deltaX) > Math.abs(dy)) return;
      wheelAcc += dy;
      if (Math.abs(wheelAcc) > 36) {
        gestureUsed = true;
        const dir = Math.sign(wheelAcc);
        wheelAcc = 0;
        go(current + dir);
      }
    }, { passive: false });

    let touchY = null;
    let touchX = null;
    window.addEventListener('touchstart', (e) => {
      touchY = e.touches[0].clientY;
      touchX = e.touches[0].clientX;
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (!modalOpen && !menuOpen && !e.target.closest('input[type="range"], [data-lenis-prevent]')) e.preventDefault();
    }, { passive: false });
    window.addEventListener('touchend', (e) => {
      if (touchY === null || modalOpen || menuOpen) return;
      const dy = touchY - e.changedTouches[0].clientY;
      const dx = touchX - e.changedTouches[0].clientX;
      touchY = null;
      if (Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx)) go(current + Math.sign(dy));
    }, { passive: true });

    window.addEventListener('keydown', (e) => {
      if (modalOpen || menuOpen || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.target.closest('input, textarea, select, [contenteditable]')) return;
      const onControl = e.target.closest('button, a');
      const map = { ArrowDown: 1, PageDown: 1, ArrowRight: 1, ArrowUp: -1, PageUp: -1, ArrowLeft: -1 };
      if (!onControl) { map[' '] = e.shiftKey ? -1 : 1; }
      if (e.key === 'Home') { e.preventDefault(); go(0); return; }
      if (e.key === 'End') { e.preventDefault(); go(S.length - 1); return; }
      const dir = map[e.key];
      if (!dir || (onControl && e.target.closest('[role="tab"]'))) return;
      e.preventDefault();
      go(current + dir);
    });

    /* ---------- start ---------- */
    const start = Math.max(0, slideIndexOf(location.hash));
    current = start;
    layout(start);
    setActive(start);
    updateHeader();
    return start;
  }

  /* ==========================================================================
     FLOW ENGINE (phones, tablets, short screens)
     ========================================================================== */
  const scrollPos = () => (lenis ? lenis.scroll : window.scrollY);
  const slideTop = (s) => Math.round(s.getBoundingClientRect().top + scrollPos());
  function scrollToY(y) {
    if (lenis) lenis.scrollTo(y, { duration: 1.4, easing: easeInOutQuart, force: true });
    else window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
  }

  function initFlow() {
    goToSlide = (i) => scrollToY(slideTop(slides[i]));

    if (motion && finePointer && window.Lenis) {
      lenis = new Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 0.95 });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
      lenis.stop();
    }

    if (hasGsap) {
      slides.forEach((s, i) => ScrollTrigger.create({
        trigger: s, start: 'top 55%', end: 'bottom 55%',
        onToggle: (self) => { if (self.isActive) { current = i; setActive(i); } },
      }));
      ScrollTrigger.create({ start: () => window.innerHeight * 0.35, end: 'max', onToggle: updateHeader });
    } else {
      window.addEventListener('scroll', updateHeader, { passive: true });
    }
    if (!motion) return;

    // each card enters in its own way as it scrolls in — transforms only,
    // and none of them makes the card wider than the screen
    const entries = [
      { scale: 0.86, transformOrigin: '50% 0%' },
      { rotateX: 18, transformPerspective: 1100, transformOrigin: '50% 100%' },
      { skewY: 5, transformOrigin: '0% 0%' },
      { yPercent: 14, scale: 0.9, transformOrigin: '50% 100%' },
    ];
    slides.forEach((s, i) => {
      if (i === 0) return;
      const card = $('.card', s);
      gsap.fromTo(card,
        { yPercent: 6, scale: 0.95, ...entries[i % entries.length] },
        { yPercent: 0, rotateX: 0, skewY: 0, scale: 1, ease: 'none',
          scrollTrigger: { trigger: s, start: 'top bottom', end: 'top 45%', scrub: true } });
      const bg = $('.card__bg img', s);
      if (bg) {
        gsap.fromTo(bg, { yPercent: -6 }, { yPercent: 6, ease: 'none',
          scrollTrigger: { trigger: s, start: 'top bottom', end: 'bottom top', scrub: true } });
      }
    });
    const drift = (sel, from, to) => {
      const el = $(sel);
      if (!el) return;
      gsap.fromTo(el, { xPercent: from }, { xPercent: to, ease: 'none',
        scrollTrigger: { trigger: el.closest('.slide'), start: 'top bottom', end: 'bottom top', scrub: true } });
    };
    drift('.nature__word span', 6, -10);
    drift('.docs__word span', 8, -8);
  }

  /* Flow-mode reveals: each element once, when it scrolls in — or, for things
     at the very bottom of a slide, when the slide reaches the top. */
  function initFlowReveals() {
    const revealed = new WeakSet();
    const pending = [];
    const notHero = (el) => !el.closest('.slide--hero');
    const onEnter = (el, fn, start = 'top 88%') => {
      const run = () => { if (revealed.has(el)) return; revealed.add(el); fn(); };
      pending.push([el, run]);
      ScrollTrigger.create({ trigger: el, start, once: true, onEnter: run });
    };
    const showReveal = (els) => {
      const fresh = els.filter((e) => !revealed.has(e));
      if (!fresh.length) return;
      fresh.forEach((e) => revealed.add(e));
      gsap.to(fresh, { autoAlpha: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.08, overwrite: true, clearProps: 'transform' });
    };
    $$('[data-split]').filter(notHero).forEach((el) => onEnter(el, () => {
      gsap.to($$('.wi', el), { yPercent: 0, duration: 1.2, ease: 'expo.out', stagger: 0.025 });
    }));
    ScrollTrigger.batch($$('[data-reveal]').filter(notHero), { start: 'top 92%', once: true, onEnter: showReveal });
    $$('[data-clip]').filter(notHero).forEach((el) => onEnter(el, () => {
      gsap.to(el, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.5, ease: 'expo.inOut' });
      const imgs = $$(CLIP_IMG, el);
      if (imgs.length) gsap.to(imgs, { scale: 1, duration: 2.2, ease: 'expo.out', delay: 0.15, clearProps: 'transform' });
    }, 'top 92%'));
    $$('[data-count]').filter(notHero).forEach((el) => onEnter(el, () => countUp(el, 0.2), 'top 95%'));
    $$('[data-progress]').filter(notHero).forEach((el) => onEnter(el, () => {
      gsap.to(el, { scaleX: el.dataset.progress / 100, duration: 1.8, ease: 'expo.inOut', delay: 0.3 });
    }, 'top 95%'));
    const draw = $('.steps__draw');
    if (draw) onEnter($('.steps'), () => gsap.to(draw, { strokeDashoffset: 0, duration: 2.4, ease: 'power2.inOut', delay: 0.2 }), 'top 75%');
    slides.filter(notHero).forEach((s) => ScrollTrigger.create({
      trigger: s, start: 'top 8%', once: true,
      onEnter: () => {
        showReveal($$('[data-reveal]', s));
        pending.forEach(([el, run]) => { if (s.contains(el)) run(); });
      },
    }));
  }

  /* ------------------------------------------------------------------------
     Images: load and decode everything after the first screen, in idle time,
     so no transition has to wait for a decode
     ------------------------------------------------------------------------ */
  function warmImages() {
    const imgs = $$('img').filter((im) => !im.closest('.slide--hero'));
    imgs.forEach((im) => { im.loading = 'eager'; });
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 50));
    let i = 0;
    const next = () => {
      if (i >= imgs.length) return;
      const im = imgs[i++];
      const p = im.decode ? im.decode().catch(() => {}) : Promise.resolve();
      p.then(() => idle(next));
    };
    idle(next);
  }

  /* ------------------------------------------------------------------------
     Preloader → first slide
     ------------------------------------------------------------------------ */
  function startPreloader(startIndex, onReady) {
    window.scrollTo(0, 0);
    const count = $('.preloader__count');
    const bar = $('.preloader__bar i');
    gsap.fromTo($$('.preloader__logo span'), { yPercent: 60, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.9, stagger: 0.035, ease: 'expo.out' });

    const first = slides[startIndex];
    const firstImg = $('img', first);
    const imgReady = !firstImg ? Promise.resolve() : new Promise((res) => {
      if (firstImg.complete && firstImg.naturalWidth) res();
      else { firstImg.addEventListener('load', res, { once: true }); firstImg.addEventListener('error', res, { once: true }); }
    }).then(() => (firstImg.decode ? firstImg.decode().catch(() => {}) : null));
    const ready = Promise.all([document.fonts ? document.fonts.ready : null, imgReady, new Promise((r) => setTimeout(r, 650))]);
    const timeout = new Promise((r) => setTimeout(r, 5000));

    const p = { v: 0 };
    const render = () => {
      count.textContent = Math.round(p.v);
      bar.style.transform = `scaleX(${p.v / 100})`;
    };
    const crawl = gsap.to(p, { v: 88, duration: 1.4, ease: 'power2.out', onUpdate: render });

    Promise.race([ready, timeout]).then(() => {
      crawl.kill();
      gsap.to(p, {
        v: 100, duration: 0.35, ease: 'power2.inOut', onUpdate: render,
        onComplete: () => {
          const bgImg = $('.card__bg img', first);
          gsap.timeline()
            .to('.preloader__inner', { autoAlpha: 0, y: -24, duration: 0.45, ease: 'power2.in' })
            .to(preloader, {
              clipPath: 'inset(0% 0% 100% 0%)', duration: 1.05, ease: 'expo.inOut',
              onComplete: () => { preloader.remove(); onReady(); },
            }, '-=0.1')
            .add(() => { if (bgImg) gsap.fromTo(bgImg, { scale: 1.28 }, { scale: 1, duration: 2.6, ease: 'expo.out', clearProps: 'transform' }); }, '-=0.75')
            .add(() => runIntro(first), '-=0.6')
            .to([header, '.pager'], { autoAlpha: 1, duration: 1, ease: 'power2.out' }, '-=0.3');
        },
      });
    });
  }

  /* ------------------------------------------------------------------------
     Projects switcher
     ------------------------------------------------------------------------ */
  (() => {
    const items = $$('.plist__item');
    const imgs = $$('.pimg');
    const sides = $$('.pside__img');
    const info = $('.pinfo');
    const sideCount = $('.pside__count b');
    if (!items.length) return;
    let cur = 0;
    let swapT;
    function show(i) {
      if (i === cur) return;
      const prev = cur;
      cur = i;
      items.forEach((b, k) => {
        b.classList.toggle('is-active', k === i);
        b.setAttribute('aria-selected', k === i ? 'true' : 'false');
      });
      imgs.forEach((img, k) => img.classList.toggle('was-active', k === prev));
      imgs.forEach((img, k) => img.classList.toggle('is-active', k === i));
      setTimeout(() => { if (cur === i) imgs[prev].classList.remove('was-active'); }, 1300);
      sides.forEach((img, k) => img.classList.toggle('is-active', k === i));
      sideCount.textContent = pad(i + 1);

      const d = items[i].dataset;
      info.classList.add('is-swapping');
      clearTimeout(swapT);
      swapT = setTimeout(() => {
        $('.pinfo__name', info).textContent = d.name;
        $('.pinfo__price', info).textContent = d.price;
        ['beds', 'area', 'plot', 'term'].forEach((f) => { $(`[data-f="${f}"]`, info).textContent = d[f]; });
        info.classList.remove('is-swapping');
      }, 320);
    }
    items.forEach((b, k) => {
      b.addEventListener('click', () => show(k));
      if (finePointer) b.addEventListener('mouseenter', () => show(k));
    });
    // keyboard arrows within the tablist
    $('.plist').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const n = (cur + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      show(n);
      items[n].focus();
    });
    // the "Получить планировку" button inherits the current project's name
    const planBtn = $('.pinfo [data-modal-open]');
    if (planBtn) planBtn.addEventListener('click', () => { planBtn.dataset.modalSubject = `Планировка ${items[cur].dataset.name}`; }, true);
  })();

  /* ------------------------------------------------------------------------
     Investment benefits switcher
     ------------------------------------------------------------------------ */
  (() => {
    const btns = $$('.ibtn');
    const imgs = $$('.iimg');
    const texts = $$('.invest__desc li');
    const idx = $('.invest__idx b');
    if (!btns.length) return;
    let cur = 0;
    function show(i) {
      if (i === cur) return;
      cur = i;
      btns.forEach((b, k) => { b.classList.toggle('is-active', k === i); b.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
      imgs.forEach((im, k) => im.classList.toggle('is-active', k === i));
      texts.forEach((t, k) => t.classList.toggle('is-active', k === i));
      idx.textContent = pad(i + 1);
    }
    btns.forEach((b, k) => {
      b.addEventListener('click', () => show(k));
      if (finePointer) b.addEventListener('mouseenter', () => show(k));
    });
  })();

  /* ------------------------------------------------------------------------
     Mortgage calculator
     ------------------------------------------------------------------------ */
  (() => {
    const form = $('.calc__form');
    if (!form) return;
    const inp = { price: $('#r-price'), down: $('#r-down'), years: $('#r-years'), rate: $('#r-rate') };
    const outV = (k) => $(`[data-v="${k}"]`, form);
    const out = (k) => $(`[data-out="${k}"]`);
    const rub = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
    const dec1 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const mln = (v) => `${dec1.format(v / 1e6)} млн ₽`;
    const plural = (n, a, b, c) => {
      const m10 = n % 10; const m100 = n % 100;
      if (m10 === 1 && m100 !== 11) return a;
      if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return b;
      return c;
    };
    const chips = $$('.chips--rate button');
    const shown = { pay: 0 };
    let payTween = null;

    function fill(el) {
      const p = ((el.value - el.min) / (el.max - el.min)) * 100;
      el.style.setProperty('--fill', `${p}%`);
    }
    function calc(animate = true) {
      Object.values(inp).forEach(fill);
      const price = parseFloat(inp.price.value) * 1e6;
      const downPct = parseFloat(inp.down.value);
      const years = parseInt(inp.years.value, 10);
      const rate = parseFloat(inp.rate.value);
      const down = price * downPct / 100;
      const loan = price - down;
      const n = years * 12;
      const r = rate / 1200;
      const pay = r ? loan * r / (1 - Math.pow(1 + r, -n)) : loan / n;
      const over = pay * n - loan;

      outV('price').textContent = mln(price);
      outV('down').textContent = `${downPct}% · ${mln(down)}`;
      outV('years').textContent = `${years} ${plural(years, 'год', 'года', 'лет')}`;
      outV('rate').textContent = `${dec1.format(rate)}%`;
      out('loan').textContent = mln(loan);
      out('down').textContent = mln(down);
      out('over').textContent = mln(over);
      out('income').textContent = `от ${rub.format(Math.ceil(pay / 0.5 / 1000) * 1000)} ₽`;
      chips.forEach((c) => c.classList.toggle('is-active', Math.abs(parseFloat(c.dataset.rate) - rate) < 0.05));

      const payEl = out('pay');
      const write = () => { payEl.textContent = `${rub.format(Math.round(shown.pay))} ₽`; };
      if (payTween) payTween.kill();
      if (animate && hasGsap && !reduce) {
        payTween = gsap.to(shown, { pay, duration: 0.7, ease: 'power3.out', onUpdate: write });
      } else {
        shown.pay = pay;
        write();
      }
    }
    Object.values(inp).forEach((el) => el.addEventListener('input', () => calc()));
    chips.forEach((c) => c.addEventListener('click', () => { inp.rate.value = c.dataset.rate; calc(); }));
    calc(false);
  })();

  /* ------------------------------------------------------------------------
     Menu
     ------------------------------------------------------------------------ */
  const burger = $('.burger');
  const menu = $('#menu');
  function toggleMenu(force) {
    menuOpen = typeof force === 'boolean' ? force : !menuOpen;
    root.classList.toggle('menu-open', menuOpen);
    burger.setAttribute('aria-expanded', String(menuOpen));
    burger.setAttribute('aria-label', menuOpen ? 'Закрыть меню' : 'Открыть меню');
    menu.setAttribute('aria-hidden', String(!menuOpen));
    updateHeader();
    if (lenis) (menuOpen ? lenis.stop() : lenis.start());
  }
  burger.addEventListener('click', () => toggleMenu());

  /* ------------------------------------------------------------------------
     Modal + form
     ------------------------------------------------------------------------ */
  const modal = $('#modal');
  const form = $('.form', modal);
  const fe = form.elements; // note: form.name would be the form's own attribute
  const success = $('.form__success', modal);
  const titleEl = $('#modal-title');
  const defaultTitle = titleEl.textContent;
  let lastFocus = null;

  function openModal(trigger) {
    lastFocus = document.activeElement;
    titleEl.textContent = (trigger && trigger.dataset.modalTitle) || defaultTitle;
    fe.subject.value = (trigger && (trigger.dataset.modalSubject || trigger.dataset.modalTitle)) || 'Запись на просмотр';
    form.hidden = false;
    success.hidden = true;
    modalOpen = true;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    if (menuOpen) toggleMenu(false);
    if (lenis) lenis.stop();
    setTimeout(() => fe.name.focus({ preventScroll: true }), 350);
  }
  function closeModal() {
    modalOpen = false;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    if (lenis) lenis.start();
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  $$('[data-modal-open]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); openModal(b); }));
  $$('[data-modal-close]', modal).forEach((b) => b.addEventListener('click', closeModal));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (modalOpen) closeModal();
      else if (menuOpen) toggleMenu(false);
    }
    if (e.key === 'Tab' && modalOpen) {
      const f = $$('button, input, textarea, a[href]', modal).filter((el) => el.offsetParent !== null && !el.disabled);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // phone mask: +7 (999) 999-99-99
  const phone = fe.phone;
  phone.addEventListener('input', (e) => {
    if (e.inputType && e.inputType.startsWith('delete')) return;
    let raw = phone.value;
    const k = raw.indexOf('+7');
    if (k > 0) raw = `+7${raw.slice(0, k)}${raw.slice(k + 2)}`; // typed before the prefix
    let d = raw.replace(/\D/g, '');
    if (!d) { phone.value = ''; return; }
    if (d[0] === '8') d = `7${d.slice(1)}`;
    if (d[0] !== '7') d = `7${d}`;
    d = d.slice(0, 11);
    let v = '+7';
    if (d.length > 1) v += ` (${d.slice(1, 4)}`;
    if (d.length >= 4) v += `) ${d.slice(4, 7)}`;
    if (d.length >= 7) v += `-${d.slice(7, 9)}`;
    if (d.length >= 9) v += `-${d.slice(9, 11)}`;
    phone.value = v;
  });
  phone.addEventListener('focus', () => {
    if (phone.value) return;
    phone.value = '+7 ';
    requestAnimationFrame(() => phone.setSelectionRange(phone.value.length, phone.value.length));
  });
  phone.addEventListener('blur', () => { if (phone.value.replace(/\D/g, '').length <= 1) phone.value = ''; });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const nameOk = fe.name.value.trim().length >= 2;
    const phoneOk = fe.phone.value.replace(/\D/g, '').length === 11;
    fe.name.closest('.field').classList.toggle('is-error', !nameOk);
    fe.phone.closest('.field').classList.toggle('is-error', !phoneOk);
    if (!nameOk) { fe.name.focus(); return; }
    if (!phoneOk) { fe.phone.focus(); return; }
    if (!fe.agree.checked) { fe.agree.focus(); return; }

    const data = Object.fromEntries(new FormData(form).entries());
    // Hook for a real backend (CRM / Telegram bot / email): set window.ALTAI_FORM_ENDPOINT
    if (window.ALTAI_FORM_ENDPOINT) {
      fetch(window.ALTAI_FORM_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).catch(() => {});
    }
    form.hidden = true;
    success.hidden = false;
    form.reset();
    $('button', success).focus({ preventScroll: true });
  });
  $$('.field input', form).forEach((i) => i.addEventListener('input', () => i.closest('.field').classList.remove('is-error')));

  /* ------------------------------------------------------------------------
     Cursor + magnetic buttons (fine pointers only)
     ------------------------------------------------------------------------ */
  if (finePointer && motion) {
    root.classList.add('has-cursor');
    const cur = $('.cursor');
    const label = $('.cursor__label', cur);
    const xTo = gsap.quickTo(cur, 'x', { duration: 0.5, ease: 'power3' });
    const yTo = gsap.quickTo(cur, 'y', { duration: 0.5, ease: 'power3' });
    window.addEventListener('pointermove', (e) => { xTo(e.clientX); yTo(e.clientY); cur.classList.add('is-visible'); }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => cur.classList.remove('is-visible'));
    window.addEventListener('pointerdown', () => cur.classList.add('is-down'));
    window.addEventListener('pointerup', () => cur.classList.remove('is-down'));
    document.addEventListener('pointerover', (e) => {
      const lab = e.target.closest('[data-cursor]');
      const hov = e.target.closest('a, button, label, input[type="range"]');
      const text = !hov && lab ? lab.dataset.cursor : '';
      cur.classList.toggle('is-label', Boolean(text));
      cur.classList.toggle('is-hover', Boolean(hov));
      if (text) label.textContent = text;
    });

    $$('[data-magnetic]').forEach((el) => {
      const mx = gsap.quickTo(el, 'x', { duration: 0.7, ease: 'power3' });
      const my = gsap.quickTo(el, 'y', { duration: 0.7, ease: 'power3' });
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        mx((e.clientX - r.left - r.width / 2) * 0.22);
        my((e.clientY - r.top - r.height / 2) * 0.35);
      });
      el.addEventListener('pointerleave', () => { mx(0); my(0); });
    });
  }

  /* ------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------ */
  if (motion) {
    gsap.set([header, '.pager'], { autoAlpha: 0 });
    let startIndex = 0;
    if (stage) {
      startIndex = initStage();
      prepareIntro(slides[startIndex]);
    } else {
      initFlow();
      slides.forEach(prepareIntro);
    }
    startPreloader(startIndex, () => {
      if (stage) {
        warmImages();
        return;
      }
      if (lenis) lenis.start();
      initFlowReveals();
      ScrollTrigger.refresh();
      const i = slideIndexOf(location.hash);
      if (i > 0) setTimeout(() => scrollToY(slideTop(slides[i])), 300);
    });
    window.addEventListener('load', () => { if (!stage) ScrollTrigger.refresh(); });
  } else {
    if (preloader) preloader.remove();
    if (hasGsap) initFlow();
  }
})();
