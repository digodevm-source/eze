import { reducedMotion, visibility } from '../js/utils.js'

/**
 * Hero "2.5D": the Cycles render is displaced by its own depth pass, so the
 * house, the pines and the sky drift at different speeds with the pointer —
 * gently, a few pixels, never more. Plain WebGL1, no dependencies.
 */
const VERT = `
attribute vec2 p;
varying vec2 vUv;
void main() {
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uImage;
uniform sampler2D uDepth;
uniform vec2 uCover;   // uv scale for object-fit: cover
uniform vec2 uOffset;  // pointer offset, -1..1
uniform float uZoom;
uniform float uFocus;

void main() {
  vec2 uv = (vUv - 0.5) * uCover / uZoom + 0.5;
  // blur the depth a touch to avoid tearing at silhouettes
  float d = 0.0;
  vec2 px = vec2(0.0025);
  d += texture2D(uDepth, uv).r * 0.4;
  d += texture2D(uDepth, uv + vec2(px.x, 0.0)).r * 0.15;
  d += texture2D(uDepth, uv - vec2(px.x, 0.0)).r * 0.15;
  d += texture2D(uDepth, uv + vec2(0.0, px.y)).r * 0.15;
  d += texture2D(uDepth, uv - vec2(0.0, px.y)).r * 0.15;
  vec2 shift = uOffset * (d - uFocus) * 0.018;
  vec3 c = texture2D(uImage, uv + shift).rgb;
  gl_FragColor = vec4(c, 1.0);
}`

export function initHeroDepth(hero, scroll) {
  if (reducedMotion()) return
  const img = hero.querySelector('.hero__img')
  const canvas = hero.querySelector('[data-hero-canvas]')
  if (!img || !canvas) return
  const src = img.currentSrc || img.src
  if (!src) return
  const tall = src.includes('sosny_portrait')
  const depthSrc = `${import.meta.env.BASE_URL}img/${tall ? 'sosny_portrait' : 'sosny_hero'}_depth.webp`

  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false })
  if (!gl) return

  const load = (url) =>
    new Promise((res, rej) => {
      const i = new Image()
      i.decoding = 'async'
      i.onload = () => res(i)
      i.onerror = rej
      i.src = url
    })

  Promise.all([load(src), load(depthSrc)])
    .then(([image, depth]) => start(image, depth))
    .catch(() => {})

  function shader(type, code) {
    const s = gl.createShader(type)
    gl.shaderSource(s, code)
    gl.compileShader(s)
    return s
  }

  function texture(image, unit) {
    const t = gl.createTexture()
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return t
  }

  function start(image, depth) {
    const prog = gl.createProgram()
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    texture(image, 0)
    texture(depth, 1)
    const u = (n) => gl.getUniformLocation(prog, n)
    gl.uniform1i(u('uImage'), 0)
    gl.uniform1i(u('uDepth'), 1)
    gl.uniform1f(u('uFocus'), 0.45)
    const uCover = u('uCover')
    const uOffset = u('uOffset')
    const uZoom = u('uZoom')

    const aspect = image.naturalWidth / image.naturalHeight
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 1.75)
      const w = hero.clientWidth
      const h = hero.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      gl.viewport(0, 0, canvas.width, canvas.height)
      const ca = w / h
      // object-fit: cover, matching the CSS object-position of the <img>
      gl.uniform2f(uCover, ca > aspect ? 1 : ca / aspect, ca > aspect ? aspect / ca : 1)
    }
    window.addEventListener('resize', resize)
    resize()

    const touch = window.matchMedia('(hover: none)').matches
    let tx = 0
    let ty = 0
    let x = 0
    let y = 0
    if (!touch) {
      hero.addEventListener('pointermove', (e) => {
        const r = hero.getBoundingClientRect()
        tx = ((e.clientX - r.left) / r.width) * 2 - 1
        ty = ((e.clientY - r.top) / r.height) * 2 - 1
      })
      hero.addEventListener('pointerleave', () => {
        tx = 0
        ty = 0
      })
    }

    let progress = 0
    scroll.on((sy) => (progress = Math.min(1, sy / Math.max(1, hero.offsetHeight))))

    let visible = true
    visibility(hero, (v) => (visible = v))

    const t0 = performance.now()
    let first = true
    const frame = (now) => {
      requestAnimationFrame(frame)
      if (!visible) return
      const t = (now - t0) / 1000
      if (touch) {
        // no pointer on phones: a slow, barely perceptible drift
        tx = Math.sin(t * 0.21) * 0.6
        ty = Math.sin(t * 0.13 + 1.3) * 0.25
      }
      x += (tx - x) * 0.045
      y += (ty - y) * 0.045
      gl.uniform2f(uOffset, -x, y)
      gl.uniform1f(uZoom, 1.02 + progress * 0.05)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      if (first) {
        first = false
        // fade in once the <img> has finished its intro zoom (see CSS)
        setTimeout(() => canvas.classList.add('is-ready'), 2200)
      }
    }
    requestAnimationFrame(frame)
  }
}
