import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

const root = path.dirname(new URL(import.meta.url).pathname)

/**
 * Tiny HTML templating used by index.html:
 *   <include src="partials/hero.html"></include>  -> file contents
 *   <x-img name="sosny_hero" alt="…" sizes="100vw" class="…" loading="lazy">
 *     -> <picture> with AVIF/WebP sources and a JPEG/PNG fallback, built from
 *        src/data/images.json (written by `npm run images`).
 */
function htmlPartials() {
  let base = '/'
  const manifestPath = path.join(root, 'src/data/images.json')

  const readManifest = () =>
    fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {}

  const attrs = (s) => {
    const out = {}
    for (const m of s.matchAll(/([\w-]+)="([^"]*)"/g)) out[m[1]] = m[2]
    return out
  }

  // art="sosny_portrait (max-aspect-ratio: 4/5)" adds a differently framed
  // image for a media query (the browser downloads only one of them)
  const artSources = (a, manifest) => {
    if (!a.art) return ''
    const [name, ...mq] = a.art.split(' ')
    const img = manifest[name]
    if (!img) return ''
    const media = mq.join(' ')
    const set = (fmt) => img.widths.map((w) => `${base}img/${name}-${w}.${fmt} ${w}w`).join(', ')
    return ['avif', 'webp', img.alpha ? 'png' : 'jpg']
      .map((fmt) => `<source media="${media}" type="image/${fmt === 'jpg' ? 'jpeg' : fmt}" srcset="${set(fmt)}" sizes="${a.sizes || '100vw'}">`)
      .join('')
  }

  const picture = (a, manifest) => {
    const img = manifest[a.name]
    if (!img) return `<!-- missing image ${a.name} -->`
    const set = (fmt) => img.widths.map((w) => `${base}img/${a.name}-${w}.${fmt} ${w}w`).join(', ')
    const fallback = img.alpha ? 'png' : 'jpg'
    const largest = img.widths[img.widths.length - 1]
    const mid = img.widths.find((w) => w >= 1280) || largest
    const sizes = a.sizes || '100vw'
    const extra = Object.entries(a)
      .filter(([k]) => !['name', 'alt', 'sizes', 'class', 'loading', 'fetchpriority', 'picture-class', 'art'].includes(k))
      .map(([k, v]) => ` ${k}="${v}"`)
      .join('')
    return (
      `<picture${a['picture-class'] ? ` class="${a['picture-class']}"` : ''}>` +
      artSources(a, manifest) +
      `<source type="image/avif" srcset="${set('avif')}" sizes="${sizes}">` +
      `<source type="image/webp" srcset="${set('webp')}" sizes="${sizes}">` +
      `<img src="${base}img/${a.name}-${mid}.${fallback}" srcset="${set(fallback)}" sizes="${sizes}"` +
      ` width="${img.width}" height="${img.height}" alt="${a.alt || ''}"` +
      `${a.class ? ` class="${a.class}"` : ''} loading="${a.loading || 'lazy'}" decoding="async"` +
      `${a.fetchpriority ? ` fetchpriority="${a.fetchpriority}"` : ''}${extra}>` +
      `</picture>`
    )
  }

  const expand = (html, depth = 0) => {
    if (depth > 5) return html
    html = html.replace(/<include src="([^"]+)"><\/include>/g, (_, src) =>
      expand(fs.readFileSync(path.join(root, src), 'utf8'), depth + 1)
    )
    return html
  }

  return {
    name: 'html-partials',
    configResolved(config) {
      base = config.base
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const manifest = readManifest()
        return expand(html).replace(/<x-img\s+([^>]*?)\/?>/g, (_, a) => picture(attrs(a), manifest))
      },
    },
    handleHotUpdate({ file, server }) {
      if (file.includes(`${path.sep}partials${path.sep}`) || file.endsWith('images.json')) {
        server.ws.send({ type: 'full-reload' })
      }
    },
  }
}

export default defineConfig({
  // relative paths: the build works from any folder or sub-path of a host
  base: './',
  plugins: [htmlPartials()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
})
