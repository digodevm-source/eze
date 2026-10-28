import { projects } from '../data/projects.js'
import { articles } from '../data/articles.js'
import images from '../data/images.json'
import { planSVG } from './plan.js'

const money = (v) => `${v.toFixed(1).replace('.', ',')} млн ₽`

export function picture(name, alt = '', sizes = '(min-width: 920px) 920px, 100vw') {
  const img = images[name]
  if (!img) return ''
  const set = (fmt) => img.widths.map((w) => `${import.meta.env.BASE_URL}img/${name}-${w}.${fmt} ${w}w`).join(', ')
  const mid = img.widths.find((w) => w >= 1280) || img.widths[img.widths.length - 1]
  return `<picture><source type="image/avif" srcset="${set('avif')}" sizes="${sizes}"><source type="image/webp" srcset="${set('webp')}" sizes="${sizes}"><img src="${import.meta.env.BASE_URL}img/${name}-${mid}.jpg" srcset="${set('jpg')}" sizes="${sizes}" width="${img.width}" height="${img.height}" alt="${alt}" decoding="async"></picture>`
}

function projectHTML(id) {
  const p = projects[id]
  const plans = p.plans.map((pl) => planSVG(pl))
  const tabs =
    p.plans.length > 1
      ? `<div class="plan__tabs" role="tablist">${p.plans
          .map((pl, i) => `<button type="button" role="tab" aria-selected="${i === 0}" data-plan-tab="${i}">${pl.label}</button>`)
          .join('')}</div>`
      : ''
  return `
    <figure class="pd__media">${picture(p.image, `Дом «${p.name}»`)}</figure>
    <header class="pd__head">
      <p class="eyebrow">Проект дома</p>
      <h2 class="pd__title" id="project-title">«${p.name}»</h2>
      <p class="pd__tagline">${p.tagline}</p>
    </header>
    <dl class="pd__specs">${p.specs.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    <section class="pd__section">
      <h3>О доме</h3>
      <div class="pd__text">${p.text.map((t) => `<p>${t}</p>`).join('')}</div>
    </section>
    <section class="pd__section">
      <h3>Планировка</h3>
      <div class="plan">${tabs}<div data-plan-view>${plans[0].svg}</div></div>
    </section>
    <section class="pd__section">
      <h3>Стоимость</h3>
      <div class="packages">
        <div class="package"><p class="package__name">Тёплый контур</p><p class="package__price">${money(p.prices[0])}</p><p>Фундамент, стены, перекрытия, кровля, окна и входная дверь.</p></div>
        <div class="package"><p class="package__name">White box</p><p class="package__price">${money(p.prices[1])}</p><p>Плюс инженерные системы, стяжки, штукатурка стен и фасад.</p></div>
        <div class="package package--accent"><p class="package__name">Под ключ</p><p class="package__price">${money(p.prices[2])}</p><p>Плюс чистовая отделка по дизайн-проекту, сантехника и свет.</p></div>
      </div>
    </section>
    <div class="pd__cta">
      <a class="btn btn--solid" href="#contact" data-interest="Строительство дома" data-message-text="Интересует проект «${p.name}»">Получить смету</a>
      <p class="pd__text">Цены — ориентировочные для участка без сложных грунтов. Точную смету фиксируем после выезда инженера.</p>
    </div>`
}

function articleHTML(id) {
  const a = articles[id]
  return `
    <figure class="article__media">${picture(a.image, '', '(min-width: 780px) 780px, 100vw')}</figure>
    <p class="eyebrow">${a.tag} · ${a.time}</p>
    <h2 class="article__title" id="article-title">${a.title}</h2>
    <p class="article__lead">${a.lead}</p>
    ${a.body}
    <p><a href="#contact" data-interest="Строительство дома">Задать вопрос инженеру</a></p>`
}

export function initDrawers(scroll) {
  const pd = document.querySelector('[data-project-dialog]')
  const ad = document.querySelector('[data-article-dialog]')
  const po = document.querySelector('[data-policy-dialog]')
  let lastFocus = null

  const open = (dlg) => {
    lastFocus = document.activeElement
    dlg.showModal()
    dlg.querySelector('.drawer__panel').scrollTop = 0
    scroll.stop()
    requestAnimationFrame(() => requestAnimationFrame(() => dlg.classList.add('is-open')))
  }

  const close = (dlg, then) => {
    if (!dlg.open) return then?.()
    dlg.classList.remove('is-open')
    setTimeout(() => {
      dlg.close()
      scroll.start()
      if (then) then()
      else lastFocus?.focus?.({ preventScroll: true })
    }, 650)
  }

  for (const dlg of [pd, ad, po]) {
    if (!dlg) continue
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault()
      close(dlg)
    })
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg || e.target.closest('[data-close]')) close(dlg)
      const link = e.target.closest('a[href="#contact"]')
      if (link) {
        e.preventDefault()
        e.stopPropagation()
        prefill(link)
        close(dlg, () => scroll.to('#contact'))
      }
      const tab = e.target.closest('[data-plan-tab]')
      if (tab) {
        const id = dlg.dataset.current
        const i = +tab.dataset.planTab
        dlg.querySelectorAll('[data-plan-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === tab)))
        dlg.querySelector('[data-plan-view]').innerHTML = planSVG(projects[id].plans[i]).svg
      }
    })
  }

  document.addEventListener('click', (e) => {
    const p = e.target.closest('[data-project]')
    if (p && pd) {
      pd.dataset.current = p.dataset.project
      pd.querySelector('[data-project-content]').innerHTML = projectHTML(p.dataset.project)
      open(pd)
      return
    }
    const a = e.target.closest('[data-article]')
    if (a && ad) {
      ad.querySelector('[data-article-content]').innerHTML = articleHTML(a.dataset.article)
      open(ad)
      return
    }
    const pol = e.target.closest('[data-policy]')
    if (pol && po) {
      e.preventDefault()
      open(po)
      return
    }
    const link = e.target.closest('a[href="#contact"][data-interest]')
    if (link) prefill(link)
  })
}

/** Pre-select the topic (and optionally a message) in the contact form. */
export function prefill(link) {
  const form = document.querySelector('[data-form]')
  if (!form) return
  const interest = link.dataset.interest
  if (interest) {
    const r = form.querySelector(`input[name="interest"][value="${interest}"]`)
    if (r) r.checked = true
  }
  const msg = link.dataset.messageText
  if (msg) {
    const ta = form.querySelector('[data-message]')
    if (ta && !ta.value.includes(msg)) ta.value = ta.value ? `${ta.value}\n${msg}` : msg
  }
}
