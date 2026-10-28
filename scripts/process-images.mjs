/**
 * Turns the 16-bit Blender renders in 3d/out into responsive web images:
 *   public/img/<name>-<width>.{avif,webp,jpg|png}
 * and writes src/data/images.json (used by the <x-img> macro and drawers).
 *
 *   npm run images            # process everything that has a source render
 *   npm run images -- sever   # only names containing "sever"
 */
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const SRC = path.join(root, '3d/out')
const OUT = path.join(root, 'public/img')
const MANIFEST = path.join(root, 'src/data/images.json')
fs.mkdirSync(OUT, { recursive: true })

const only = process.argv[2]

// crop: fractions of the source (left, top, width, height)
const JOBS = [
  { name: 'sosny_hero', src: 'sosny_hero.png', widths: [960, 1440, 1920, 2560] },
  { name: 'sosny_portrait', src: 'sosny_portrait.png', widths: [640, 828, 1080] },
  { name: 'sosny_card', src: 'sosny_hero.png', crop: [0.16, 0.0, 0.75, 1.0], aspect: 4 / 3, widths: [640, 960, 1440] },
  { name: 'interior', src: 'interior.png', widths: [800, 1200, 1800] },
  { name: 'linia', src: 'linia.png', widths: [640, 960, 1440] },
  { name: 'sever', src: 'sever.png', widths: [640, 960, 1440] },
  { name: 'terrasa', src: 'terrasa.png', widths: [640, 960, 1440] },
  { name: 'construction', src: 'construction.png', widths: [800, 1200, 1800] },
  { name: 'block_macro', src: 'block_macro.png', widths: [960, 1440, 1800] },
  { name: 'block_stack', src: 'block_stack.png', widths: [800, 1200, 1800] },
  { name: 'block_wall', src: 'block_wall.png', alpha: true, widths: [480, 720, 1000] },
  { name: 'block_wall300', src: 'block_wall300.png', alpha: true, widths: [480, 720, 1000] },
  { name: 'block_partition', src: 'block_partition.png', alpha: true, widths: [480, 720, 1000] },
  { name: 'block_ublock', src: 'block_ublock.png', alpha: true, widths: [480, 720, 1000] },
]

const DEPTH = [
  { name: 'sosny_hero_depth', src: 'sosny_hero_depth_0001.png', width: 1280 },
  { name: 'sosny_portrait_depth', src: 'sosny_portrait_depth_0001.png', width: 720 },
]

const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {}

async function source(job) {
  const file = path.join(SRC, job.src)
  let img = sharp(file, { limitInputPixels: false })
  const meta = await img.metadata()
  let { width, height } = meta
  if (job.crop) {
    const [l, t, w, h] = job.crop
    let cw = Math.round(width * w)
    let ch = Math.round(height * h)
    if (job.aspect) {
      if (cw / ch > job.aspect) cw = Math.round(ch * job.aspect)
      else ch = Math.round(cw / job.aspect)
    }
    const left = Math.min(width - cw, Math.round(width * l))
    const top = Math.min(height - ch, Math.round(height * t))
    img = img.extract({ left, top, width: cw, height: ch })
    width = cw
    height = ch
  }
  if (job.alpha) {
    // trim transparent margins, then pad evenly so every product sits alike
    const buf = await img.png().toBuffer()
    const trimmed = sharp(buf).trim({ threshold: 2 })
    const tb = await trimmed.png().toBuffer({ resolveWithObject: true })
    const pad = Math.round(Math.max(tb.info.width, tb.info.height) * 0.06)
    const padded = await sharp(tb.data)
      .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer({ resolveWithObject: true })
    return { buf: padded.data, width: padded.info.width, height: padded.info.height }
  }
  // 16-bit → 8-bit with a whisper of noise to avoid banding in skies and backdrops
  const raw = await img.removeAlpha().toColourspace('rgb16').raw({ depth: 'ushort' }).toBuffer({ resolveWithObject: true })
  const px = new Uint16Array(raw.data.buffer, raw.data.byteOffset, raw.data.length / 2)
  const out = Buffer.alloc(px.length)
  let seed = 1234567
  for (let i = 0; i < px.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const n = (seed / 4294967296 - 0.5) * 0.9
    out[i] = Math.max(0, Math.min(255, Math.round(px[i] / 257 + n)))
  }
  const buf = await sharp(out, { raw: { width: raw.info.width, height: raw.info.height, channels: 3 } })
    .png({ compressionLevel: 1 })
    .toBuffer()
  return { buf, width, height }
}

async function run(job) {
  const file = path.join(SRC, job.src)
  if (!fs.existsSync(file)) return console.log(`· skip ${job.name} (no ${job.src})`)
  const { buf, width, height } = await source(job)
  const widths = job.widths.filter((w) => w <= width)
  if (!widths.length || widths[widths.length - 1] < Math.min(width, job.widths[job.widths.length - 1])) widths.push(width)
  const ratio = height / width
  for (const w of widths) {
    const base = sharp(buf).resize({ width: w, kernel: 'lanczos3' })
    const stem = path.join(OUT, `${job.name}-${w}`)
    await base.clone().avif({ quality: job.alpha ? 60 : 56, effort: 5, chromaSubsampling: '4:4:4' }).toFile(`${stem}.avif`)
    await base.clone().webp({ quality: job.alpha ? 86 : 82, alphaQuality: 90, effort: 5 }).toFile(`${stem}.webp`)
    if (job.alpha) await base.clone().png({ compressionLevel: 9, palette: true, quality: 92, dither: 0.6 }).toFile(`${stem}.png`)
    else await base.clone().jpeg({ quality: 84, mozjpeg: true, chromaSubsampling: '4:4:4' }).toFile(`${stem}.jpg`)
  }
  const largest = widths[widths.length - 1]
  manifest[job.name] = { widths, width: largest, height: Math.round(largest * ratio), alpha: !!job.alpha }
  console.log(`✓ ${job.name} ${widths.join(', ')}`)
}

async function depth(d) {
  const file = path.join(SRC, d.src)
  if (!fs.existsSync(file)) return console.log(`· skip ${d.name}`)
  await sharp(file)
    .toColourspace('b-w')
    .resize({ width: d.width })
    .blur(1.2)
    .webp({ quality: 92 })
    .toFile(path.join(OUT, `${d.name}.webp`))
  console.log(`✓ ${d.name}`)
}

for (const job of JOBS) if (!only || job.name.includes(only)) await run(job)
for (const d of DEPTH) if (!only || d.name.includes(only)) await depth(d)

// social preview
const og = path.join(SRC, 'sosny_hero.png')
if (fs.existsSync(og) && (!only || 'og'.includes(only) || 'sosny_hero'.includes(only))) {
  await sharp(og).resize({ width: 1200, height: 630, fit: 'cover', position: 'centre' }).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(OUT, 'og.jpg'))
  console.log('✓ og.jpg')
}

const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)))
fs.writeFileSync(MANIFEST, JSON.stringify(sorted, null, 2) + '\n')
