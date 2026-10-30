import { reducedMotion } from './utils.js'

/** Animate <details> open/close height instead of the instant jump. */
export function initFaq() {
  document.querySelectorAll('.qa').forEach((d) => {
    const summary = d.querySelector('summary')
    const body = d.querySelector('.qa__body')
    let anim = null
    summary.addEventListener('click', (e) => {
      if (reducedMotion() || !body.animate) return
      e.preventDefault()
      anim?.cancel()
      if (d.open) {
        const h = body.offsetHeight
        anim = body.animate([{ height: `${h}px`, opacity: 1 }, { height: '0px', opacity: 0 }], {
          duration: 520,
          easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
        })
        d.classList.add('is-closing')
        anim.onfinish = () => {
          d.open = false
          d.classList.remove('is-closing')
        }
      } else {
        d.open = true
        const h = body.offsetHeight
        anim = body.animate([{ height: '0px', opacity: 0 }, { height: `${h}px`, opacity: 1 }], {
          duration: 620,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        })
      }
    })
  })
}
