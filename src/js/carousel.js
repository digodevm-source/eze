/** Native scroll-snap carousel with arrows, counter and mouse drag. */
export function initCarousel() {
  const root = document.querySelector('[data-carousel]')
  const nav = document.querySelector('[data-carousel-nav]')
  if (!root) return
  const track = root.querySelector('[data-track]')
  const items = [...track.children]
  const prev = nav?.querySelector('[data-prev]')
  const next = nav?.querySelector('[data-next]')
  const cur = nav?.querySelector('[data-current]')
  const total = nav?.querySelector('[data-total]')
  if (total) total.textContent = String(items.length).padStart(2, '0')

  const step = () => items[0].getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || '24')
  const index = () => Math.round(track.scrollLeft / step())

  const update = () => {
    const i = Math.min(items.length - 1, index())
    if (cur) cur.textContent = String(i + 1).padStart(2, '0')
    if (prev) prev.disabled = track.scrollLeft < 8
    if (next) next.disabled = track.scrollLeft > track.scrollWidth - track.clientWidth - 8
  }
  track.addEventListener('scroll', () => requestAnimationFrame(update), { passive: true })
  window.addEventListener('resize', update)
  update()

  prev?.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }))
  next?.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }))

  // drag with a mouse; touch uses native scrolling
  let down = false
  let moved = false
  let x0 = 0
  let s0 = 0
  track.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    down = true
    moved = false
    x0 = e.clientX
    s0 = track.scrollLeft
  })
  window.addEventListener('pointermove', (e) => {
    if (!down) return
    const dx = e.clientX - x0
    if (!moved && Math.abs(dx) > 6) {
      moved = true
      track.classList.add('is-dragging')
    }
    if (moved) track.scrollLeft = s0 - dx
  })
  window.addEventListener('pointerup', () => {
    if (!down) return
    down = false
    if (moved) {
      track.classList.remove('is-dragging')
      const i = Math.round(track.scrollLeft / step())
      track.scrollTo({ left: i * step(), behavior: 'smooth' })
      // swallow the click that follows a drag
      track.addEventListener('click', (ev) => ev.stopPropagation(), { capture: true, once: true })
    }
  })
}
