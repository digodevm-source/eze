/* nightly: page behaviour
 *
 * The films are looping animated images (AVIF with a WebP fallback), so they
 * start by themselves and loop seamlessly without any script.
 *
 * 1. Smooth scrolling (Lenis), soft reveals and a slight parallax on films.
 * 2. Visitor's local time in the header and footer.
 */
(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------ */
  /* 1. Smooth scroll, reveals, parallax                                 */
  /* ------------------------------------------------------------------ */

  let lenis = null;
  if (!reduceMotion && typeof window.Lenis === 'function') {
    try {
      lenis = new window.Lenis({
        lerp: 0.075,
        wheelMultiplier: 0.9,
        touchMultiplier: 1,
        smoothWheel: true,
        anchors: true,
      });
    } catch (e) {
      lenis = null;
    }
  }

  const reveals = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0 });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('is-in'));
  }

  const parallax = Array.from(document.querySelectorAll('[data-parallax]')).map((el) => ({
    el,
    k: parseFloat(el.dataset.parallax) || 1,
  }));
  let lastY = null;
  let lastH = 0;

  function updateParallax() {
    const y = window.scrollY;
    const h = window.innerHeight;
    if (y === lastY && h === lastH) return;
    lastY = y;
    lastH = h;
    if (reduceMotion) return;
    for (const p of parallax) {
      const r = p.el.parentElement.getBoundingClientRect();
      if (r.bottom < -200 || r.top > h + 200) continue;
      // -1 when the plate is entering from below, +1 when it leaves at the top
      const progress = (h / 2 - (r.top + r.height / 2)) / (h / 2 + r.height / 2);
      const rem = parseFloat(getComputedStyle(root).fontSize) || 16;
      const shift = Math.max(-1, Math.min(1, progress)) * 2.1 * rem * p.k;
      p.el.style.transform = 'translate3d(0,' + shift.toFixed(2) + 'px,0)';
    }
  }

  function frame(time) {
    if (lenis) lenis.raf(time);
    updateParallax();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ------------------------------------------------------------------ */
  /* 2. Local time                                                        */
  /* ------------------------------------------------------------------ */

  const clocks = document.querySelectorAll('[data-clock]');
  const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  function tick() {
    const now = new Date();
    const text = timeFormat.format(now);
    clocks.forEach((c) => {
      c.textContent = text;
      c.setAttribute('datetime', now.toISOString());
    });
  }
  tick();
  setInterval(tick, 10000);

  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });

  /* ------------------------------------------------------------------ */
  /* First-screen entrance: wait briefly for the fonts so nothing jumps   */
  /* ------------------------------------------------------------------ */

  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, new Promise((r) => setTimeout(r, 900))]).then(() => {
    requestAnimationFrame(() => root.classList.add('is-ready'));
  });
})();
