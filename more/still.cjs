// Render a single frame to JPEG: node still.cjs "shot=preview&view=wide" out.jpg [t]
const fs = require('fs');
const { chromium } = require('playwright');
const { start } = require('./server.js');
(async () => {
  const [query, out, t = '0'] = process.argv.slice(2);
  const srv = await start(0);
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on('console', (m) => { const s = m.text(); if (!s.includes('GL Driver')) console.log('[page]', s); });
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?${query}`);
  await p.evaluate(() => window.__ready);
  const times = String(t).split(',').map(Number);
  for (let i = 0; i < times.length; i++) {
    const t0 = Date.now();
    const data = await p.evaluate((tt) => window.frame(tt, 0.95), times[i]);
    const file = times.length > 1 ? out.replace(/(\.\w+)$/, `_${i}$1`) : out;
    fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
    console.log('frame', times[i], 'ms', Date.now() - t0, '->', file);
  }
  await b.close(); srv.close();
})();
