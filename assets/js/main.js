/* nightly — page behaviour
 *
 * 1. Seamless loops. Each film is a short fragmented MP4 holding a whole
 *    number of loops. It is fed into a MediaSource again and again, end to
 *    end, so the video never seeks back to 0 and never stutters at the seam.
 *    Where MediaSource is missing or fails, a longer regular MP4 plays with
 *    the native `loop` attribute instead.
 * 2. Smooth scrolling (Lenis), soft reveals and a slight parallax on films.
 * 3. Visitor's local time in the header and footer.
 */
(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MS = window.ManagedMediaSource || window.MediaSource;

  /* ------------------------------------------------------------------ */
  /* 1. Seamless loops                                                   */
  /* ------------------------------------------------------------------ */

  // Split an MP4 into its init segment (ftyp + moov) and its media
  // (moof + mdat pairs); trailing boxes such as mfra are dropped.
  function splitMp4(buffer) {
    const view = new DataView(buffer);
    let pos = 0;
    let mediaStart = -1;
    let mediaEnd = -1;
    while (pos + 8 <= buffer.byteLength) {
      let size = view.getUint32(pos);
      const type = String.fromCharCode(
        view.getUint8(pos + 4), view.getUint8(pos + 5), view.getUint8(pos + 6), view.getUint8(pos + 7));
      if (size === 1) size = Number(view.getBigUint64(pos + 8));
      if (size === 0) size = buffer.byteLength - pos;
      if (size < 8) break;
      if (type === 'moof' && mediaStart < 0) mediaStart = pos;
      if (type === 'moof' || type === 'mdat') mediaEnd = pos + size;
      pos += size;
    }
    if (mediaStart <= 0 || mediaEnd <= mediaStart) return null;
    return { init: buffer.slice(0, mediaStart), media: buffer.slice(mediaStart, mediaEnd) };
  }

  function waitFor(target, event, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(event + ' timeout')), ms);
      target.addEventListener(event, () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }

  class SeamlessLoop {
    constructor(video) {
      this.video = video;
      this.segUrl = video.dataset.src;
      this.fullUrl = video.dataset.fallback;
      this.mime = video.dataset.mime;
      this.mode = null; // 'mse' | 'native'
      this.wanted = false; // in view, so it should be playing
      this.copies = 0; // copies appended so far
      this.length = 0; // seconds in one copy
      this.busy = false;

      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.disableRemotePlayback = true;
    }

    load() {
      if (this.mode) return;
      let canMse = false;
      try { canMse = !!(MS && this.mime && MS.isTypeSupported(this.mime)); } catch (e) { canMse = false; }
      if (canMse) this.startMse().catch(() => this.startNative());
      else this.startNative();
    }

    setWanted(on) {
      this.wanted = on;
      if (on) {
        this.load();
        this.play();
      } else if (!this.video.paused) {
        this.video.pause();
      }
    }

    play() {
      if (!this.wanted || !this.mode) return;
      const p = this.video.play();
      // Autoplay can be refused (e.g. iOS Low Power Mode); it is retried on the first touch.
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }

    async startMse() {
      this.mode = 'mse';
      const v = this.video;
      v.dataset.mode = 'mse';

      const res = await fetch(this.segUrl);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buffer = await res.arrayBuffer();
      if (this.mode !== 'mse') return;

      const parts = splitMp4(buffer) || { init: null, media: buffer };
      this.media = parts.media;

      const ms = new MS();
      this.ms = ms;
      const opened = waitFor(ms, 'sourceopen', 4000);
      const failed = new Promise((_, reject) => {
        this.onError = () => reject(new Error('media error'));
        v.addEventListener('error', this.onError, { once: true });
      });
      opened.catch(() => {});
      failed.catch(() => {});
      let attached = false;
      if (window.ManagedMediaSource && ms instanceof window.ManagedMediaSource && 'srcObject' in v) {
        try { v.srcObject = ms; attached = true; } catch (e) { attached = false; }
      }
      if (!attached) {
        this.objectUrl = URL.createObjectURL(ms);
        v.src = this.objectUrl;
      }
      await Promise.race([opened, failed]);

      const sb = ms.addSourceBuffer(this.mime);
      this.sb = sb;
      // "sequence" mode lets the browser place every copy right after the
      // previous one using the frames' own durations: exact to the frame.
      try { sb.mode = 'sequence'; this.sequence = true; } catch (e) { this.sequence = false; }

      if (parts.init) await this.op(() => sb.appendBuffer(parts.init));
      await this.appendCopy();
      const b = sb.buffered;
      this.length = b.length ? b.end(b.length - 1) - b.start(0) : 0;
      if (!(this.length > 0.1)) throw new Error('empty segment');

      await this.topUp();
      this.onTime = () => this.topUp();
      v.addEventListener('timeupdate', this.onTime);
      v.removeEventListener('error', this.onError);
      this.onError = () => this.startNative();
      v.addEventListener('error', this.onError);
      this.startWatchdog();
      this.play();
    }

    op(fn) {
      const sb = this.sb;
      return new Promise((resolve, reject) => {
        const done = (e) => {
          sb.removeEventListener('updateend', done);
          sb.removeEventListener('error', done);
          if (e.type === 'error') reject(new Error('SourceBuffer error'));
          else resolve();
        };
        sb.addEventListener('updateend', done);
        sb.addEventListener('error', done);
        try { fn(); } catch (err) {
          sb.removeEventListener('updateend', done);
          sb.removeEventListener('error', done);
          reject(err);
        }
      });
    }

    appendCopy() {
      return this.op(() => {
        if (!this.sequence && this.copies > 0) this.sb.timestampOffset = this.copies * this.length;
        this.sb.appendBuffer(this.media);
      }).then(() => { this.copies += 1; });
    }

    // Keep a few seconds queued ahead of the playhead, drop what has played.
    async topUp() {
      if (this.busy || this.mode !== 'mse' || !this.sb || this.sb.updating) return;
      if (!this.ms || this.ms.readyState !== 'open') return;
      this.busy = true;
      try {
        const sb = this.sb;
        const t = this.video.currentTime;
        const ahead = Math.max(4, this.length * 1.5);
        let b = sb.buffered;
        if (b.length && t - b.start(0) > ahead + 6) {
          await this.op(() => sb.remove(b.start(0), t - 3));
          b = sb.buffered;
        }
        let end = b.length ? b.end(b.length - 1) : 0;
        let guard = 0;
        while (end - t < ahead && guard < 6) {
          await this.appendCopy();
          b = sb.buffered;
          end = b.length ? b.end(b.length - 1) : 0;
          guard += 1;
        }
      } catch (err) {
        this.startNative();
      } finally {
        this.busy = false;
      }
    }

    // If playback is running but the picture stops moving, switch to the fallback.
    startWatchdog() {
      let last = -1;
      let stuck = 0;
      this.watchdog = setInterval(() => {
        const v = this.video;
        if (this.mode !== 'mse' || v.paused || document.hidden || !this.wanted) { stuck = 0; return; }
        if (v.currentTime === last) stuck += 1; else stuck = 0;
        last = v.currentTime;
        if (stuck === 2) this.topUp();
        if (stuck >= 5) this.startNative();
      }, 700);
    }

    teardown() {
      const v = this.video;
      clearInterval(this.watchdog);
      if (this.onTime) v.removeEventListener('timeupdate', this.onTime);
      if (this.onError) v.removeEventListener('error', this.onError);
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
      this.sb = null;
      this.ms = null;
      this.objectUrl = null;
    }

    startNative() {
      if (this.mode === 'native') return;
      this.teardown();
      this.mode = 'native';
      const v = this.video;
      v.dataset.mode = 'native';
      if ('srcObject' in v && v.srcObject) {
        try { v.srcObject = null; } catch (e) { /* not set */ }
      }
      v.loop = true;
      v.preload = 'auto';
      v.src = this.fullUrl;
      v.load();
      this.play();
    }
  }

  const loops = Array.from(document.querySelectorAll('video[data-loop]')).map((v) => new SeamlessLoop(v));
  const loopOf = new Map(loops.map((l) => [l.video, l]));

  if ('IntersectionObserver' in window) {
    // Start downloading a film well before it scrolls into view…
    const preload = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        loopOf.get(e.target).load();
        preload.unobserve(e.target);
      });
    }, { rootMargin: '150% 0px 150% 0px' });

    // …and play it only while it is near the screen, so it is already moving when it appears.
    const visible = new IntersectionObserver((entries) => {
      entries.forEach((e) => loopOf.get(e.target).setWanted(e.isIntersecting));
    }, { rootMargin: '25% 0px 25% 0px' });

    loops.forEach((l) => {
      if ('eager' in l.video.dataset) l.load();
      preload.observe(l.video);
      visible.observe(l.video);
    });
  } else {
    loops.forEach((l) => l.setWanted(true));
  }

  // Browsers that refused autoplay get another try on the first interaction.
  const retry = () => loops.forEach((l) => l.play());
  ['touchstart', 'pointerdown', 'keydown'].forEach((type) =>
    window.addEventListener(type, retry, { passive: true, once: true }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) retry(); });

  /* ------------------------------------------------------------------ */
  /* 2. Smooth scroll, reveals, parallax                                 */
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

  const wide = window.matchMedia('(min-width: 821px)');
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
    const on = wide.matches && !reduceMotion;
    for (const p of parallax) {
      if (!on) { p.el.style.transform = ''; continue; }
      const r = p.el.parentElement.getBoundingClientRect();
      if (r.bottom < -200 || r.top > h + 200) continue;
      // -1 when the plate is entering from below, +1 when it leaves at the top
      const progress = (h / 2 - (r.top + r.height / 2)) / (h / 2 + r.height / 2);
      const shift = Math.max(-1, Math.min(1, progress)) * 34 * p.k;
      p.el.style.transform = 'translate3d(0,' + shift.toFixed(2) + 'px,0)';
    }
  }

  function frame(time) {
    if (lenis) lenis.raf(time);
    updateParallax();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  wide.addEventListener && wide.addEventListener('change', () => { lastY = null; });

  /* ------------------------------------------------------------------ */
  /* 3. Local time                                                        */
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
