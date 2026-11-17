// Lyric captions drawn on the 2D output canvas: each word blurs in when it is sung.
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const FONT = (px) => `700 ${px}px CormSC, serif`;

// words: [{ w, t0, t1 }]
export function drawCaption(ctx, words, t, opts = {}) {
  if (!words || !words.length) return;
  const size = opts.size || 96;
  const top = opts.top ?? 560;
  const maxW = opts.maxWidth || 940;
  const end = opts.end ?? words[words.length - 1].t1 + 0.3;
  const start = words[0].t0 - 0.12;
  if (t < start || t > end + 0.3) return;
  const out = clamp01((t - end) / 0.25);
  ctx.save();
  ctx.font = FONT(size);
  ctx.textBaseline = 'alphabetic';
  const space = size * 0.32;
  // wrap into lines
  const lines = [[]];
  let lw = 0;
  for (const w of words) {
    const ww = ctx.measureText(w.w).width;
    if (lw > 0 && lw + space + ww > maxW) { lines.push([]); lw = 0; }
    lines[lines.length - 1].push({ ...w, width: ww });
    lw += (lw > 0 ? space : 0) + ww;
  }
  const lh = size * 1.05;
  lines.forEach((line, li) => {
    const total = line.reduce((s, w) => s + w.width, 0) + space * (line.length - 1);
    let x = 540 - total / 2;
    const y = top + li * lh;
    for (const w of line) {
      const a = clamp01((t - w.t0 + 0.05) / 0.16);
      if (a <= 0) { x += w.width + space; continue; }
      const blur = (1 - a) * 12 + out * 10;
      const dy = (1 - a) * 22 - out * 14;
      const active = t >= w.t0 - 0.02 && t <= w.t1 + 0.05;
      const alpha = a * (1 - out);
      ctx.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : 'none';
      // glow
      ctx.shadowColor = opts.glow || 'rgba(255,205,160,0.75)';
      ctx.shadowBlur = active ? 28 : 16;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffffff';
      const sc = active ? 1.05 : 1;
      ctx.save();
      ctx.translate(x + w.width / 2, y + dy);
      ctx.scale(sc, sc);
      ctx.fillText(w.w, -w.width / 2, 0);
      ctx.restore();
      // faint reflection
      if (opts.reflect !== false && li === lines.length - 1) {
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = alpha * 0.1;
        ctx.filter = `blur(${(blur + 2.5).toFixed(1)}px)`;
        ctx.translate(x + w.width / 2, y + size * 0.22 + dy);
        ctx.scale(1, -0.75);
        ctx.fillText(w.w, -w.width / 2, 0);
        ctx.restore();
      }
      x += w.width + space;
    }
  });
  ctx.restore();
}
