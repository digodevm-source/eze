import { clamp } from './utils.js'

const LABELS = ['Участок и проект', 'Фундамент', 'Стены', 'Перекрытие и кровля', 'Фасад и инженерия', 'Сдача дома']

/**
 * Maps the scroll position over the six steps to a continuous progress value
 * (0…6). The 3D scene subscribes via the `process:progress` event; the HUD and
 * step highlighting work without WebGL as well.
 */
export function initProcess(scroll) {
  const wrap = document.querySelector('[data-process]')
  if (!wrap) return
  const steps = [...wrap.querySelectorAll('[data-step]')]
  const hudStep = wrap.querySelector('[data-hud-step]')
  const hudLabel = wrap.querySelector('[data-hud-label]')
  const hudBar = wrap.querySelector('[data-hud-bar]')
  let active = -1
  let raf = 0

  const measure = () => {
    raf = 0
    const vh = window.innerHeight
    const mobile = window.innerWidth < 900
    const line = mobile ? vh * 0.72 : vh * 0.55
    let progress = 0
    for (let i = 0; i < steps.length; i++) {
      const r = steps[i].getBoundingClientRect()
      if (r.top <= line) progress = i + clamp((line - r.top) / r.height)
    }
    progress = clamp(progress, 0, steps.length)
    const idx = Math.min(steps.length - 1, Math.floor(progress))
    if (idx !== active) {
      active = idx
      steps.forEach((s, k) => s.classList.toggle('is-active', k === idx))
      if (hudStep) hudStep.textContent = String(idx + 1).padStart(2, '0')
      if (hudLabel) hudLabel.textContent = LABELS[idx]
    }
    if (hudBar) hudBar.style.transform = `scaleX(${progress / steps.length})`
    wrap.dispatchEvent(new CustomEvent('process:progress', { detail: progress }))
  }

  scroll.on(() => {
    if (!raf) raf = requestAnimationFrame(measure)
  })
  window.addEventListener('resize', () => {
    if (!raf) raf = requestAnimationFrame(measure)
  })
  measure()
}
