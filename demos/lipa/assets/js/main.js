/* Lipa — движение страницы.
   Всё привязано к положению прокрутки, а не к таймерам: один цикл
   requestAnimationFrame читает scrollY и раскладывает состояния. */
(() => {
  'use strict';

  // Контакты магазина. Telegram: если ник неизвестен, ссылка ведёт на чат по номеру.
  const CONFIG = {
    phone: '+7 (908) 033-66-88',
    telegram: '',            // ник без @, например 'lipa_flowers'
    hours: 'в 10:00'
  };

  const tel = '+' + CONFIG.phone.replace(/\D/g, '');
  const tg = CONFIG.telegram ? 'https://t.me/' + CONFIG.telegram : 'https://t.me/' + tel;
  document.querySelectorAll('[data-phone]').forEach(a => { a.textContent = CONFIG.phone; a.href = 'tel:' + tel; });
  document.querySelectorAll('[data-telegram]').forEach(a => { a.href = tg; a.target = '_blank'; a.rel = 'noopener'; });
  document.querySelectorAll('[data-hours]').forEach(el => { el.textContent = CONFIG.hours; });
  document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(pointer: fine)').matches;
  const desktopMQ = matchMedia('(min-width: 900px)');

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  /* ---------- Разбивка текста на слова и буквы ---------- */
  function split(el, mode) {
    const text = el.textContent.trim().replace(/\s+/g, ' ');
    el.setAttribute('aria-label', text);
    el.textContent = '';
    const parts = mode === 'chars' ? [...text] : text.split(' ');
    return parts.map((part, i) => {
      const w = document.createElement('span');
      w.className = 'w';
      w.setAttribute('aria-hidden', 'true');
      const inner = document.createElement('span');
      inner.textContent = part;
      w.appendChild(inner);
      el.appendChild(w);
      if (mode !== 'chars' && i < parts.length - 1) el.appendChild(document.createTextNode(' '));
      return inner;
    });
  }

  const splits = [...document.querySelectorAll('[data-split]')].map(el => ({
    el, parts: split(el, el.textContent.trim().length <= 5 ? 'chars' : 'words'), top: 0
  }));

  const highlights = [...document.querySelectorAll('[data-highlight]')].map(el => {
    const words = split(el, 'words').map(s => s.parentNode);
    words.forEach(w => w.removeAttribute('aria-hidden'));
    return { el, words, top: 0, h: 0 };
  });

  const rises = [...document.querySelectorAll('[data-rise]')].map(el => ({ el, top: 0 }));
  const reveals = [...document.querySelectorAll('[data-reveal]')].map(el => ({ el, img: el.querySelector('img'), top: 0 }));

  /* ---------- Элементы сцен ---------- */
  const bar = document.getElementById('top-bar');
  const hero = document.querySelector('.hero');
  const heroWord = hero.querySelector('.hero__word-wrap');
  const heroFrame = hero.querySelector('.hero__frame');
  const heroWin = hero.querySelector('.hero__window');
  const heroImg = hero.querySelector('.hero__img');
  const sideL = hero.querySelector('.hero__side--l');
  const sideR = hero.querySelector('.hero__side--r');
  const heroSub = hero.querySelector('.hero__sub');
  const heroCap = hero.querySelector('.hero__caption');
  const strip = document.querySelector('.strip');
  const track = strip.querySelector('.strip__track');

  let vh = innerHeight, vw = innerWidth;
  let heroTop = 0, heroRange = 1, frame = { t: 0, r: 0, b: 0, l: 0, s: 1, dx: 0, dy: 0 };
  let stripTop = 0, stripDist = 0, stripOn = false;

  // Положение в документе без учёта transform (их мы и анимируем)
  function docTop(el) {
    let t = 0;
    while (el) { t += el.offsetTop; el = el.offsetParent; }
    return t;
  }

  function measure() {
    vh = innerHeight; vw = innerWidth;

    heroTop = docTop(hero);
    heroRange = Math.max(1, hero.offsetHeight - vh);
    const fw = heroFrame.offsetWidth, fh = heroFrame.offsetHeight;
    frame = {
      t: heroFrame.offsetTop,
      l: heroFrame.offsetLeft,
      r: vw - heroFrame.offsetLeft - fw,
      b: vh - heroFrame.offsetTop - fh,
      // фото уменьшено так, чтобы в стартовом окне было видно его целиком,
      // и растёт вместе с окном до полного экрана
      s: Math.max(fw / vw, fh / vh),
      dx: heroFrame.offsetLeft + fw / 2 - vw / 2,
      dy: heroFrame.offsetTop + fh / 2 - vh / 2
    };

    stripOn = desktopMQ.matches && !reduced;
    track.style.transform = '';
    if (stripOn) {
      stripDist = Math.max(0, track.offsetWidth - vw);
      strip.style.height = (vh + stripDist) + 'px';
    } else {
      stripDist = 0;
      strip.style.height = '';
    }
    stripTop = docTop(strip);

    splits.forEach(s => {
      // заголовок ленты живёт внутри sticky-блока: считаем от начала секции
      s.top = strip.contains(s.el) && stripOn ? stripTop + vh * .2 : docTop(s.el);
    });
    highlights.forEach(h => { h.top = docTop(h.el); h.h = h.el.offsetHeight; });
    rises.forEach(r => { r.top = docTop(r.el); });
    reveals.forEach(r => { r.top = docTop(r.el); });

    lastY = -1;
  }

  /* ---------- Кадр ---------- */
  let lastY = -1;

  function render(y) {
    // 1. Первый экран
    const p = clamp((y - heroTop) / heroRange);
    if (y < heroTop + heroRange + vh) {
      const e = easeInOut(clamp(p / .62));
      const rad = lerp(4, 0, e);
      heroWin.style.clipPath =
        `inset(${lerp(frame.t, 0, e)}px ${lerp(frame.r, 0, e)}px ${lerp(frame.b, 0, e)}px ${lerp(frame.l, 0, e)}px round ${rad}px)`;
      heroImg.style.transform =
        `translate3d(${frame.dx * (1 - e)}px, ${frame.dy * (1 - e)}px, 0) scale(${lerp(frame.s * 1.06, 1, e)})`;
      const out = vw * .4 * e;
      const fade = 1 - clamp(p / .42);
      sideL.style.transform = `translate3d(${-out}px, ${-vh * .05 * e}px, 0)`;
      sideR.style.transform = `translate3d(${out}px, ${vh * .04 * e}px, 0)`;
      sideL.style.opacity = sideR.style.opacity = fade;
      heroWord.style.transform = `translate3d(0, ${-vh * .2 * e}px, 0) scale(${lerp(1, .9, e)})`;
      heroWord.style.opacity = 1 - clamp((p - .04) / .36);
      heroSub.style.opacity = 1 - clamp(p / .16);
      heroWin.style.setProperty('--shade', clamp((p - .3) / .3));
      const c = easeOut(clamp((p - .56) / .24));
      heroCap.style.opacity = c;
      heroCap.style.transform = `translate3d(0, ${(1 - c) * 48}px, 0)`;
      heroCap.classList.toggle('is-on', c > .5);
    }

    // шапка: белая поверх раскрытого фото, на подложке после первого экрана
    const heroEnd = heroTop + hero.offsetHeight;
    bar.classList.toggle('is-light', p > .38 && y < heroEnd - vh * .5);
    bar.classList.toggle('is-solid', y >= heroEnd - vh * .5);

    // 2. Текст о магазине: слова проявляются по очереди
    highlights.forEach(h => {
      const q = clamp((y + vh * .82 - h.top) / (h.h + vh * .3));
      const n = h.words.length, soft = 5;
      h.words.forEach((w, i) => {
        w.style.opacity = .16 + .84 * clamp((q * (n + soft) - i) / soft);
      });
    });

    // 3. Лента букетов
    if (stripOn) {
      const q = clamp((y - stripTop) / Math.max(1, stripDist));
      track.style.transform = `translate3d(${-q * stripDist}px, 0, 0)`;
    }

    if (reduced) return;

    // Заголовки: слова или буквы поднимаются снизу
    splits.forEach(s => {
      const q = clamp((y + vh * .9 - s.top) / (vh * .42));
      const n = s.parts.length, step = .14;
      s.parts.forEach((part, i) => {
        const local = easeOut(clamp(q * (1 + (n - 1) * step) - i * step));
        part.style.transform = `translate3d(0, ${(1 - local) * 108}%, 0)`;
      });
    });

    // Блоки выплывают из глубины
    rises.forEach(r => {
      const e = easeOut(clamp((y + vh * .96 - r.top) / (vh * .4)));
      r.el.style.transform = `translate3d(0, ${(1 - e) * 64}px, 0) scale(${lerp(.97, 1, e)})`;
      r.el.style.opacity = e;
    });

    // Фото открываются снизу вверх
    reveals.forEach(r => {
      const e = easeOut(clamp((y + vh - r.top) / (vh * .75)));
      r.el.style.clipPath = `inset(${(1 - e) * 100}% 0 0 0 round 4px)`;
      if (r.img) r.img.style.transform = `scale(${lerp(1.25, 1, e)})`;
    });
  }

  /* ---------- Плавная прокрутка колесом (только мышь/тачпад) ---------- */
  let lenis = null;
  if (window.Lenis && finePointer && !reduced) {
    lenis = new Lenis({ lerp: .085, wheelMultiplier: .9 });
  }

  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', ev => {
      const id = a.getAttribute('href');
      const target = id === '#hero' ? 0 : document.querySelector(id);
      if (target === null) return;
      ev.preventDefault();
      if (lenis) lenis.scrollTo(target, { duration: 1.6 });
      else window.scrollTo({ top: target === 0 ? 0 : docTop(target), behavior: reduced ? 'auto' : 'smooth' });
    });
  });

  function loop(t) {
    if (lenis) lenis.raf(t);
    const y = window.scrollY;
    if (y !== lastY) { lastY = y; render(y); }
    requestAnimationFrame(loop);
  }

  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(measure, 120);
  });
  desktopMQ.addEventListener('change', measure);
  // картинки и шрифты меняют высоту блоков: пересчитываем после загрузки
  addEventListener('load', measure);
  if (document.fonts) document.fonts.ready.then(measure);
  document.querySelectorAll('img').forEach(img => { if (!img.complete) img.addEventListener('load', measure, { once: true }); });

  measure();
  render(window.scrollY);
  requestAnimationFrame(loop);
  requestAnimationFrame(() => document.documentElement.classList.add('is-loaded'));
})();
