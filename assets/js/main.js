/* nightly: page behaviour
 *
 * 1. Films. Each film is a 60 fps H.264 loop. It is decoded with the
 *    browser's hardware video decoder (WebCodecs) and drawn on a canvas at
 *    exactly the right time, then the same loop is fed in again, so it never
 *    stops, never seeks and has no seam. This does not depend on video
 *    autoplay rules. Where WebCodecs is missing, a 25 fps looping animated
 *    image (AVIF, or WebP) is shown instead.
 * 2. Loader: a generative ring of fine lines drawn live while the first film
 *    downloads; the counter follows the real download progress.
 * 3. Smooth scrolling (Lenis), word-by-word reveals, a slight parallax on
 *    films, a running line of disciplines and a soft mouse cursor.
 * 4. Visitor's local time in the header and footer.
 */
(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // always start at the top so the opening sequence plays
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

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

  // fetch a file into memory, reporting progress (0..1) when the size is known
  async function fetchBuffer(url, onProgress) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const total = Number(res.headers.get('content-length')) || 0;
    if (!onProgress || !total || !res.body || !res.body.getReader) {
      const buffer = await res.arrayBuffer();
      if (onProgress) onProgress(1);
      return buffer;
    }
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      onProgress(Math.min(1, got / total));
    }
    const out = new Uint8Array(got);
    let at = 0;
    for (const c of chunks) { out.set(c, at); at += c.length; }
    onProgress(1);
    return out.buffer;
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
      const mp4 = readMp4(await fetchBuffer(this.src, this.onProgress));
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
        if (!this.shown) { this.shown = true; if (this.onReady) this.onReady(); }
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
      const ready = () => { if (this.onReady) this.onReady(); };
      img.addEventListener('load', ready, { once: true });
      img.addEventListener('error', ready, { once: true });
    }
  }

  const films = Array.from(document.querySelectorAll('[data-film]')).map((el) => new Film(el));
  const filmOf = new Map(films.map((f) => [f.el, f]));

  /* ------------------------------------------------------------------ */
  /* 2. Loader                                                           */
  /* ------------------------------------------------------------------ */

  const loader = document.querySelector('.loader');
  const loaderCount = document.querySelector('[data-loader-count]');
  const loaderBar = document.querySelector('[data-loader-bar]');
  const ringCanvas = document.querySelector('.loader__ring');
  const ringCtx = ringCanvas ? ringCanvas.getContext('2d') : null;
  const boot = { target: 0.06, shown: 0, filmReady: false, fontsReady: false, start: performance.now(), finished: 0 };

  const heroFilm = films.find((f) => 'eager' in f.el.dataset);
  if (heroFilm) {
    heroFilm.onProgress = (p) => { boot.target = Math.max(boot.target, 0.06 + p * 0.84); };
    heroFilm.onReady = () => { boot.filmReady = true; };
  } else {
    boot.filmReady = true;
  }
  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  fontsReady.then(() => { boot.fontsReady = true; });

  // a ribbon of short strokes around a slowly turning, breathing ring
  function drawRing(t) {
    if (!ringCtx) return;
    const c = ringCtx;
    const w = ringCanvas.width;
    const h = ringCanvas.height;
    const time = reduceMotion ? 0 : t;
    const R = w * 0.29;
    const band = w * 0.16;
    const N = 200;
    // mostly face-on like a ring in the hand: spins in its own plane and only tilts a little
    const az = time * 0.00035;
    const ay = Math.sin(time * 0.0005) * 0.55;
    const ax = Math.sin(time * 0.00037 + 1) * 0.45;
    const cosZ = Math.cos(az), sinZ = Math.sin(az);
    const cosY = Math.cos(ay), sinY = Math.sin(ay), cosX = Math.cos(ax), sinX = Math.sin(ax);
    c.clearRect(0, 0, w, h);
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(236, 235, 232, 0.4)';
    c.beginPath();
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      const wob = 1 + 0.07 * Math.sin(a * 3 + time * 0.0011);
      const px = Math.cos(a) * R * wob;
      const py = Math.sin(a) * R * wob;
      const pz = Math.sin(a * 2 + time * 0.0008) * R * 0.16;
      // strokes run across the band (mostly along the ring's axis), leaning a little as it breathes
      const tw = a * 1 + time * 0.0006;
      const lean = 0.3 * Math.sin(tw);
      const dx = Math.cos(a) * lean * band;
      const dy = Math.sin(a) * lean * band;
      const dz = (0.85 + 0.15 * Math.cos(tw)) * band;
      for (const sgn of [-1, 1]) {
        const x0 = px + sgn * dx, y0 = py + sgn * dy, z = pz + sgn * dz;
        const x = x0 * cosZ - y0 * sinZ;
        const y = x0 * sinZ + y0 * cosZ;
        const x1 = x * cosY + z * sinY;
        const z1 = -x * sinY + z * cosY;
        const y1 = y * cosX - z1 * sinX;
        if (sgn < 0) c.moveTo(w / 2 + x1, h / 2 + y1);
        else c.lineTo(w / 2 + x1, h / 2 + y1);
      }
    }
    c.stroke();
  }

  function tickLoader(time) {
    if (!loader) return;
    if (boot.finished && time - boot.finished > 1600) return; // faded out: stop drawing
    drawRing(time);
    if (boot.finished) return;
    const elapsed = time - boot.start;
    if ((boot.filmReady && boot.fontsReady && elapsed > 1500) || elapsed > 4500) boot.target = 1;
    boot.shown += (boot.target - boot.shown) * 0.085;
    if (boot.target === 1 && boot.shown > 0.996) {
      boot.shown = 1;
      boot.finished = time;
      setTimeout(() => {
        root.classList.add('is-ready');
        if (lenis) lenis.start();
      }, 300);
    }
    if (loaderCount) loaderCount.textContent = String(Math.round(boot.shown * 100)).padStart(2, '0');
    if (loaderBar) loaderBar.style.setProperty('--p', boot.shown.toFixed(4));
  }

  if (!loader) {
    Promise.race([fontsReady, new Promise((r) => setTimeout(r, 900))]).then(() => root.classList.add('is-ready'));
  }

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
  /* 3. Smooth scroll, reveals, parallax, running line, cursor           */
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
  if (lenis && loader && !root.classList.contains('is-ready')) lenis.stop();

  // wrap every word of [data-split] headings so they can rise one after another
  document.querySelectorAll('[data-split]').forEach((el) => {
    let i = 0;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const w = document.createElement('span');
            w.className = 'w';
            w.style.setProperty('--i', String(i++));
            w.textContent = part;
            frag.appendChild(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1) {
          walk(child);
        }
      });
    };
    walk(el);
  });

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

  // running line: drifts left, speeds up (or turns back) with the scroll
  const track = document.querySelector('[data-marquee]');
  const marquee = { x: 0, half: 0, vel: 0, visible: false };
  if (track) {
    track.innerHTML += track.innerHTML;
    const measure = () => { marquee.half = track.scrollWidth / 2; };
    measure();
    fontsReady.then(measure);
    window.addEventListener('resize', measure);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => { marquee.visible = entries[0].isIntersecting; }).observe(track);
    } else {
      marquee.visible = true;
    }
  }

  function tickMarquee(dt) {
    if (!track || !marquee.visible || reduceMotion || !marquee.half) return;
    const rem = parseFloat(getComputedStyle(root).fontSize) || 16;
    const scrollVel = lenis ? lenis.velocity || 0 : 0;
    marquee.vel += (scrollVel - marquee.vel) * 0.08;
    const speed = rem * 3.2 + marquee.vel * rem * 0.9; // px per second
    marquee.x -= speed * (dt / 1000);
    if (marquee.x <= -marquee.half) marquee.x += marquee.half;
    if (marquee.x > 0) marquee.x -= marquee.half;
    track.style.transform = 'translate3d(' + marquee.x.toFixed(2) + 'px,0,0)';
  }

  // soft cursor: a dot that follows the mouse and a ring that trails it
  const cursor = document.querySelector('.cursor');
  const pointer = { x: -100, y: -100, rx: -100, ry: -100, seen: false };
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  let cursorDot = null;
  let cursorRing = null;
  if (cursor && finePointer) {
    root.classList.add('has-cursor');
    cursor.classList.add('is-hidden');
    cursorDot = cursor.querySelector('.cursor__dot');
    cursorRing = cursor.querySelector('.cursor__ring');
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (!pointer.seen) { pointer.rx = pointer.x; pointer.ry = pointer.y; pointer.seen = true; }
      cursor.classList.remove('is-hidden');
      const link = e.target && e.target.closest ? e.target.closest('a, button') : null;
      cursor.classList.toggle('is-link', !!link);
    }, { passive: true });
    document.addEventListener('mouseleave', () => cursor.classList.add('is-hidden'));
    document.addEventListener('mouseenter', () => { if (pointer.seen) cursor.classList.remove('is-hidden'); });
  }

  function tickCursor() {
    if (!cursorDot || !pointer.seen) return;
    pointer.rx += (pointer.x - pointer.rx) * 0.16;
    pointer.ry += (pointer.y - pointer.ry) * 0.16;
    cursorDot.style.transform = 'translate3d(' + pointer.x + 'px,' + pointer.y + 'px,0)';
    cursorRing.style.transform = 'translate3d(' + pointer.rx.toFixed(2) + 'px,' + pointer.ry.toFixed(2) + 'px,0)';
  }

  let lastFrame = 0;
  function frame(time) {
    const dt = lastFrame ? Math.min(time - lastFrame, 100) : 16;
    lastFrame = time;
    if (lenis) lenis.raf(time);
    tickLoader(time);
    for (const f of films) f.tick(time);
    updateParallax();
    tickMarquee(dt);
    tickCursor();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ------------------------------------------------------------------ */
  /* 4. Local time                                                        */
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
})();
