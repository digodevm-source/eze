import { reducedMotion, nf } from './utils.js'

/** Soft reveal on scroll; staggered groups; counters; comparison bars. */
export function initReveal() {
  const els = [...document.querySelectorAll('[data-reveal], .bar')]

  document.querySelectorAll('[data-reveal-group]').forEach((g) => {
    ;[...g.querySelectorAll('[data-reveal]')].forEach((el, i) => el.style.setProperty('--d', `${i * 0.08}s`))
  })
  // siblings revealed at the same moment get a gentle cascade too
  document.querySelectorAll('.section-head, .about__text, .faq__head, .contact__info').forEach((g) => {
    ;[...g.querySelectorAll(':scope > [data-reveal]')].forEach((el, i) => el.style.setProperty('--d', `${i * 0.07}s`))
  })

  if (!('IntersectionObserver' in window) || reducedMotion()) {
    els.forEach((el) => el.classList.add('is-in'))
    document.querySelectorAll('[data-count]').forEach((el) => (el.textContent = format(el, +el.dataset.count)))
    return
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        e.target.classList.add('is-in')
        io.unobserve(e.target)
        e.target.querySelectorAll?.('[data-count]').forEach(count)
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
  )
  els.forEach((el) => io.observe(el))
}

function format(el, v) {
  return el.dataset.format === 'space' ? nf.format(Math.round(v)) : String(Math.round(v))
}

function count(el) {
  const to = +el.dataset.count
  const dur = 1800
  const t0 = performance.now()
  const tick = (t) => {
    const k = Math.min(1, (t - t0) / dur)
    const e = 1 - Math.pow(1 - k, 4)
    el.textContent = format(el, to * e)
    if (k < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
