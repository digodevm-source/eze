/* ==========================================================================
   Altai Ridge — interactions
   Smooth scroll (Lenis) + stacked slide transitions (GSAP ScrollTrigger)
   ========================================================================== */
(() => {
  'use strict';

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const root = document.documentElement;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const STACK_MQ = '(min-width: 1024px) and (min-height: 620px)';
  const hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  const motion = hasGsap && !reduce;

  const slides = $$('.slide');
  const header = $('#header');
  const easeInOutQuart = (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);
  const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

  let lenis = null;
  let isStack = false;
  let modalOpen = false;
  let menuOpen = false;

  if (hasGsap) gsap.registerPlugin(ScrollTrigger);
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

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
     Smooth scroll
     ------------------------------------------------------------------------ */
  if (motion && window.Lenis) {
    lenis = new Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.9, touchMultiplier: 1.4 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
  }
  const scrollY = () => (lenis ? lenis.scroll : window.scrollY);
  function scrollToY(y, duration = 1.4) {
    if (lenis) {
      snap.busy = true;
      lenis.scrollTo(y, { duration, easing: easeInOutQuart, force: true, onComplete: () => { snap.busy = false; } });
    } else {
      window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
    }
  }
  /* Document position of a slide that ignores pinning (pin-spacer keeps the natural flow) */
  function slideTop(slide) {
    const box = slide.parentElement && slide.parentElement.classList.contains('pin-spacer') ? slide.parentElement : slide;
    return Math.round(box.getBoundingClientRect().top + scrollY());
  }

  /* ------------------------------------------------------------------------
     Initial (hidden) states — set before the preloader lifts
     ------------------------------------------------------------------------ */
  const notHero = (el) => !el.closest('.slide--hero');
  const CLIP_IMG = '[data-clip] > img:not(.pimg):not(.pside__img)';
  if (motion) {
    gsap.set('.wi', { yPercent: 110 });
    gsap.set('.ch', { yPercent: 115 });
    gsap.set('[data-reveal]', { autoAlpha: 0, y: 36 });
    gsap.set('[data-clip]', { clipPath: 'inset(100% 0% 0% 0%)' });
    gsap.set(CLIP_IMG, { scale: 1.25 });
    gsap.set('[data-progress]', { scaleX: 0 });
    gsap.set('.steps__draw', { strokeDashoffset: 1 });
    gsap.set(['.hero__meta li', '.status', '.hero__facts li', '.hero__text', '.hero__cta', '.scroll-hint'], { autoAlpha: 0, y: 26 });
    gsap.set([header, '.pager'], { autoAlpha: 0 });
    $$('[data-count]').forEach((el) => { el.textContent = '0'; });
  }

  /* ------------------------------------------------------------------------
     Scroll-triggered reveals (work in both stacked and flow layouts)
     ------------------------------------------------------------------------ */
  /* Each reveal runs once: either when its element scrolls in, or — for things
     sitting at the very bottom of a slide — when the slide itself lands on screen. */
  const revealed = new WeakSet();
  const pendingReveals = [];
  function onEnter(el, fn, start = 'top 88%') {
    const run = () => {
      if (revealed.has(el)) return;
      revealed.add(el);
      fn();
    };
    pendingReveals.push([el, run]);
    ScrollTrigger.create({ trigger: el, start, once: true, onEnter: run });
  }
  function showReveal(els) {
    const fresh = els.filter((e) => !revealed.has(e));
    if (!fresh.length) return;
    fresh.forEach((e) => revealed.add(e));
    gsap.to(fresh, { autoAlpha: 1, y: 0, duration: 1.2, ease: 'expo.out', stagger: 0.09, overwrite: true, clearProps: 'transform' });
  }
  function countUp(el, delay = 0) {
    const end = parseFloat(el.dataset.count);
    const o = { v: 0 };
    gsap.to(o, { v: end, duration: 2.2, delay, ease: 'power3.out', onUpdate: () => { el.textContent = Math.round(o.v); } });
  }
  function initReveals() {
    $$('[data-split]').filter(notHero).forEach((el) => onEnter(el, () => {
      gsap.to($$('.wi', el), { yPercent: 0, duration: 1.3, ease: 'expo.out', stagger: 0.028 });
    }));
    ScrollTrigger.batch($$('[data-reveal]').filter(notHero), {
      start: 'top 92%',
      once: true,
      onEnter: showReveal,
    });
    slides.filter(notHero).forEach((s) => ScrollTrigger.create({
      trigger: s,
      start: 'top 8%',
      once: true,
      onEnter: () => {
        showReveal($$('[data-reveal]', s));
        pendingReveals.forEach(([el, run]) => { if (s.contains(el)) run(); });
      },
    }));
    $$('[data-clip]').filter(notHero).forEach((el) => onEnter(el, () => {
      gsap.to(el, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.6, ease: 'expo.inOut' });
      const imgs = $$(':scope > img:not(.pimg):not(.pside__img)', el);
      if (imgs.length) gsap.to(imgs, { scale: 1, duration: 2.4, ease: 'expo.out', delay: 0.15, clearProps: 'transform' });
    }, 'top 92%'));
    $$('[data-count]').filter(notHero).forEach((el) => onEnter(el, () => countUp(el, 0.2), 'top 95%'));
    $$('[data-progress]').filter(notHero).forEach((el) => onEnter(el, () => {
      gsap.to(el, { scaleX: el.dataset.progress / 100, duration: 2, ease: 'expo.inOut', delay: 0.3 });
    }, 'top 95%'));
    const draw = $('.steps__draw');
    if (draw) onEnter($('.steps'), () => gsap.to(draw, { strokeDashoffset: 0, duration: 2.6, ease: 'power2.inOut', delay: 0.2 }), 'top 75%');

    /* Big outline words drift horizontally while their slide is on screen */
    const drift = (sel, from, to) => {
      const el = $(sel);
      if (!el) return;
      gsap.fromTo(el, { xPercent: from }, {
        xPercent: to, ease: 'none',
        scrollTrigger: { trigger: el.closest('.slide'), start: 'top bottom', end: 'bottom top', scrub: 0.6 },
      });
    };
    drift('.nature__word span', 6, -10);
    drift('.docs__word span', 8, -8);
    const docsWord = $('.docs__word span');
    if (docsWord) {
      gsap.fromTo(docsWord, { backgroundPosition: '100% 0' }, {
        backgroundPosition: '-100% 0', ease: 'none',
        scrollTrigger: { trigger: docsWord.closest('.slide'), start: 'top bottom', end: 'bottom top', scrub: 0.6 },
      });
    }
  }

  /* ------------------------------------------------------------------------
     Stacked slides — each card is pinned while the next one slides over it,
     receding into depth. Desktop only; mobile keeps a natural flow.
     ------------------------------------------------------------------------ */
  const snap = { busy: false, timer: 0, dir: 1 };

  function snapPoints() {
    const vh = window.innerHeight;
    const pts = [];
    slides.forEach((s) => {
      const top = slideTop(s);
      pts.push(top);
      const extra = s.offsetHeight - vh;
      if (extra > 4) pts.push(top + extra);
    });
    pts.push(Math.round(ScrollTrigger.maxScroll(window)));
    return [...new Set(pts)].sort((a, b) => a - b);
  }

  function trySnap() {
    if (!isStack || !lenis || snap.busy || modalOpen || menuOpen) return;
    const y = lenis.scroll;
    const vh = window.innerHeight;
    const pts = snapPoints();
    let prev = null;
    let next = null;
    for (const p of pts) {
      if (p <= y + 1) prev = p;
      if (p >= y - 1 && next === null) next = p;
    }
    if (prev === null || next === null) return;
    if (Math.abs(y - prev) < 2 || Math.abs(next - y) < 2) return;
    const gap = next - prev;
    let target = null;
    if (gap <= vh * 1.15) {
      const progress = (y - prev) / gap;
      target = snap.dir > 0 ? (progress > 0.1 ? next : prev) : (progress < 0.9 ? prev : next);
    } else if (y - prev < vh * 0.22) {
      target = prev;
    } else if (next - y < vh * 0.22) {
      target = next;
    }
    if (target !== null) scrollToY(target, 1.15);
  }

  function stepSlide(dir) {
    const pts = snapPoints();
    const y = lenis ? lenis.targetScroll : window.scrollY;
    const target = dir > 0 ? pts.find((p) => p > y + 4) : [...pts].reverse().find((p) => p < y - 4);
    if (target !== undefined) scrollToY(target, 1.25);
  }

  function initStack() {
    const mm = gsap.matchMedia();
    mm.add(STACK_MQ, () => {
      isStack = true;
      root.classList.add('is-stack');

      slides.forEach((slide, i) => {
        const card = $('.card', slide);
        const bg = $('.card__bg', slide);
        const bgImg = bg && $('img', bg);
        const next = slides[i + 1];

        // incoming parallax: the background lags behind the card as it rises
        if (i > 0 && bgImg) {
          gsap.fromTo(bgImg, { yPercent: -9 }, {
            yPercent: 0, ease: 'none',
            scrollTrigger: { trigger: slide, start: 'top bottom', end: 'top top', scrub: true },
          });
        }
        if (!next) return;

        ScrollTrigger.create({
          trigger: slide,
          start: () => (slide.offsetHeight > window.innerHeight + 2 ? 'bottom bottom' : 'top top'),
          endTrigger: next,
          end: 'top top',
          pin: true,
          pinSpacing: false,
        });

        // outgoing: card recedes, dims and its photo drifts
        const out = { trigger: next, start: 'top bottom', end: 'top top', scrub: true };
        gsap.fromTo(card, { scale: 1, '--dim': 0 }, { scale: 0.9, '--dim': 0.72, ease: 'none', immediateRender: false, scrollTrigger: out });
        if (bg) gsap.fromTo(bg, { yPercent: 0 }, { yPercent: 7, ease: 'none', immediateRender: false, scrollTrigger: { ...out } });
      });

      const onWheel = () => { snap.busy = false; };
      window.addEventListener('wheel', onWheel, { passive: true });
      window.addEventListener('touchstart', onWheel, { passive: true });

      return () => {
        isStack = false;
        root.classList.remove('is-stack');
        window.removeEventListener('wheel', onWheel);
        window.removeEventListener('touchstart', onWheel);
      };
    });
  }

  /* ------------------------------------------------------------------------
     Pager (slide counter + dots) and header state
     ------------------------------------------------------------------------ */
  const pagerCur = $('.pager__cur');
  const pagerDots = $('.pager__dots');
  const navLinks = $$('.nav a');
  const pad = (n) => String(n).padStart(2, '0');
  $('.pager__total').textContent = pad(slides.length);
  const dots = slides.map((s, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', `${pad(i + 1)} — ${s.dataset.title}`);
    b.innerHTML = `<span>${s.dataset.title}</span>`;
    b.addEventListener('click', () => scrollToY(slideTop(s), 1.6));
    li.appendChild(b);
    pagerDots.appendChild(li);
    return b;
  });
  let current = -1;
  function setActive(i) {
    if (i === current) return;
    current = i;
    dots.forEach((d, k) => d.classList.toggle('is-active', k === i));
    const id = slides[i].id;
    navLinks.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${id}`));
    if (hasGsap && !reduce && pagerCur.textContent !== pad(i + 1)) {
      gsap.timeline()
        .to(pagerCur, { yPercent: -60, autoAlpha: 0, duration: 0.22, ease: 'power2.in' })
        .add(() => { pagerCur.textContent = pad(i + 1); })
        .fromTo(pagerCur, { yPercent: 60, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.45, ease: 'expo.out' });
    } else {
      pagerCur.textContent = pad(i + 1);
    }
  }
  setActive(0);

  if (hasGsap) {
    slides.forEach((s, i) => ScrollTrigger.create({
      trigger: s, start: 'top 55%', end: 'bottom 55%',
      onToggle: (self) => { if (self.isActive) setActive(i); },
    }));
    ScrollTrigger.create({
      start: () => window.innerHeight * 0.35, end: 'max',
      onToggle: (self) => header.classList.toggle('is-solid', self.isActive),
    });
  } else {
    window.addEventListener('scroll', () => header.classList.toggle('is-solid', window.scrollY > window.innerHeight * 0.35), { passive: true });
  }

  /* ------------------------------------------------------------------------
     Anchors, keyboard navigation, idle snapping
     ------------------------------------------------------------------------ */
  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const hash = a.getAttribute('href');
    if (hash.length < 2) return;
    const target = document.querySelector(hash);
    if (!target) return;
    e.preventDefault();
    if (menuOpen) toggleMenu(false);
    const slide = target.closest('.slide') || target;
    scrollToY(slideTop(slide), 1.6);
  }));

  window.addEventListener('keydown', (e) => {
    if (!isStack || modalOpen || menuOpen || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest('input, textarea, select, button, a, [contenteditable]')) return;
    const map = { ArrowDown: 1, PageDown: 1, ArrowUp: -1, PageUp: -1, ' ': e.shiftKey ? -1 : 1 };
    if (e.key === 'Home') { e.preventDefault(); scrollToY(0, 1.6); return; }
    if (e.key === 'End') { e.preventDefault(); scrollToY(ScrollTrigger.maxScroll(window), 1.6); return; }
    const dir = map[e.key];
    if (!dir) return;
    e.preventDefault();
    snap.dir = dir;
    stepSlide(dir);
  });

  if (lenis) {
    lenis.on('scroll', (l) => {
      if (l.direction) snap.dir = l.direction;
      clearTimeout(snap.timer);
      if (!snap.busy) snap.timer = setTimeout(trySnap, 160);
    });
  }

  /* ------------------------------------------------------------------------
     Preloader + hero intro
     ------------------------------------------------------------------------ */
  const preloader = $('.preloader');
  function heroIntro() {
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    tl.fromTo('.slide--hero .card__bg img', { scale: 1.28 }, { scale: 1, duration: 2.8 }, 0)
      .to('.hero__title .ch', { yPercent: 0, duration: 1.6, stagger: 0.055 }, 0.15)
      .to(header, { autoAlpha: 1, duration: 1.2 }, 0.5)
      .to('.hero__meta li', { autoAlpha: 1, y: 0, duration: 1.2, stagger: 0.06 }, 0.55)
      .to('.hero__welcome .wi', { yPercent: 0, duration: 1.3, stagger: 0.05 }, 0.8)
      .to(['.hero__text', '.hero__cta', '.status', '.hero__facts li', '.scroll-hint'], { autoAlpha: 1, y: 0, duration: 1.2, stagger: 0.07 }, 0.95)
      .to('.slide--hero [data-progress]', { scaleX: 0.75, duration: 2, ease: 'expo.inOut' }, 1.1)
      .add(() => $$('.slide--hero [data-count]').forEach((el) => countUp(el)), 1.1)
      .to('.pager', { autoAlpha: 1, duration: 1 }, 1.2);
    return tl;
  }

  function finishLoading() {
    if (lenis) lenis.start();
    initReveals();
    ScrollTrigger.refresh();
    if (location.hash && document.querySelector(location.hash)) {
      const s = document.querySelector(location.hash).closest('.slide');
      if (s) setTimeout(() => scrollToY(slideTop(s), 1.6), 300);
    }
  }

  function startPreloader() {
    if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
    else window.scrollTo(0, 0);

    const count = $('.preloader__count');
    const bar = $('.preloader__bar i');
    const letters = $$('.preloader__logo span');
    gsap.fromTo(letters, { yPercent: 60, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 1, stagger: 0.04, ease: 'expo.out' });

    const heroImg = $('.slide--hero .card__bg img');
    const imgReady = new Promise((res) => {
      if (heroImg.complete && heroImg.naturalWidth) res();
      else { heroImg.addEventListener('load', res, { once: true }); heroImg.addEventListener('error', res, { once: true }); }
    }).then(() => (heroImg.decode ? heroImg.decode().catch(() => {}) : null));
    const ready = Promise.all([
      document.fonts ? document.fonts.ready : null,
      imgReady,
      new Promise((r) => setTimeout(r, 1100)),
    ]);
    const timeout = new Promise((r) => setTimeout(r, 6500));

    const p = { v: 0 };
    const render = () => {
      count.textContent = Math.round(p.v);
      bar.style.transform = `scaleX(${p.v / 100})`;
    };
    const crawl = gsap.to(p, { v: 86, duration: 2.4, ease: 'power2.out', onUpdate: render });

    Promise.race([ready, timeout]).then(() => {
      crawl.kill();
      gsap.to(p, {
        v: 100, duration: 0.55, ease: 'power2.inOut', onUpdate: render,
        onComplete: () => {
          const tl = gsap.timeline();
          tl.to('.preloader__inner', { autoAlpha: 0, y: -24, duration: 0.55, ease: 'power2.in' })
            .to(preloader, {
              clipPath: 'inset(0% 0% 100% 0%)', duration: 1.2, ease: 'expo.inOut',
              onComplete: () => { preloader.remove(); finishLoading(); },
            }, '-=0.15')
            .add(heroIntro(), '-=0.7');
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
    header.classList.toggle('is-solid', menuOpen || scrollY() > window.innerHeight * 0.35);
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
    initStack();
    startPreloader();
    window.addEventListener('load', () => ScrollTrigger.refresh());
  } else if (preloader) {
    preloader.remove();
  }
})();
