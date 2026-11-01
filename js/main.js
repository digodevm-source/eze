/* FORMLESS® — interface, smooth scrolling and choreography */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  /* ---------------- Smooth scroll ---------------- */
  var lenis = null;
  if (window.Lenis && !reduce) {
    lenis = new window.Lenis({
      lerp: 0.075,
      wheelMultiplier: 0.85,
      touchMultiplier: 1.4,
      smoothWheel: true
    });
  }
  var easeOutQuart = function (t) { return 1 - Math.pow(1 - t, 4); };

  function scrollToTarget(target) {
    if (lenis) {
      lenis.scrollTo(target, { duration: 2.0, easing: function (t) { return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2; } });
    } else {
      var y = typeof target === 'number' ? target : target.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
    }
  }

  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id === '#') { e.preventDefault(); return; }
      var target = id === '#top' ? 0 : $(id);
      if (target === null) return;
      e.preventDefault();
      scrollToTarget(target);
    });
  });

  /* ---------------- WebGL scene ---------------- */
  var canvas = $('#scene');
  var adaptive = !/[?&]quality=high/.test(window.location.search);
  var scene = window.FormlessScene ? window.FormlessScene.create(canvas, { reduce: reduce, adaptive: adaptive }) : null;
  if (!scene) {
    root.classList.add('no-webgl');
    if (canvas) canvas.style.display = 'none';
  }
  window.FORMLESS = { scene: scene, lenis: lenis };

  function remeasure() { if (scene) scene.measure(); measureSections(); }
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (scene) scene.resize();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(remeasure, 120);
  });
  if (window.ResizeObserver) {
    new ResizeObserver(function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(remeasure, 120); }).observe(document.body);
  }
  window.addEventListener('load', remeasure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);

  /* ---------------- Reveal on scroll ---------------- */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    $$('[data-reveal]').forEach(function (el) { io.observe(el); });
  } else {
    $$('[data-reveal]').forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ---------------- Hero card toggle ---------------- */
  var toggle = $('.hero__toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var card = toggle.closest('.hero__card');
      var open = !card.classList.contains('is-open');
      card.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* ---------------- Sections / progress ---------------- */
  var sections = $$('[data-section]');
  var sectionTops = [];
  var progressCurrent = $('.progress__current');
  var progressTotal = $('.progress__total');
  var progressFill = $('.progress__fill');
  if (progressTotal) progressTotal.textContent = String(sections.length).padStart(2, '0');
  function measureSections() {
    var y = window.scrollY;
    sectionTops = sections.map(function (s) { return s.getBoundingClientRect().top + y; });
  }
  measureSections();
  var lastIndex = -1;

  var nav = $('.nav');

  /* ---------------- Pointer, cursor & magnetic ---------------- */
  var pointer = { x: 0.5, y: 0.5, px: window.innerWidth / 2, py: window.innerHeight / 2 };
  var cursor = $('.cursor');
  var dot = $('.cursor__dot');
  var ring = $('.cursor__ring');
  var ringPos = { x: pointer.px, y: pointer.py };
  if (cursor) cursor.classList.add('is-hidden');
  window.addEventListener('pointermove', function (e) {
    pointer.px = e.clientX; pointer.py = e.clientY;
    pointer.x = e.clientX / window.innerWidth;
    pointer.y = e.clientY / window.innerHeight;
    if (cursor) cursor.classList.remove('is-hidden');
  }, { passive: true });
  document.addEventListener('mouseleave', function () { if (cursor) cursor.classList.add('is-hidden'); });

  if (finePointer && cursor) {
    $$('a, button, .card').forEach(function (el) {
      el.addEventListener('mouseenter', function () { cursor.classList.add('is-hover'); });
      el.addEventListener('mouseleave', function () { cursor.classList.remove('is-hover'); });
    });
  }

  if (finePointer && !reduce) {
    $$('.magnetic').forEach(function (el) {
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        var dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        el.style.transform = 'translate(' + (dx * 10).toFixed(2) + 'px,' + (dy * 8).toFixed(2) + 'px)';
      });
      el.addEventListener('mouseleave', function () { el.style.transform = ''; });
    });
  }

  /* ---------------- Work hover preview ---------------- */
  var preview = $('.work-preview');
  var previewPos = { x: pointer.px, y: pointer.py, on: false };
  if (preview && finePointer) {
    $$('.project').forEach(function (p) {
      p.addEventListener('mouseenter', function () {
        preview.setAttribute('data-variant', p.getAttribute('data-variant'));
        preview.classList.add('is-on');
        previewPos.on = true;
      });
      p.addEventListener('mouseleave', function () {
        preview.classList.remove('is-on');
        previewPos.on = false;
      });
    });
  }

  /* ---------------- Marquee ---------------- */
  var marquee = $('.marquee__track');
  var marqueeX = 0;
  var marqueeW = 0;
  if (marquee) {
    marquee.innerHTML += marquee.innerHTML; // seamless loop
    var measureMarquee = function () { marqueeW = marquee.scrollWidth / 2; };
    measureMarquee();
    window.addEventListener('resize', measureMarquee);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureMarquee);
  }

  /* ---------------- HUD specimens ---------------- */
  var specimens = $$('.specimen').map(function (el) {
    var off = (el.getAttribute('data-offset') || '0,0').split(',').map(parseFloat);
    return {
      el: el,
      box: $('.specimen__box', el),
      target: parseInt(el.getAttribute('data-target'), 10),
      ox: off[0], oy: off[1],
      line: $('.hud__line[data-line="' + el.getAttribute('data-specimen') + '"]'),
      x: 0, y: 0, init: false
    };
  });

  function updateHUD(scrollY, dt) {
    if (!scene) return;
    var vh = window.innerHeight;
    var heroFade = clamp(1 - scrollY / (vh * 0.45), 0, 1);
    specimens.forEach(function (s) {
      var info = scene.getScreen(s.target);
      if (!info) return;
      var span = info.span;
      var tx = info.x + s.ox * (span / 300) + (s.ox > 0 ? span * 0.12 : -span * 0.12);
      var ty = info.y + s.oy * (span / 300);
      var k = s.init ? 1 - Math.exp(-dt * 5) : 1;
      s.x += (tx - s.x) * k;
      s.y += (ty - s.y) * k;
      s.init = true;
      var visible = info.on ? heroFade : 0;
      s.el.style.opacity = visible.toFixed(3);
      s.el.style.transform = 'translate3d(' + s.x.toFixed(1) + 'px,' + s.y.toFixed(1) + 'px,0)';
      if (s.line && s.box) {
        // line from the creature's core to the nearest corner of the box
        var bw = s.box.offsetWidth, bh = s.box.offsetHeight;
        var bt = s.box.offsetTop;
        var cx = s.x + (info.x < s.x ? 0 : bw);
        var cy = s.y + bt + (info.y < s.y + bt ? 0 : bh);
        var mx = info.x + (cx - info.x) * 0.55;
        var my = info.y;
        s.line.setAttribute('points', info.x.toFixed(1) + ',' + info.y.toFixed(1) + ' ' + mx.toFixed(1) + ',' + my.toFixed(1) + ' ' + cx.toFixed(1) + ',' + cy.toFixed(1));
        s.line.style.opacity = (visible * 0.9).toFixed(3);
      }
    });
  }

  /* ---------------- Main loop ---------------- */
  var last = performance.now();
  var lastScrollY = window.scrollY;
  var scrollVel = 0;
  function frame(now) {
    var dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (lenis) lenis.raf(now);
    var y = window.scrollY;
    var v = dt > 0 ? (y - lastScrollY) / dt : 0;
    lastScrollY = y;
    scrollVel += (v - scrollVel) * (1 - Math.exp(-dt * 8));

    if (scene) scene.frame(now / 1000, y, pointer);
    updateHUD(y, dt);

    // header state
    if (nav) nav.classList.toggle('is-scrolled', y > 40);

    // progress
    var vh = window.innerHeight;
    var idx = 0;
    for (var i = 0; i < sectionTops.length; i++) if (y + vh * 0.5 >= sectionTops[i]) idx = i;
    if (idx !== lastIndex && progressCurrent) {
      progressCurrent.textContent = String(idx + 1).padStart(2, '0');
      lastIndex = idx;
    }
    if (progressFill) {
      var max = Math.max(1, document.documentElement.scrollHeight - vh);
      progressFill.style.transform = 'scaleY(' + clamp(y / max, 0, 1).toFixed(4) + ')';
    }

    // cursor
    if (finePointer && dot && ring) {
      dot.style.transform = 'translate3d(' + pointer.px + 'px,' + pointer.py + 'px,0)';
      var kr = 1 - Math.exp(-dt * 12);
      ringPos.x += (pointer.px - ringPos.x) * kr;
      ringPos.y += (pointer.py - ringPos.y) * kr;
      ring.style.transform = 'translate3d(' + ringPos.x.toFixed(1) + 'px,' + ringPos.y.toFixed(1) + 'px,0)';
    }

    // work preview
    if (preview && previewPos.on) {
      var kp = 1 - Math.exp(-dt * 7);
      previewPos.x += (pointer.px + 40 - previewPos.x) * kp;
      previewPos.y += (pointer.py - previewPos.y) * kp;
      var tilt = clamp((pointer.px + 40 - previewPos.x) * 0.04, -8, 8);
      preview.style.transform = 'translate3d(' + previewPos.x.toFixed(1) + 'px,' + previewPos.y.toFixed(1) + 'px,0) rotate(' + tilt.toFixed(2) + 'deg)';
    } else if (preview) {
      previewPos.x = pointer.px + 40; previewPos.y = pointer.py;
    }

    // marquee: drifts slowly, speeds up softly with scroll velocity
    if (marquee && marqueeW > 0 && !reduce) {
      marqueeX -= (38 + Math.min(Math.abs(scrollVel) * 0.25, 600)) * dt;
      if (marqueeX <= -marqueeW) marqueeX += marqueeW;
      marquee.style.transform = 'translate3d(' + marqueeX.toFixed(2) + 'px,0,0)';
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ---------------- Preloader ---------------- */
  var start = performance.now();
  function reveal() {
    var wait = Math.max(0, 900 - (performance.now() - start));
    setTimeout(function () {
      remeasure();
      root.classList.remove('is-loading');
      root.classList.add('is-loaded');
    }, wait);
  }
  var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, new Promise(function (r) { setTimeout(r, 2500); })]).then(reveal);
})();
