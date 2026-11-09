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
    // Ссылка на Telegram для заказов, например 'https://t.me/username'.
    // Пока пусто, все кнопки Telegram на сайте скрыты.
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
  };

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
  const heroFrame = $('.hero__frame');
  const heroMedia = $('.hero__media');
  const heroMediaIn = $('.hero__media-in');
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
    const fr = heroFrame.getBoundingClientRect();
    const sr = heroSticky.getBoundingClientRect();
    arch = { top: fr.top - sr.top, left: fr.left - sr.left, w: fr.width, h: fr.height, W: sr.width, H: sr.height };
    // Фото сначала вписано в арку целиком, потом растёт до размера экрана
    arch.s0 = Math.max(arch.w / arch.W, arch.h / arch.H);
    arch.dx = arch.left + arch.w / 2 - arch.W / 2;
    arch.dy = arch.top + arch.h / 2 - arch.H / 2;

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
    needsUpdate = true;
  }

  /* ---------- Главный экран: арка раскрывается на весь экран ---------- */
  let loaded = false;
  let introStart = 0;
  let introT = reduce ? 1 : 0;

  function updateHero(sy) {
    if (!arch) return;
    const p = reduce ? 0 : clamp((sy - heroTop) / heroRange);
    const e = easeInOut(clamp(p / 0.8));
    const k = 1 - e;
    const intro = easeOutExpo(introT);

    const top = arch.top * k + (1 - intro) * arch.h * k;
    const left = arch.left * k;
    const right = (arch.W - arch.left - arch.w) * k;
    const bottom = (arch.H - arch.top - arch.h) * k;
    const rt = (arch.w / 2) * k;
    const rb = 14 * k;
    heroMedia.style.clipPath = `inset(${top.toFixed(1)}px ${right.toFixed(1)}px ${bottom.toFixed(1)}px ${left.toFixed(1)}px round ${rt.toFixed(1)}px ${rt.toFixed(1)}px ${rb.toFixed(1)}px ${rb.toFixed(1)}px)`;
    const sc = (arch.s0 + (1 - arch.s0) * e) * (1.06 - 0.06 * e);
    heroMediaIn.style.transform = `translate3d(${(arch.dx * k).toFixed(1)}px,${(arch.dy * k).toFixed(1)}px,0) scale(${sc.toFixed(4)})`;

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
  function updateCatalog(sy) {
    if (!catMode) return;
    const p = catDist > 0 ? clamp((sy - catTop) / catDist) : 0;
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
    if (cursorEnabled) {
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
  const heroImg = $('.hero__media img');

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

  /* ---------- Якорные ссылки ---------- */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    e.preventDefault();
    if (id === '#') return;
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
    lockScroll(open || modalOpen);
  }
  burger.addEventListener('click', () => setMenu(!menuOpen));

  function lockScroll(lock) {
    if (lenis) (lock ? lenis.stop() : lenis.start());
    document.body.style.overflow = lock ? 'hidden' : '';
  }

  /* ---------- Окно заявки ---------- */
  const modal = $('#modal');
  const form = $('.form', modal);
  const formDone = $('.form-done', modal);
  const submitBtn = $('.form__submit', form);
  const field = (n) => form.querySelector(`[name="${n}"]`);
  let modalOpen = false;
  let lastFocus = null;

  function openModal(bouquet) {
    lastFocus = document.activeElement;
    form.hidden = false;
    formDone.hidden = true;
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
    lockScroll(menuOpen);
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
    // Клик по карточке букета тоже открывает заявку
    const card = e.target.closest('.card');
    if (card && !e.target.closest('a, button')) {
      const b = $('[data-order]', card);
      openModal(b ? b.dataset.order : '');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (modalOpen) closeModal();
    else if (menuOpen) setMenu(false);
  });
  // Фокус не уходит из окна, пока оно открыто
  modal.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const items = $$('button, input, textarea, a[href]', modal).filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
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
      comment: field('comment').value.trim(),
      page: location.href,
    };
    const label = $('span', submitBtn);
    const initial = label.textContent;
    submitBtn.classList.add('is-sending');
    label.textContent = 'Отправляем…';
    try {
      if (CONFIG.formEndpoint) {
        const r = await fetch(CONFIG.formEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(data),
        });
        if (!r.ok) throw new Error(String(r.status));
      } else {
        await new Promise((r) => setTimeout(r, 700)); // демо: заявка никуда не уходит
      }
      form.reset();
      form.hidden = true;
      formDone.hidden = false;
      $('.modal__box', modal).focus({ preventScroll: true });
    } catch (err) {
      const m = document.createElement('p');
      m.className = 'form__msg';
      m.textContent = 'Не получилось отправить. Позвоните нам: +7 (908) 033-66-88';
      submitBtn.after(m);
    } finally {
      submitBtn.classList.remove('is-sending');
      label.textContent = initial;
    }
  });

  /* ---------- Карта: загружается, когда до неё доходит прокрутка ---------- */
  const mapBox = $('.js-map');
  const mapSrc = `https://yandex.ru/map-widget/v1/?ll=${lon}%2C${lat}&z=16&pt=${lon}%2C${lat}%2Cpm2rdm&lang=ru_RU`;
  const mapIo = new IntersectionObserver((entries) => {
    if (!entries.some((en) => en.isIntersecting)) return;
    mapIo.disconnect();
    const f = document.createElement('iframe');
    f.src = mapSrc;
    f.title = 'Карта: LIPA, Москва, ул. Нижние Мнёвники, 9';
    f.loading = 'lazy';
    f.allowFullscreen = true;
    f.referrerPolicy = 'no-referrer-when-downgrade';
    mapBox.append(f);
  }, { rootMargin: '900px 0px' });
  mapIo.observe(mapBox);
  mapBox.addEventListener('click', () => mapBox.classList.add('is-active'));
  mapBox.addEventListener('mouseleave', () => mapBox.classList.remove('is-active'));

  /* ---------- Старт ---------- */
  measure();
  update(window.scrollY);
  requestAnimationFrame(frame);
  requestAnimationFrame(loaderTick);
})();
