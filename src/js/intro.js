/** Reveal the hero once the display font and the hero image are ready, so the
 * first frame never shows a font swap or a half-loaded photo. */
export function initIntro() {
  const img = document.querySelector('.hero__img')
  const fonts = document.fonts ? document.fonts.ready : Promise.resolve()
  const image = img
    ? img.complete
      ? img.decode?.().catch(() => {}) ?? Promise.resolve()
      : new Promise((r) => {
          img.addEventListener('load', r, { once: true })
          img.addEventListener('error', r, { once: true })
        })
    : Promise.resolve()
  const timeout = new Promise((r) => setTimeout(r, 2600))
  return Promise.race([Promise.all([fonts, image]), timeout]).then(() => {
    requestAnimationFrame(() => document.documentElement.classList.add('is-loaded'))
  })
}
