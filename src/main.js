import '@fontsource/prata/400.css'
import '@fontsource-variable/manrope'
import './styles/main.css'

import { initScroll } from './js/scroll.js'
import { initHeader } from './js/header.js'
import { initReveal } from './js/reveal.js'
import { initIntro } from './js/intro.js'
import { initCarousel } from './js/carousel.js'
import { initDrawers } from './js/drawers.js'
import { initCalc } from './js/calc.js'
import { initFaq } from './js/faq.js'
import { initForm } from './js/form.js'
import { initTech } from './js/tech.js'
import { initProcess } from './js/process.js'
import { whenNear } from './js/utils.js'

document.documentElement.classList.add('js')

const scroll = initScroll()
initHeader(scroll)
initReveal()
initCarousel()
initDrawers(scroll)
initCalc(scroll)
initFaq()
initForm()
initTech()
initProcess(scroll)

initIntro().then(() => {
  // the hero depth effect is a progressive enhancement, loaded after first paint
  const hero = document.querySelector('[data-hero]')
  if (hero) import('./webgl/hero-depth.js').then((m) => m.initHeroDepth(hero, scroll)).catch(() => {})
})

const viewer = document.querySelector('[data-block-viewer]')
if (viewer) {
  whenNear(viewer, () => import('./webgl/block-viewer.js').then((m) => m.initBlockViewer(viewer)))
}

const build = document.querySelector('[data-process]')
if (build) {
  whenNear(build, () => import('./webgl/build-scene.js').then((m) => m.initBuildScene(build, scroll)), '600px')
}

const year = document.querySelector('[data-year]')
if (year) year.textContent = String(new Date().getFullYear())
