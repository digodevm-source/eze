import { createEngine, W, H } from './engine.js';
import { drawCaption } from './captions.js';
const params = new URLSearchParams(location.search);
const shotName = params.get('shot') || 'preview';
window.__ready = (async () => {
  await document.fonts.load('700 40px CormSC', 'АБВ');
  const glCanvas = document.createElement('canvas');
  glCanvas.width = W; glCanvas.height = H;
  const E = createEngine(glCanvas);
  const out = document.getElementById('out');
  const ctx = out.getContext('2d');
  const mod = await import(`./shots/${shotName}.js`);
  const shot = await mod.build(E, params);
  if (params.get('nobloom')) E.bloom.enabled = false;
  window.duration = shot.duration || 1;
  window.shotList = (shot.shots || []).map((s) => [s.t0, s.t1]);
  window.frame = (t, q = 0.93) => {
    shot.update(t);
    E.render(t, shot.world);
    ctx.drawImage(glCanvas, 0, 0);
    if (shot.overlay) shot.overlay(ctx, t, drawCaption);
    return out.toDataURL('image/jpeg', q);
  };
  return true;
})();
