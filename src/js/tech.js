/** Technology section: the property list drives the 3D block viewer. */
export function initTech() {
  const list = document.querySelector('[data-points]')
  const viewer = document.querySelector('[data-block-viewer]')
  if (!list) return
  const items = [...list.querySelectorAll('[data-point]')]
  const select = (i) => {
    items.forEach((li, k) => {
      li.classList.toggle('is-active', k === i)
      li.querySelector('button').setAttribute('aria-pressed', String(k === i))
    })
    viewer?.dispatchEvent(new CustomEvent('tech:point', { detail: i }))
  }
  items.forEach((li, i) => li.querySelector('button').addEventListener('click', () => select(i)))
}
