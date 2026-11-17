// Render frames [from, to) of the film to an H.264 segment: node render.cjs from to out.mp4
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { start } = require('./server.js');
(async () => {
  const [from, to, out] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4]];
  const srv = await start(0);
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?shot=film`);
  await p.evaluate(() => window.__ready);
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', '30', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let f = from; f < to; f++) {
    const data = await p.evaluate((t) => window.frame(t, 0.94), f / 30);
    const buf = Buffer.from(data.split(',')[1], 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if ((f - from) % 20 === 0) console.log(`frame ${f} (${f - from + 1}/${to - from}) ${(((Date.now() - t0) / (f - from + 1)) / 1000).toFixed(2)} s/frame`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log('done', out, ((Date.now() - t0) / 1000).toFixed(0), 's');
  await b.close(); srv.close();
})();
