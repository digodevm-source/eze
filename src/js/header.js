/** Header: transparent over the hero, solid after it; hides while scrolling
 * down, returns on the way up. Mobile menu and current-section highlight. */
export function initHeader(scroll) {
  const header = document.querySelector('[data-header]')
  const hero = document.querySelector('[data-hero]')
  const burger = document.querySelector('[data-burger]')
  const menu = document.querySelector('[data-menu]')
  if (!header) return

  let last = 0
  let open = false
  scroll.on((y) => {
    const heroEnd = hero ? hero.offsetHeight - 80 : 80
    header.classList.toggle('is-solid', y > heroEnd)
    if (!open) header.classList.toggle('is-hidden', y > last && y > heroEnd + 200)
    last = y
  })

  const setOpen = (v) => {
    open = v
    document.documentElement.classList.toggle('menu-open', v)
    burger?.setAttribute('aria-expanded', String(v))
    burger?.setAttribute('aria-label', v ? 'Закрыть меню' : 'Открыть меню')
    if (v) {
      menu.hidden = false
      header.classList.remove('is-hidden')
      scroll.stop()
    } else {
      scroll.start()
      setTimeout(() => {
        if (!open) menu.hidden = true
      }, 900)
    }
  }

  burger?.addEventListener('click', () => setOpen(!open))
  document.addEventListener('nav:go', () => open && setOpen(false))
  document.addEventListener('keydown', (e) => e.key === 'Escape' && open && setOpen(false))

  // highlight the section in view
  const links = [...document.querySelectorAll('.nav a')]
  const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]))
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const a = map.get(e.target.id)
        if (a && e.isIntersecting) {
          links.forEach((l) => l.classList.toggle('is-current', l === a))
        }
      }
    },
    { rootMargin: '-45% 0px -50% 0px' }
  )
  map.forEach((_, id) => {
    const s = document.getElementById(id)
    if (s) io.observe(s)
  })
}
