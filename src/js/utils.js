export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))

export const lerp = (a, b, t) => a + (b - a) * t

export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** Run `fn` once, when `el` comes within `margin` of the viewport. */
export function whenNear(el, fn, margin = '400px') {
  if (!('IntersectionObserver' in window)) return fn()
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect()
        fn()
      }
    },
    { rootMargin: margin }
  )
  io.observe(el)
}

/** Tell a render loop whether its element is on screen. */
export function visibility(el, cb) {
  const io = new IntersectionObserver((entries) => cb(entries[0].isIntersecting), { rootMargin: '80px' })
  io.observe(el)
  return () => io.disconnect()
}

export const nf = new Intl.NumberFormat('ru-RU')

export function webglAvailable() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}
