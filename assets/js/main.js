/* =========================================================
   LIPA — поведение сайта
   Прелоадер, плавный скролл (Lenis), раскрытие арки на главном экране,
   проявление текста по словам, горизонтальная лента букетов,
   параллакс, меню, окно заявки с маской телефона, карта.
   ========================================================= */
(() => {
  'use strict';

  /* ===== Данные лавки: меняйте здесь ===== */
  const CONFIG = {
    // Телефон для звонков и SMS-заявок, только цифры с «+»
    phone: '+79080336688',
    // Ссылка на Telegram-аккаунт, который принимает заказы, например 'https://t.me/username'.
    // В заявку подставится готовый текст. Пока пусто, все кнопки Telegram на сайте скрыты.
    telegram: '',
    // Карточка лавки на Яндекс Картах (кнопка «Поделиться» в карточке).
    // Пока стоит поиск по названию и адресу.
    yandexMaps: 'https://yandex.ru/maps/?text=' + encodeURIComponent('Lipa, Москва, улица Нижние Мнёвники, 9'),
    // Координаты дома: широта, долгота
    coords: [55.751547, 37.452628],
    // Куда отправлять заявки: адрес Formspree, своего сервера или Telegram-бота.
    // Заявка уходит POST-запросом в JSON. Пусто: форма работает как демо и никуда не отправляет.
    formEndpoint: '',
    // Полный режим работы, например 'Ежедневно с 10:00 до 21:00'. Пусто: «Открываемся в 10:00».
    hours: '',
    // Подпись «Демо-версия сайта» в подвале. Убрать: false или ссылка с ?demo=0
    demo: true,
    // Номер счётчика Яндекс Метрики, например 98765432. Пусто: Метрика не подключается.
    // Цели: order (заявка), call (звонок), sms, telegram, route (маршрут).
    metrikaId: '',
    // Оператор персональных данных для политики: 'ИП Иванова Анна Сергеевна, ИНН 770000000000'
    operator: '',
  };

  /* ---------- Яндекс Метрика ---------- */
  if (CONFIG.metrikaId) {
    window.ym = window.ym || function ym() { (window.ym.a = window.ym.a || []).push(arguments); };
    window.ym.l = Date.now();
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://mc.yandex.ru/metrika/tag.js';
    document.head.append(s);
    window.ym(Number(CONFIG.metrikaId), 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true });
  }

  const root = document.documentElement;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeInOutQuart = (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);
  const mq = (q) => window.matchMedia(q).matches;
  const reduce = mq('(prefers-reduced-motion: reduce)');
  const finePointer = mq('(hover: hover) and (pointer: fine)');

  /* ---------- Контакты из CONFIG ---------- */
  const [lat, lon] = CONFIG.coords;
  const routeUrl = `https://yandex.ru/maps/?rtext=~${lat}%2C${lon}&rtt=auto`;
  $$('.js-route').forEach((a) => (a.href = routeUrl));
  $$('.js-yandex').forEach((a) => (a.href = CONFIG.yandexMaps));
  if (CONFIG.telegram) $$('.js-tg').forEach((a) => (a.href = CONFIG.telegram));
  else root.classList.add('no-tg');
  if (CONFIG.hours) $$('.js-hours').forEach((el) => (el.textContent = CONFIG.hours));
  const params = new URLSearchParams(location.search);
  if (!CONFIG.demo || params.get('demo') === '0') root.classList.add('no-demo');
  $$('.js-year').forEach((el) => (el.textContent = new Date().getFullYear()));

  /* ---------- Разбивка текста на слова ---------- */
  const words = [];
  $$('.js-words').forEach((el) => {
    const nodes = [...el.childNodes];
    el.textContent = '';
    nodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        // Неразрывные пробелы не делим: «в двух» остаётся одним словом
        n.textContent.split(/[ \t\r\n]+/).forEach((t) => {
          if (!t) return;
          const s = document.createElement('span');
          s.className = 'w';
          s.textContent = t;
          el.append(s, ' ');
          words.push(s);
        });
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        n.classList.add('w');
        el.append(n, ' ');
        words.push(n);
      }
    });
  });

  // Подпись dgd studio: буквы поднимаются по одной
  $$('.js-sign').forEach((el) => {
    const text = el.textContent;
    el.textContent = '';
    [...text].forEach((ch, i) => {
      const s = document.createElement('span');
      s.className = 'ch';
      s.style.setProperty('--i', i);
      s.textContent = ch;
      el.append(s);
    });
  });

  /* ---------- Плавный скролл ---------- */
  let lenis = null;
  if (!reduce && finePointer && window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 0.95 });
    lenis.stop();
  }
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (!location.hash) window.scrollTo(0, 0);

  function scrollToY(y) {
    if (lenis) lenis.scrollTo(y, { duration: 1.6, easing: easeInOutQuart, force: true });
    else window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
  }

  /* ---------- Элементы сцен ---------- */
  const header = $('.header');
  const hero = $('.hero');
  const heroSticky = $('.hero__sticky');
  const heroArch = $('.hero__arch');
  const heroImgBox = $('.hero__arch-img');
  const heroHalfL = $('.hero__half--l');
  const heroHalfR = $('.hero__half--r');
  const heroWord = $('.hero__word');
  const heroBottom = $('.hero__bottom');
  const heroCaption = $('.hero__caption');
  const heroShade = $('.hero__shade');

  const catalog = $('.catalog');
  const catSticky = $('.catalog__sticky');
  const catViewport = $('.catalog__viewport');
  const track = $('.catalog__track');
  const catBar = $('.js-cat-bar');
  const catIndex = $('.js-cat-index');
  const cardCount = $$('.card', track).length;

  const aboutText = $('.about__text');
  const pars = reduce ? [] : $$('[data-speed]').map((el) => ({ el, speed: parseFloat(el.dataset.speed) || 0, top: 0, h: 0 }));

  let vw = window.innerWidth;
  let vh = window.innerHeight;
  let heroTop = 0, heroRange = 1, arch = null;
  let catTop = 0, catDist = 0, catMode = false;
  let aboutTop = 0, aboutH = 1;
  let needsUpdate = true;

  const wideCatalog = () => !reduce && !mq('(max-width: 900px), (max-aspect-ratio: 5/6)');

  function measure() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    const sy = window.scrollY;

    // Лента букетов: на широких экранах вертикальная прокрутка двигает её вбок
    catMode = wideCatalog();
    if (catMode) {
      track.style.transform = 'translate3d(0,0,0)';
      catDist = Math.max(0, track.scrollWidth - vw);
      catalog.style.height = `${catDist + catSticky.offsetHeight}px`;
    } else {
      catalog.style.height = '';
      track.style.transform = '';
    }

    const stickyH = heroSticky.offsetHeight;
    heroTop = hero.getBoundingClientRect().top + sy;
    heroRange = Math.max(1, hero.offsetHeight - stickyH);
    measureArch();

    catTop = catalog.getBoundingClientRect().top + sy;
    const ar = aboutText.getBoundingClientRect();
    aboutTop = ar.top + sy;
    aboutH = ar.height;

    pars.forEach((o) => {
      o.el.style.transform = '';
      const r = o.el.getBoundingClientRect();
      o.top = r.top + sy;
      o.h = r.height;
    });

    lastWordK = -1;
    heroKey = '';
    catKey = -1;
    needsUpdate = true;
  }

  /* Геометрия арки. Арка растёт только через transform: scale, поэтому ни форма, ни фото
     не перерисовываются во время прокрутки. Фото внутри всегда размером с экран
     и получает обратный масштаб, так что на экране оно не меняет размер и не теряет резкость. */
  function measureArch() {
    heroArch.style.transform = 'none';
    const sr = heroSticky.getBoundingClientRect();
    const ar = heroArch.getBoundingClientRect();
    const W = sr.width, H = sr.height, w = ar.width, h = ar.height;
    heroImgBox.style.width = `${W}px`;
    heroImgBox.style.height = `${H}px`;
    heroImgBox.style.left = `${(w - W) / 2}px`;
    heroImgBox.style.top = `${(h - H) / 2}px`;

    // Минимальный масштаб, при котором арка (прямоугольник с полукругом сверху) закрывает углы экрана
    const a = w / 2;
    const b = Math.max(0, (h - w) / 2);
    const A = a * a - b * b, B = b * H, C = (W * W + H * H) / 4;
    let sEnd = A > 0 ? (-B + Math.sqrt(B * B + 4 * A * C)) / (2 * A) : H / Math.max(1, h - w);
    sEnd = Math.max(sEnd, W / w, H / Math.max(1, h - 28)) * 1.04;

    arch = {
      sEnd,
      dx: W / 2 - (ar.left - sr.left + w / 2),
      dy: H / 2 - (ar.top - sr.top + h / 2),
    };
  }

  /* ---------- Главный экран: арка раскрывается на весь экран ---------- */
  let loaded = false;
  let introStart = 0;
  let introT = reduce ? 1 : 0;

  let heroKey = '';
  function updateHero(sy) {
    if (!arch) return;
    const p = reduce ? 0 : clamp((sy - heroTop) / heroRange);
    const intro = easeOutExpo(introT);
    // Пока главный экран не виден и не меняется, стили не трогаем
    const key = `${p.toFixed(4)}|${intro.toFixed(3)}`;
    if (key === heroKey) return;
    heroKey = key;
    const e = easeInOut(clamp(p / 0.8));

    // Масштаб растёт плавно и равномерно на глаз (геометрически), центр арки уезжает в центр экрана
    const s = Math.pow(arch.sEnd, e);
    const ty = arch.dy * e + (1 - intro) * 70;
    heroArch.style.transform = `translate3d(${(arch.dx * e).toFixed(1)}px,${ty.toFixed(1)}px,0) scale(${s.toFixed(4)})`;
    heroArch.style.opacity = intro < 1 ? intro.toFixed(3) : '';
    heroImgBox.style.transform = `scale(${(1 / s).toFixed(5)})`;

    const shift = e * vw * 0.3;
    heroHalfL.style.transform = `translate3d(${-shift}px,0,0)`;
    heroHalfR.style.transform = `translate3d(${shift}px,0,0)`;
    heroWord.style.opacity = (1 - clamp(e * 1.5)).toFixed(3);

    const b = clamp(p * 4.5);
    heroBottom.style.opacity = (1 - b).toFixed(3);
    heroBottom.style.transform = `translate3d(0,${(-b * 60).toFixed(1)}px,0)`;
    heroBottom.style.visibility = b >= 1 ? 'hidden' : '';

    const c = clamp((p - 0.6) / 0.25);
    heroCaption.style.opacity = c.toFixed(3);
    heroCaption.style.transform = `translate3d(0,${((1 - easeOut(c)) * 40).toFixed(1)}px,0)`;
    heroShade.style.opacity = clamp((p - 0.4) / 0.35).toFixed(3);
  }

  /* ---------- О лавке: слова проявляются по мере прокрутки ---------- */
  let lastWordK = -1;
  function updateWords(sy) {
    const start = aboutTop - vh * 0.82;
    const end = aboutTop + aboutH - vh * 0.42;
    const p = reduce ? 1 : clamp((sy - start) / Math.max(1, end - start));
    const k = Math.round(p * words.length);
    if (k === lastWordK) return;
    lastWordK = k;
    words.forEach((w, i) => w.classList.toggle('on', i < k));
  }

  /* ---------- Букеты: горизонтальная лента ---------- */
  let lastCardIndex = 0;
  function setCatProgress(p) {
    catBar.style.transform = `scaleX(${p.toFixed(4)})`;
    const i = Math.round(p * (cardCount - 1)) + 1;
    if (i !== lastCardIndex) {
      lastCardIndex = i;
      catIndex.textContent = String(i).padStart(2, '0');
    }
  }
  let catKey = -1;
  function updateCatalog(sy) {
    if (!catMode) return;
    const p = catDist > 0 ? clamp((sy - catTop) / catDist) : 0;
    if (p === catKey) return;
    catKey = p;
    track.style.transform = `translate3d(${(-p * catDist).toFixed(1)}px,0,0)`;
    setCatProgress(p);
  }
  catViewport.addEventListener('scroll', () => {
    if (catMode) return;
    const max = catViewport.scrollWidth - catViewport.clientWidth;
    setCatProgress(max > 0 ? clamp(catViewport.scrollLeft / max) : 0);
  }, { passive: true });

  /* ---------- Параллакс фото в разделе «Лавка» ---------- */
  function updateParallax(sy) {
    const center = sy + vh / 2;
    pars.forEach((o) => {
      const d = o.top + o.h / 2 - center;
      if (Math.abs(d) > vh * 1.5) return;
      o.el.style.transform = `translate3d(0,${(d * o.speed).toFixed(1)}px,0)`;
    });
  }

  function update(sy) {
    header.classList.toggle('is-scrolled', sy > 30);
    root.classList.toggle('dock-on', sy > vh * 0.85);
    updateHero(sy);
    updateWords(sy);
    updateCatalog(sy);
    updateParallax(sy);
  }

  /* ---------- Курсор «Хочу такой» ---------- */
  const cursor = $('.cursor');
  const cursorLabel = $('.cursor__label');
  let mx = -300, my = -300, cx = -300, cy = -300, cursorOn = false;
  const cursorEnabled = finePointer && !reduce;
  function checkCursor(target) {
    const t = target && target.closest ? target.closest('[data-cursor]') : null;
    const show = !!t && !target.closest('button, a') && !modalOpen;
    if (t) cursorLabel.textContent = t.dataset.cursor;
    if (show !== cursorOn) {
      cursorOn = show;
      cursor.classList.toggle('is-on', show);
    }
  }
  if (cursorEnabled) {
    window.addEventListener('pointermove', (e) => {
      mx = e.clientX;
      my = e.clientY;
      // При первом движении кружок появляется сразу под мышью, а не прилетает из угла
      if (cx < -200) { cx = mx; cy = my; }
      checkCursor(e.target);
    }, { passive: true });
    document.addEventListener('pointerleave', () => {
      cursorOn = false;
      cursor.classList.remove('is-on');
    });
  }

  /* ---------- Главный цикл ---------- */
  let lastSy = -1;
  function frame(now) {
    if (lenis) lenis.raf(now);
    if (loaded && introT < 1) {
      introT = clamp((now - introStart) / 1500);
      needsUpdate = true;
    }
    const sy = window.scrollY;
    if (sy !== lastSy || needsUpdate) {
      // При прокрутке колесом мышь стоит на месте, а под ней меняется содержимое
      if (cursorEnabled && sy !== lastSy && mx >= 0) checkCursor(document.elementFromPoint(mx, my));
      lastSy = sy;
      needsUpdate = false;
      update(sy);
    }
    if (cursorEnabled && (Math.abs(mx - cx) > 0.3 || Math.abs(my - cy) > 0.3)) {
      cx += (mx - cx) * 0.2;
      cy += (my - cy) * 0.2;
      cursor.style.transform = `translate3d(${cx.toFixed(1)}px,${cy.toFixed(1)}px,0)`;
    }
    requestAnimationFrame(frame);
  }

  /* ---------- Прелоадер ---------- */
  const loader = $('.loader');
  const loaderBar = $('.loader__bar i');
  const loaderCount = $('.js-count');
  const heroImg = $('.hero__arch img');

  root.classList.add('is-loading');
  let quick = false;
  try {
    quick = sessionStorage.getItem('lipa-visited') === '1';
    sessionStorage.setItem('lipa-visited', '1');
  } catch (e) { /* приватный режим */ }

  const waitImage = (img) => new Promise((res) => {
    if (img.complete && img.naturalWidth) {
      (img.decode ? img.decode() : Promise.resolve()).then(res, res);
    } else {
      img.addEventListener('load', () => (img.decode ? img.decode() : Promise.resolve()).then(res, res), { once: true });
      img.addEventListener('error', res, { once: true });
    }
  });
  const tasks = [
    document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve(),
    waitImage(heroImg),
    ...$$('.pill-img img').map((img) => { img.loading = 'eager'; return waitImage(img); }),
  ];
  let doneTasks = 0;
  let target = 0;
  tasks.forEach((t) => t.then(() => { doneTasks += 1; target = doneTasks / tasks.length; }));

  const t0 = performance.now();
  const minTime = reduce ? 0 : quick ? 600 : 1700;
  let shown = 0;

  function finishLoading() {
    if (loaded) return;
    loaded = true;
    measure();
    root.classList.remove('is-loading');
    root.classList.add('is-loaded');
    introStart = performance.now() + (reduce ? 0 : 350);
    if (lenis) lenis.start();
    if (location.hash && $(location.hash)) {
      setTimeout(() => scrollToY($(location.hash).getBoundingClientRect().top + window.scrollY), 400);
    }
    setTimeout(() => { loader.style.display = 'none'; }, 1400);
  }

  function loaderTick(now) {
    if (loaded) return;
    const timeP = minTime ? easeOut(clamp((now - t0) / minTime)) : 1;
    const goal = Math.min(target, timeP);
    shown += (goal - shown) * 0.12;
    if (goal - shown < 0.002) shown = goal;
    loaderBar.style.transform = `scaleX(${shown.toFixed(4)})`;
    loaderCount.textContent = Math.round(shown * 100);
    if (shown >= 1 || now - t0 > 7000) finishLoading();
    else requestAnimationFrame(loaderTick);
  }

  /* ---------- Пересчёт размеров ---------- */
  let resizeRaf = 0;
  let lastW = window.innerWidth;
  let lastH = window.innerHeight;
  function onResize() {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // На телефонах высота «прыгает» от панели браузера: мелкие изменения пропускаем
      if (w === lastW && Math.abs(h - lastH) < 80 && !finePointer) return;
      lastW = w;
      lastH = h;
      measure();
    });
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(measure, 300));
  window.addEventListener('load', () => measure());

  /* ---------- Появление блоков ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in');
      io.unobserve(en.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  $$('[data-reveal]').forEach((el) => io.observe(el));
  // Подпись стоит в самом низу страницы, поэтому для неё отдельный наблюдатель без отступа
  const signIo = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in');
      signIo.unobserve(en.target);
    });
  }, { threshold: 0 });
  $$('.signature').forEach((el) => signIo.observe(el));

  /* ---------- Текущий раздел в меню ---------- */
  const navLinks = $$('.nav a, .menu__nav a');
  const navIo = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const id = `#${en.target.id}`;
      navLinks.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  ['top', 'about', 'bouquets', 'shop', 'order', 'care', 'contacts'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) navIo.observe(el);
  });
  if (location.hash === '#privacy') setTimeout(openDoc, 600);

  /* ---------- Якорные ссылки ---------- */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    // Кнопки «Заказать» — ссылки на «Как заказать» на случай без JS; с JS они открывают окно заявки
    if (!a || a.hasAttribute('data-order')) return;
    const id = a.getAttribute('href');
    e.preventDefault();
    if (id === '#') return;
    if (id === '#privacy') { openDoc(); return; }
    setMenu(false);
    if (id === '#top') { scrollToY(0); return; }
    const el = $(id);
    if (!el) return;
    let y = el.getBoundingClientRect().top + window.scrollY;
    if (el === catalog && catMode) y = catTop;
    scrollToY(y);
  });

  /* ---------- Меню ---------- */
  const burger = $('.burger');
  const menu = $('#menu');
  let menuOpen = false;
  function setMenu(open) {
    if (open === menuOpen) return;
    menuOpen = open;
    root.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    menu.setAttribute('aria-hidden', String(!open));
    lockScroll(open || modalOpen || docOpen);
  }
  burger.addEventListener('click', () => setMenu(!menuOpen));

  function lockScroll(lock) {
    if (lenis) (lock ? lenis.stop() : lenis.start());
    document.body.style.overflow = lock ? 'hidden' : '';
  }

  /* ---------- Окно заявки ---------- */
  const modal = $('#modal');
  const form = $('.form', modal);
  const formSend = $('.form-send', modal);
  const formDone = $('.form-done', modal);
  const submitBtn = $('.form__submit', form);
  const field = (n) => form.querySelector(`[name="${n}"]`);
  const checked = (n) => { const el = form.querySelector(`[name="${n}"]:checked`); return el ? el.value : ''; };
  let modalOpen = false;
  let lastFocus = null;
  let orderSent = false;

  function showStep(step) {
    form.hidden = step !== form;
    formSend.hidden = step !== formSend;
    formDone.hidden = step !== formDone;
    $('.modal__box', modal).scrollTop = 0;
  }

  function openModal(bouquet) {
    lastFocus = document.activeElement;
    // После отправленной заявки форма открывается чистой, иначе сохраняется черновик
    if (orderSent) { form.reset(); dateChip.hidden = true; orderSent = false; }
    showStep(form);
    clearMsg();
    if (bouquet) field('bouquet').value = bouquet;
    modalOpen = true;
    if (cursorOn) { cursorOn = false; cursor.classList.remove('is-on'); }
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    root.classList.add('modal-open');
    lockScroll(true);
    // На телефоне не открываем клавиатуру сразу
    setTimeout(() => (finePointer ? field('name') : $('.modal__box', modal)).focus({ preventScroll: true }), 380);
  }
  function closeModal() {
    if (!modalOpen) return;
    modalOpen = false;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    root.classList.remove('modal-open');
    lockScroll(menuOpen || docOpen);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  $('.modal__box', modal).setAttribute('tabindex', '-1');

  document.addEventListener('click', (e) => {
    const orderBtn = e.target.closest('[data-order]');
    if (orderBtn) {
      e.preventDefault();
      setMenu(false);
      openModal(orderBtn.dataset.order || '');
      return;
    }
    if (e.target.closest('[data-close]')) { closeModal(); return; }
    if (e.target.closest('[data-close-doc]')) { closeDoc(); return; }
    if (e.target.closest('[data-back]')) { orderSent = false; showStep(form); return; }
    // Клик по карточке букета тоже открывает заявку
    const card = e.target.closest('.card');
    if (card && !e.target.closest('a, button')) {
      const b = $('[data-order]', card);
      openModal(b ? b.dataset.order : '');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (docOpen) closeDoc();
    else if (modalOpen) closeModal();
    else if (menuOpen) setMenu(false);
  });
  // Фокус не уходит из открытого окна
  function trapFocus(box) {
    box.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const items = $$('button, input, textarea, a[href]', box).filter((el) => el.offsetParent !== null && !el.disabled);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }
  trapFocus(modal);

  /* ---------- Политика обработки персональных данных ---------- */
  const doc = $('#privacy');
  const docBox = $('.modal__box', doc);
  docBox.setAttribute('tabindex', '-1');
  let docOpen = false;
  let docFocus = null;
  if (CONFIG.operator) $$('.js-operator').forEach((el) => el.replaceWith(document.createTextNode(CONFIG.operator)));
  function openDoc() {
    if (docOpen) return;
    docFocus = document.activeElement;
    docOpen = true;
    setMenu(false);
    doc.classList.add('is-open');
    doc.setAttribute('aria-hidden', 'false');
    docBox.scrollTop = 0;
    lockScroll(true);
    setTimeout(() => docBox.focus({ preventScroll: true }), 300);
  }
  function closeDoc() {
    if (!docOpen) return;
    docOpen = false;
    doc.classList.remove('is-open');
    doc.setAttribute('aria-hidden', 'true');
    lockScroll(modalOpen || menuOpen);
    if (docFocus && docFocus.focus) docFocus.focus({ preventScroll: true });
  }
  trapFocus(doc);

  /* ---------- Быстрый выбор в заявке ---------- */
  // Повторное нажатие на выбранный вариант снимает выбор
  $$('.chip input[type="radio"]', form).forEach((r) => {
    r.addEventListener('pointerdown', () => { r.dataset.was = r.checked ? '1' : ''; });
    r.addEventListener('click', () => {
      if (r.dataset.was === '1') { r.checked = false; r.dataset.was = ''; r.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  });
  const dateChip = $('.chip--date', form);
  const dateInput = field('date');
  const today = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  dateInput.min = iso(today);
  form.addEventListener('change', (e) => {
    if (e.target.name !== 'when') return;
    const other = checked('when') === 'date';
    dateChip.hidden = !other;
    if (other && !dateInput.value) {
      const t = new Date(today); t.setDate(t.getDate() + 2);
      dateInput.value = iso(t);
    }
  });

  function whenText() {
    const w = checked('when');
    if (w !== 'date') return w;
    if (!dateInput.value) return '';
    const [y, m, d] = dateInput.value.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' });
  }

  function orderText(d) {
    const lines = ['Здравствуйте! Хочу заказать букет.', `Имя: ${d.name}`, `Телефон: ${d.phone}`];
    if (d.bouquet) lines.push(`Букет: ${d.bouquet}`);
    if (d.occasion) lines.push(`Повод: ${d.occasion}`);
    if (d.budget) lines.push(`Бюджет: ${d.budget}`);
    if (d.when) lines.push(`Когда: ${d.when}`);
    if (d.comment) lines.push(`Комментарий: ${d.comment}`);
    return lines.join('\n');
  }

  /* ---------- Цели Яндекс Метрики (если подключена) ---------- */
  function goal(name) {
    if (CONFIG.metrikaId && typeof window.ym === 'function') window.ym(CONFIG.metrikaId, 'reachGoal', name);
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    if (a.href.startsWith('tel:')) goal('call');
    else if (a.classList.contains('js-route')) goal('route');
    else if (a.classList.contains('js-tg') || a.classList.contains('js-send-tg')) goal('telegram');
    else if (a.classList.contains('js-send-sms')) goal('sms');
  });

  // Маска телефона: +7 (999) 123-45-67
  const phoneInput = field('phone');
  function formatPhone(v) {
    let d = v.replace(/\D/g, '');
    if (!d) return '';
    if (d[0] === '8') d = '7' + d.slice(1);
    if (d[0] !== '7') d = '7' + d;
    d = d.slice(0, 11);
    let out = '+7';
    if (d.length > 1) out += ' (' + d.slice(1, 4);
    if (d.length >= 4) out += ')';
    if (d.length > 4) out += ' ' + d.slice(4, 7);
    if (d.length > 7) out += '-' + d.slice(7, 9);
    if (d.length > 9) out += '-' + d.slice(9, 11);
    return out;
  }
  phoneInput.addEventListener('input', () => { phoneInput.value = formatPhone(phoneInput.value); });
  phoneInput.addEventListener('blur', () => { if (phoneInput.value.replace(/\D/g, '').length <= 1) phoneInput.value = ''; });

  ['name', 'phone'].forEach((n) => field(n).addEventListener('input', () => field(n).closest('.field').classList.remove('is-error')));

  function clearMsg() {
    const m = $('.form__msg', form);
    if (m) m.remove();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMsg();
    const name = field('name');
    const phone = field('phone');
    const okName = name.value.trim().length >= 2;
    const okPhone = phone.value.replace(/\D/g, '').length === 11;
    name.closest('.field').classList.toggle('is-error', !okName);
    phone.closest('.field').classList.toggle('is-error', !okPhone);
    if (!okName || !okPhone) { (okName ? phone : name).focus(); return; }

    const data = {
      name: name.value.trim(),
      phone: phone.value,
      bouquet: field('bouquet').value.trim(),
      occasion: checked('occasion'),
      budget: checked('budget'),
      when: whenText(),
      comment: field('comment').value.trim(),
    };
    data.text = orderText(data);
    data.page = location.href;
    goal('order');

    // Адрес для заявок не настроен: показываем готовое сообщение и кнопки отправки флористу
    if (!CONFIG.formEndpoint) {
      showOrderText(data.text);
      return;
    }

    const label = $('span', submitBtn);
    const initial = label.textContent;
    submitBtn.classList.add('is-sending');
    label.textContent = 'Отправляем…';
    try {
      const r = await fetch(CONFIG.formEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error(String(r.status));
      orderSent = true;
      showStep(formDone);
      $('.modal__box', modal).focus({ preventScroll: true });
    } catch (err) {
      // Сервер не ответил: даём отправить ту же заявку по SMS или в Telegram
      showOrderText(data.text, true);
    } finally {
      submitBtn.classList.remove('is-sending');
      label.textContent = initial;
    }
  });

  const orderTextEl = $('.js-order-text', formSend);
  const sendSms = $('.js-send-sms', formSend);
  const sendTg = $('.js-send-tg', formSend);
  const copyBtn = $('.js-copy', formSend);
  // Ссылка Telegram с готовым текстом работает для аккаунта по имени: t.me/имя?text=...
  const tgWithText = (text) => {
    if (!CONFIG.telegram) return '';
    const u = CONFIG.telegram.replace(/\/+$/, '');
    return /^https:\/\/t\.me\/[A-Za-z0-9_]{4,}$/.test(u) ? `${u}?text=${encodeURIComponent(text)}` : CONFIG.telegram;
  };

  function showOrderText(text, failed) {
    orderTextEl.textContent = text;
    // sms:номер?&body= понимают и iPhone, и Android
    sendSms.href = `sms:${CONFIG.phone}?&body=${encodeURIComponent(text)}`;
    sendTg.hidden = !CONFIG.telegram;
    if (CONFIG.telegram) sendTg.href = tgWithText(text);
    $('p', formSend).textContent = failed
      ? 'Не получилось отправить заявку через сайт. Отправьте её флористу сами: сообщение уже составлено.'
      : 'Осталось отправить её флористу: сообщение уже составлено, нажмите кнопку и «Отправить».';
    $('span', copyBtn).textContent = 'Скопировать';
    orderSent = true;
    showStep(formSend);
    $('.modal__box', modal).focus({ preventScroll: true });
  }

  copyBtn.addEventListener('click', async () => {
    const text = orderTextEl.textContent;
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch (e) {
      // Запасной способ для старых браузеров и локального файла
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
      document.body.append(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
    }
    $('span', copyBtn).textContent = ok ? 'Скопировано' : 'Выделите текст выше';
  });

  /* ---------- Карта на фоне контактов ----------
     MapLibre + бесплатные тайлы OpenFreeMap (без рекламы и без ключа), перекрашенные в цвета сайта.
     Библиотека и карта загружаются, только когда до раздела доходит прокрутка.
     Колесо мыши и один палец листают страницу, карту двигают Ctrl + колесо или два пальца. */
  const mapBox = $('.js-map');
  const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
  const MAP_ZOOM = 15.4;

  const loadScript = (src) => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = rej;
    document.head.append(s);
  });
  const loadCss = (href) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    document.head.append(l);
  };

  // Перекраска стиля карты под палитру сайта и подписи на русском
  function tintMapStyle(style) {
    const C = {
      bg: '#eee7dc', park: '#e2e3d1', wood: '#dcdfcc', water: '#d0d7d4', residential: '#ebe4d8',
      building: '#e3d9cb', buildingLine: '#d6cbbb', road: '#fbf8f3', minor: '#f6f1e9', casing: '#dcd1c1',
      rail: '#d4cabd', boundary: '#c8bdb0', text: '#7a6e65', waterText: '#8b9792', halo: '#f4eee6',
    };
    const name = ['coalesce', ['get', 'name:ru'], ['get', 'name'], ['get', 'name_en']];
    style.layers.forEach((l) => {
      const id = l.id;
      const p = l.paint || (l.paint = {});
      const lay = l.layout || {};
      if (id === 'background') p['background-color'] = C.bg;
      else if (id === 'park') p['fill-color'] = C.park;
      else if (id === 'water') p['fill-color'] = C.water;
      else if (id === 'waterway') p['line-color'] = C.water;
      else if (id === 'landuse_residential') p['fill-color'] = C.residential;
      else if (id === 'landcover_wood') p['fill-color'] = C.wood;
      else if (id === 'building') { p['fill-color'] = C.building; p['fill-outline-color'] = C.buildingLine; }
      else if (id === 'road_area_pier') p['fill-color'] = C.bg;
      else if (id === 'road_pier') p['line-color'] = C.bg;
      else if (/casing/.test(id)) p['line-color'] = C.casing;
      else if (/subtle/.test(id)) p['line-color'] = 'rgba(220, 209, 193, .6)';
      else if (/inner/.test(id)) p['line-color'] = C.road;
      else if (/highway_minor|highway_path/.test(id)) p['line-color'] = C.minor;
      else if (/^railway/.test(id)) p['line-color'] = /dashline/.test(id) ? C.bg : C.rail;
      else if (/^boundary/.test(id)) p['line-color'] = C.boundary;
      if (l.type === 'symbol' && lay['text-field'] && JSON.stringify(lay['text-field']).includes('name')) {
        lay['text-field'] = name;
        p['text-color'] = /water/.test(id) ? C.waterText : C.text;
        p['text-halo-color'] = C.halo;
      }
    });
    return style;
  }

  // Отступ слева под карточку, чтобы метка стояла по центру свободной части карты
  const mapStacked = () => mq('(max-width: 900px), (max-aspect-ratio: 5/6)');
  function mapPadding() {
    if (mapStacked()) return { top: 0, right: 0, bottom: 70, left: 0 };
    const card = $('.contacts__card').getBoundingClientRect();
    const box = mapBox.getBoundingClientRect();
    return { top: 0, right: 0, bottom: 0, left: Math.max(0, card.right - box.left + 24) };
  }

  async function initMap() {
    try {
      if (!window.maplibregl) {
        loadCss('assets/vendor/maplibre-gl.css');
        await loadScript('assets/vendor/maplibre-gl.js');
      }
      const ml = window.maplibregl;
      const style = tintMapStyle(await (await fetch(MAP_STYLE_URL)).json());
      const el = document.createElement('div');
      el.className = 'map__canvas';
      mapBox.append(el);

      const map = new ml.Map({
        container: el,
        style,
        center: [lon, lat],
        zoom: MAP_ZOOM,
        minZoom: 10,
        maxZoom: 18.5,
        cooperativeGestures: true,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        renderWorldCopies: false,
        attributionControl: { compact: true },
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        locale: {
          'CooperativeGesturesHandler.WindowsHelpText': 'Чтобы приблизить карту, крутите колесо с зажатой Ctrl',
          'CooperativeGesturesHandler.MacHelpText': 'Чтобы приблизить карту, крутите колесо с зажатой ⌘',
          'CooperativeGesturesHandler.MobileHelpText': 'Двигайте карту двумя пальцами',
          'NavigationControl.ZoomIn': 'Приблизить',
          'NavigationControl.ZoomOut': 'Отдалить',
          'AttributionControl.ToggleAttribution': 'Источники карты',
        },
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new ml.NavigationControl({ showCompass: false }), 'bottom-right');

      const pin = document.createElement('div');
      pin.className = 'pin';
      pin.innerHTML = '<span class="pin__dot"><svg><use href="#leaf"/></svg></span><span class="pin__label">LIPA<small>подъезд 10</small></span>';
      new ml.Marker({ element: pin, anchor: 'center' }).setLngLat([lon, lat]).addTo(map);

      const recenter = () => map.jumpTo({ center: [lon, lat], zoom: map.getZoom(), padding: mapPadding() });
      recenter();
      map.once('load', () => { recenter(); mapBox.classList.add('is-ready'); });
      map.on('error', () => { if (!map.loaded()) mapBox.classList.add('is-failed'); });
      let t = 0;
      window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(recenter, 200); });
    } catch (err) {
      mapBox.classList.add('is-failed');
    }
  }

  const mapIo = new IntersectionObserver((entries) => {
    if (!entries.some((en) => en.isIntersecting)) return;
    mapIo.disconnect();
    initMap();
  }, { rootMargin: '1500px 0px' });
  mapIo.observe(mapBox);

  /* ---------- Старт ---------- */
  measure();
  update(window.scrollY);
  requestAnimationFrame(frame);
  requestAnimationFrame(loaderTick);
})();
