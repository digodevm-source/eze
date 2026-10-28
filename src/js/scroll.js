import Lenis from 'lenis'
import { reducedMotion } from './utils.js'

/**
 * Smooth wheel scrolling on desktop (touch scrolling stays native), anchor
 * links with header offset, and a tiny pub/sub for scroll-driven modules.
 */
export function initScroll() {
  const listeners = new Set()
  let lenis = null

  if (!reducedMotion()) {
    lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, smoothWheel: true, syncTouch: false })
    const raf = (t) => {
      lenis.raf(t)
      requestAnimationFrame(raf)
    }
    requestAnimationFrame(raf)
    lenis.on('scroll', () => listeners.forEach((fn) => fn(window.scrollY)))
  } else {
    window.addEventListener('scroll', () => listeners.forEach((fn) => fn(window.scrollY)), { passive: true })
  }

  const api = {
    lenis,
    on(fn) {
      listeners.add(fn)
      fn(window.scrollY)
      return () => listeners.delete(fn)
    },
    to(target, opts = {}) {
      const el = typeof target === 'string' ? document.querySelector(target) : target
      if (!el && target !== 0) return
      const offset = opts.offset ?? -parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h') || '76', 10) + 1
      if (lenis) lenis.scrollTo(el ?? 0, { offset, duration: opts.duration ?? 1.4, immediate: opts.immediate })
      else if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + offset, behavior: reducedMotion() ? 'auto' : 'smooth' })
      else window.scrollTo({ top: 0 })
    },
    stop() {
      lenis?.stop()
      document.documentElement.style.overflow = 'hidden'
    },
    start() {
      lenis?.start()
      document.documentElement.style.overflow = ''
    },
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]')
    if (!a) return
    const id = a.getAttribute('href')
    if (id === '#' || a.hasAttribute('data-policy')) return
    const el = id === '#top' ? null : document.querySelector(id)
    if (id !== '#top' && !el) return
    e.preventDefault()
    document.dispatchEvent(new CustomEvent('nav:go'))
    api.to(id === '#top' ? 0 : el, id === '#top' ? { offset: 0 } : {})
    history.replaceState(null, '', id === '#top' ? location.pathname : id)
  })

  return api
}
