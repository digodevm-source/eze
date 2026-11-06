/* nightly: page behaviour
 *
 * 1. Films. Each film is a 60 fps H.264 loop. It is decoded with the
 *    browser's hardware video decoder (WebCodecs) and drawn on a canvas at
 *    exactly the right time, then the same loop is fed in again, so it never
 *    stops, never seeks and has no seam. This does not depend on video
 *    autoplay rules. Where WebCodecs is missing, a 25 fps looping animated
 *    image (AVIF, or WebP) is shown instead.
 * 2. Smooth scrolling (Lenis), soft reveals and a slight parallax on films.
 * 3. Visitor's local time in the header and footer.
 */
(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------ */
  /* 1. Films                                                            */
  /* ------------------------------------------------------------------ */

  const FPS = 60;
  const AHEAD = 5; // decoded frames kept ready ahead of the playhead

  // Minimal MP4 reader: finds the H.264 track, its decoder config and every sample.
  function boxes(view, start, end) {
    const out = [];
    let p = start;
    while (p + 8 <= end) {
      let size = view.getUint32(p);
      let head = 8;
      const type = String.fromCharCode(view.getUint8(p + 4), view.getUint8(p + 5), view.getUint8(p + 6), view.getUint8(p + 7));
      if (size === 1) { size = Number(view.getBigUint64(p + 8)); head = 16; }
      else if (size === 0) size = end - p;
      if (size < head || p + size > end) break;
      out.push({ type, start: p, end: p + size, body: p + head });
      p += size;
    }
    return out;
  }

  function child(view, box, type, skip = 0) {
    return boxes(view, box.body + skip, box.end).find((b) => b.type === type) || null;
  }

  function readMp4(buffer) {
    const view = new DataView(buffer);
    const moov = boxes(view, 0, buffer.byteLength).find((b) => b.type === 'moov');
    if (!moov) throw new Error('no moov');
    for (const trak of boxes(view, moov.body, moov.end).filter((b) => b.type === 'trak')) {
      const mdia = child(view, trak, 'mdia');
      const minf = mdia && child(view, mdia, 'minf');
      const stbl = minf && child(view, minf, 'stbl');
      const stsd = stbl && child(view, stbl, 'stsd');
      if (!stsd) continue;
      const avc = boxes(view, stsd.body + 8, stsd.end).find((b) => b.type === 'avc1' || b.type === 'avc3');
      if (!avc) continue;
      const avcC = child(view, avc, 'avcC', 78);
      if (!avcC) continue;

      const description = new Uint8Array(buffer, avcC.body, avcC.end - avcC.body);
      const hex = (i) => description[i].toString(16).padStart(2, '0');
      const codec = 'avc1.' + hex(1) + hex(2) + hex(3);
      const width = view.getUint16(avc.body + 24);
      const height = view.getUint16(avc.body + 26);

      const stsz = child(view, stbl, 'stsz');
      const stsc = child(view, stbl, 'stsc');
      const stco = child(view, stbl, 'stco');
      const co64 = child(view, stbl, 'co64');
      const stss = child(view, stbl, 'stss');
      if (!stsz || !stsc || !(stco || co64)) throw new Error('no sample table');

      const fixed = view.getUint32(stsz.body + 4);
      const count = view.getUint32(stsz.body + 8);
      const sizes = [];
      for (let i = 0; i < count; i++) sizes.push(fixed || view.getUint32(stsz.body + 12 + i * 4));

      const offsets = [];
      if (stco) {
        const n = view.getUint32(stco.body + 4);
        for (let i = 0; i < n; i++) offsets.push(view.getUint32(stco.body + 8 + i * 4));
      } else {
        const n = view.getUint32(co64.body + 4);
        for (let i = 0; i < n; i++) offsets.push(Number(view.getBigUint64(co64.body + 8 + i * 8)));
      }

      const runs = [];
      const nRuns = view.getUint32(stsc.body + 4);
      for (let i = 0; i < nRuns; i++) {
        const b = stsc.body + 8 + i * 12;
        runs.push({ first: view.getUint32(b), per: view.getUint32(b + 4) });
      }

      const keys = new Set();
      if (stss) {
        const n = view.getUint32(stss.body + 4);
        for (let i = 0; i < n; i++) keys.add(view.getUint32(stss.body + 8 + i * 4) - 1);
      }

      const samples = [];
      let s = 0;
      for (let r = 0; r < runs.length; r++) {
        const lastChunk = r + 1 < runs.length ? runs[r + 1].first - 1 : offsets.length;
        for (let c = runs[r].first; c <= lastChunk && s < count; c++) {
          let off = offsets[c - 1];
          for (let k = 0; k < runs[r].per && s < count; k++, s++) {
            samples.push({ offset: off, size: sizes[s], key: stss ? keys.has(s) : true });
            off += sizes[s];
          }
        }
      }
      if (!samples.length || !samples[0].key) throw new Error('bad samples');
      return { codec, description, width, height, samples, data: new Uint8Array(buffer) };
    }
    throw new Error('no H.264 track');
  }

  class Film {
    constructor(el) {
      this.el = el;
      this.src = el.dataset.film;
      this.anim = el.dataset.anim;
      this.state = 'idle'; // idle | loading | playing | image
      this.visible = false;
      this.queue = []; // decoded frames waiting for their moment
      this.next = 0; // next sample to decode
      this.loop = 0; // how many times the loop has been fed in
      this.clock = 0; // playback time in microseconds (only runs while visible)
      this.last = 0;
      this.errors = 0;
    }

    load() {
      if (this.state !== 'idle') return;
      this.state = 'loading';
      this.start().catch(() => this.useImage());
    }

    async start() {
      if (!('VideoDecoder' in window) || !('EncodedVideoChunk' in window)) throw new Error('no WebCodecs');
      const res = await fetch(this.src);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const mp4 = readMp4(await res.arrayBuffer());
      this.config = {
        codec: mp4.codec,
        description: mp4.description,
        codedWidth: mp4.width,
        codedHeight: mp4.height,
        optimizeForLatency: true,
      };
      const support = await VideoDecoder.isConfigSupported(this.config);
      if (!support || !support.supported) throw new Error('codec not supported');
      this.mp4 = mp4;
      this.frameUs = 1e6 / FPS;
      this.loopUs = mp4.samples.length * this.frameUs;

      const canvas = document.createElement('canvas');
      canvas.width = mp4.width;
      canvas.height = mp4.height;
      canvas.className = 'film__media';
      canvas.setAttribute('aria-hidden', 'true');
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.ctx.fillStyle = '#000';
      this.ctx.fillRect(0, 0, canvas.width, canvas.height);
      this.canvas = canvas;

      this.makeDecoder();
      this.state = 'playing';
      this.el.dataset.mode = 'canvas';
      this.el.appendChild(canvas);
      this.feed();
    }

    makeDecoder() {
      this.decoder = new VideoDecoder({
        output: (frame) => {
          if (this.state === 'playing') this.queue.push(frame);
          else frame.close();
        },
        error: () => this.recover(),
      });
      this.decoder.configure(this.config);
    }

    // The decoder can be lost (e.g. reclaimed in a background tab): start it again.
    recover() {
      if (this.state !== 'playing') { this.useImage(); return; }
      this.errors += 1;
      this.dropQueue();
      try { if (this.decoder.state !== 'closed') this.decoder.close(); } catch (e) { /* already closed */ }
      if (this.errors > 4) { this.useImage(); return; }
      try {
        this.makeDecoder();
        this.loop = Math.floor(this.clock / this.loopUs) + 1;
        this.next = 0;
        this.clock = Math.round(this.loop * this.loopUs);
        this.feed();
      } catch (e) {
        this.useImage();
      }
    }

    feed() {
      const d = this.decoder;
      if (!d || d.state !== 'configured') return;
      const samples = this.mp4.samples;
      while (this.queue.length + d.decodeQueueSize < AHEAD) {
        const i = this.next;
        const sample = samples[i];
        d.decode(new EncodedVideoChunk({
          type: sample.key ? 'key' : 'delta',
          timestamp: Math.round((this.loop * samples.length + i) * this.frameUs),
          duration: Math.round(this.frameUs),
          data: this.mp4.data.subarray(sample.offset, sample.offset + sample.size),
        }));
        this.next = i + 1;
        if (this.next === samples.length) { this.next = 0; this.loop += 1; }
      }
    }

    tick(now) {
      if (this.state !== 'playing') return;
      const dt = this.last ? Math.min(now - this.last, 100) : 0;
      this.last = now;
      if (!this.visible) return; // the clock waits while the film is off screen
      this.clock += dt * 1000;

      // show the newest frame that is due; frames already late are skipped
      let due = null;
      while (this.queue.length && this.queue[0].timestamp <= this.clock + 2000) {
        if (due) due.close();
        due = this.queue.shift();
      }
      if (due) {
        this.ctx.drawImage(due, 0, 0, this.canvas.width, this.canvas.height);
        due.close();
      }
      this.feed();
    }

    dropQueue() {
      this.queue.forEach((f) => f.close());
      this.queue = [];
    }

    useImage() {
      if (this.state === 'image') return;
      this.state = 'image';
      this.el.dataset.mode = 'image';
      this.dropQueue();
      try { if (this.decoder && this.decoder.state !== 'closed') this.decoder.close(); } catch (e) { /* closed */ }
      if (this.canvas) this.canvas.remove();
      const picture = document.createElement('picture');
      const source = document.createElement('source');
      source.type = 'image/avif';
      source.srcset = this.anim + '.avif';
      const img = document.createElement('img');
      img.className = 'film__media';
      img.src = this.anim + '.webp';
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      picture.append(source, img);
      this.el.appendChild(picture);
    }
  }

  const films = Array.from(document.querySelectorAll('[data-film]')).map((el) => new Film(el));
  const filmOf = new Map(films.map((f) => [f.el, f]));

  if ('IntersectionObserver' in window) {
    // download a film well before it scrolls into view…
    const preload = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        filmOf.get(e.target).load();
        preload.unobserve(e.target);
      });
    }, { rootMargin: '150% 0px 150% 0px' });
    // …and run its clock only while it is on screen
    const onScreen = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const film = filmOf.get(e.target);
        film.visible = e.isIntersecting;
        if (film.visible) film.load();
      });
    }, { rootMargin: '10% 0px 10% 0px' });
    films.forEach((f) => {
      if ('eager' in f.el.dataset) f.load();
      preload.observe(f.el);
      onScreen.observe(f.el);
    });
  } else {
    films.forEach((f) => { f.visible = true; f.load(); });
  }

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
    const rem = parseFloat(getComputedStyle(root).fontSize) || 16;
    for (const p of parallax) {
      const r = p.el.parentElement.getBoundingClientRect();
      if (r.bottom < -200 || r.top > h + 200) continue;
      // -1 when the plate is entering from below, +1 when it leaves at the top
      const progress = (h / 2 - (r.top + r.height / 2)) / (h / 2 + r.height / 2);
      const shift = Math.max(-1, Math.min(1, progress)) * 2.1 * rem * p.k;
      p.el.style.transform = 'translate3d(0,' + shift.toFixed(2) + 'px,0)';
    }
  }

  function frame(time) {
    if (lenis) lenis.raf(time);
    for (const f of films) f.tick(time);
    updateParallax();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

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
