// Scroll-linked motion. Every block floats up into place as it scrolls into view and drifts
// away as it leaves the top of the screen. Progress follows the scroll position itself
// (then is softened a little), so nothing pops in on a timer.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const damp = (k, dt) => 1 - Math.exp(-k * dt);

function splitLetters(el) {
  el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
  const chars = [];
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.ELEMENT_NODE) { walk(child); continue; }
      if (child.nodeType !== Node.TEXT_NODE) continue;
      const frag = document.createDocumentFragment();
      for (const part of child.textContent.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { frag.append(' '); continue; }
        const w = document.createElement('span');
        w.className = 'w';
        w.setAttribute('aria-hidden', 'true');
        for (const ch of part) {
          const c = document.createElement('span');
          c.className = 'c';
          c.textContent = ch;
          chars.push(c);
          w.append(c);
        }
        frag.append(w);
      }
      child.replaceWith(frag);
    }
  };
  walk(el);
  el.classList.add('split');
  return chars;
}

function docTop(el) {
  let y = 0;
  for (let n = el; n; n = n.offsetParent) y += n.offsetTop;
  return y;
}

export function createScrub({ headings, blocks, zoom = [], start = performance.now() }) {
  // blur filters are costly on tablets and phones; there the motion goes without them
  const touch = matchMedia('(hover: none), (pointer: coarse)').matches;
  const strata = document.getElementById('strata');
  const items = [];
  const all = [...new Set([...headings, ...blocks])].sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  );
  let heroOrder = 0;
  for (const el of all) {
    const chars = headings.includes(el) ? splitLetters(el) : null;
    const hero = !!el.closest('.hero');
    items.push({
      el,
      chars,
      hero,
      heroDelay: hero ? 150 + heroOrder++ * 120 : 0,
      horiz: !!el.closest('.strata__track'),
      pinned: !!el.closest('.strata__pin') && !el.closest('.strata__track'),
      zoom: zoom.includes(el),
      top: 0, h: 0, k: 0,
      e: 0, x: 0, ae: -1, ax: -1,
      ready: false,
    });
  }

  function measure() {
    for (const it of items) {
      it.top = docTop(it.el);
      it.h = it.el.offsetHeight;
    }
    // blocks that sit side by side on one row come in one after another
    const flow = items.filter((it) => !it.horiz && !it.pinned);
    flow.sort((a, b) => a.top - b.top);
    for (let i = 0; i < flow.length; i++) {
      const prev = flow[i - 1];
      flow[i].k = prev && Math.abs(flow[i].top - prev.top) < 24 ? prev.k + 1 : 0;
    }
  }

  function apply(it) {
    const e = easeOut(it.e);
    const x = it.x;
    if (Math.abs(it.ae - it.e) < 0.0004 && Math.abs(it.ax - x) < 0.0004) return;
    it.ae = it.e;
    it.ax = x;
    if (it.chars) {
      // the heading drifts away as a whole; its letters rise one after another
      it.el.style.transform = x > 0.0005 ? `perspective(1000px) translate3d(0, ${(-x * 140).toFixed(1)}px, ${(-x * 160).toFixed(1)}px) rotateX(${(-x * 12).toFixed(2)}deg)` : '';
      it.el.style.opacity = x > 0.0005 ? (1 - x).toFixed(3) : '';
      if (!touch) it.el.style.filter = x > 0.02 ? `blur(${(x * 8).toFixed(2)}px)` : '';
      const n = it.chars.length;
      const spread = 0.75;
      for (let i = 0; i < n; i++) {
        const c = clamp(it.e * (1 + spread) - (i / n) * spread, 0, 1);
        const ec = easeOut(c);
        const s = it.chars[i].style;
        if (ec > 0.999) {
          s.transform = '';
          s.opacity = '';
        } else {
          // each letter swings up out of its word, hinged at the baseline
          s.transform = `translate3d(0, ${((1 - ec) * 120).toFixed(1)}%, 0) rotateX(${((1 - ec) * -80).toFixed(1)}deg)`;
          s.opacity = ec.toFixed(3);
        }
      }
      return;
    }
    // rise up out of the depth: from far below, small, tipped back and blurred
    const d = 1 - e;
    const ty = d * 170 - x * 140;
    const tz = -d * 260 - x * 160;
    const rx = d * 22 - x * 12;
    const sc = it.zoom ? 0.86 + 0.14 * e : 1;
    const op = e * (1 - x);
    const settled = e > 0.999 && x < 0.0005;
    it.el.style.transform = settled
      ? ''
      : `perspective(1000px) translate3d(0, ${ty.toFixed(1)}px, ${tz.toFixed(1)}px) rotateX(${rx.toFixed(2)}deg) scale(${sc.toFixed(4)})`;
    it.el.style.opacity = settled ? '' : op.toFixed(3);
    if (!touch) {
      const b = d * 10 + x * 8;
      it.el.style.filter = b > 0.15 ? `blur(${b.toFixed(2)}px)` : '';
    }
  }

  function update(dt, now) {
    const vh = innerHeight, vw = innerWidth, sy = scrollY;
    const sr = strata.getBoundingClientRect();
    const strataIn = clamp((vh * 1.05 - sr.top) / (vh * 0.65), 0, 1);
    // the pinned screen's centre once the section starts scrolling away
    const strataOut = clamp((vh * 0.38 - (sr.bottom - vh * 0.5)) / (vh * 0.4), 0, 1);
    const k = damp(6, dt);
    for (const it of items) {
      let enter, exit = 0;
      if (it.horiz) {
        if (sr.bottom < -vh || sr.top > vh * 1.5) continue;
        const r = it.el.getBoundingClientRect();
        enter = Math.min(strataIn, clamp((vw * 1.05 - r.left) / (vw * 0.55), 0, 1));
        exit = strataOut;
      } else if (it.pinned) {
        if (sr.bottom < -vh || sr.top > vh * 1.5) continue;
        enter = clamp(strataIn - it.k * 0.15, 0, 1);
        exit = strataOut;
      } else {
        const top = it.top - sy;
        if (it.ready && (top > vh * 1.6 || top + it.h < -vh * 0.8)) continue;
        // floats in over the lower 60% of the screen, drifts off over the top 40%
        enter = clamp((vh * 1.05 - top) / (vh * 0.6) - it.k * 0.15, 0, 1);
        exit = clamp((vh * 0.3 - (top + it.h)) / (vh * 0.45), 0, 1);
      }
      if (it.hero) enter = Math.min(enter, clamp((now - start - it.heroDelay) / 1100, 0, 1));
      if (!it.ready) {
        // whatever is already on screen at load just shows (the opening screen still plays in)
        it.e = it.hero ? 0 : enter;
        it.x = exit;
        it.ready = true;
      } else {
        it.e += (enter - it.e) * k;
        it.x += (exit - it.x) * k;
      }
      apply(it);
    }
  }

  measure();
  new ResizeObserver(measure).observe(document.body);
  document.fonts?.ready.then(measure);
  return { update, measure };
}
