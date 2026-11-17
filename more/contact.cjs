// Render one frame per shot (at fraction f of each shot) and save JPEGs: node contact.cjs outdir [f] [only]
const fs = require('fs');
const { chromium } = require('playwright');
const { start } = require('./server.js');
(async () => {
  const [outdir, f = '0.5', only = ''] = process.argv.slice(2);
  fs.mkdirSync(outdir, { recursive: true });
  const srv = await start(0);
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on('console', (m) => { const s = m.text(); if (!s.includes('GL Driver')) console.log('[page]', s); });
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?shot=film`);
  await p.evaluate(() => window.__ready);
  const list = await p.evaluate(() => window.shotList);
  const sel = only ? only.split(',').map(Number) : list.map((_, i) => i);
  for (const i of sel) {
    const [t0, t1] = list[i];
    for (const ff of f.split(',').map(Number)) {
      const t = t0 + (t1 - t0) * ff;
      const t_ = Date.now();
      const data = await p.evaluate((tt) => window.frame(tt, 0.9), t);
      fs.writeFileSync(`${outdir}/s${String(i).padStart(2, '0')}_${ff}.jpg`, Buffer.from(data.split(',')[1], 'base64'));
      console.log('shot', i, 't', t.toFixed(2), 'ms', Date.now() - t_);
    }
  }
  await b.close(); srv.close();
})();
