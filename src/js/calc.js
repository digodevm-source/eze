import { nf } from './utils.js'
import { prefill } from './drawers.js'

// prices and packing (₽, м³, шт) — keep in sync with the product cards
export const BLOCKS = {
  wall400: { label: '600×300×400, D400', t: 0.4, vol: 0.072, perPallet: 20, price: 7900 },
  wall300: { label: '600×300×300, D500', t: 0.3, vol: 0.054, perPallet: 30, price: 7400 },
  partition: { label: '600×300×100, D500', t: 0.1, vol: 0.018, perPallet: 80, price: 7600 },
}
const GLUE_BAG = 480 // ₽ за мешок 25 кг
const WASTE = 1.05

const m3 = (v) => `${v.toFixed(1).replace('.', ',')} м³`

export function calculate({ block, perimeter, height, floors, openings, partitions }) {
  const b = BLOCKS[block] || BLOCKS.wall400
  const wallArea = Math.max(0, perimeter * height * floors - openings)
  const wallVolume = wallArea * b.t * WASTE
  const wallCount = Math.ceil(wallVolume / b.vol)
  const p = BLOCKS.partition
  const partVolume = Math.max(0, partitions * Math.max(0, height - 0.2)) * p.t * WASTE
  const partCount = Math.ceil(partVolume / p.vol)
  const pallets = Math.ceil(wallCount / b.perPallet) + Math.ceil(partCount / p.perPallet)
  const glue = Math.ceil(wallVolume + partVolume)
  const total = wallVolume * b.price + partVolume * p.price + glue * GLUE_BAG
  return { b, wallVolume, wallCount, partVolume, partCount, pallets, glue, total }
}

export function initCalc(scroll) {
  const root = document.querySelector('[data-calc]')
  if (!root) return
  const form = root.querySelector('[data-calc-form]')
  const out = (k) => root.querySelector(`[data-out="${k}"]`)
  let last = null

  const read = () => {
    const f = new FormData(form)
    const num = (k) => Math.max(0, parseFloat(String(f.get(k)).replace(',', '.')) || 0)
    return {
      block: f.get('block'),
      perimeter: num('perimeter'),
      height: num('height'),
      floors: num('floors') || 1,
      openings: num('openings'),
      partitions: num('partitions'),
    }
  }

  const render = () => {
    const r = (last = calculate(read()))
    out('wallCount').textContent = nf.format(r.wallCount)
    out('wallVolume').textContent = m3(r.wallVolume)
    out('partCount').textContent = nf.format(r.partCount)
    out('partVolume').textContent = m3(r.partVolume)
    out('pallets').textContent = nf.format(r.pallets)
    out('glue').textContent = nf.format(r.glue)
    out('total').textContent = `≈ ${nf.format(Math.round(r.total / 1000) * 1000)} ₽`
  }

  form.addEventListener('input', render)
  form.addEventListener('change', render)
  form.addEventListener('submit', (e) => e.preventDefault())
  render()

  // "Рассчитать" on the product cards
  document.querySelectorAll('[data-pick]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const v = btn.dataset.pick
      if (v === 'partition') {
        const inp = form.querySelector('[name="partitions"]')
        scroll.to(root)
        setTimeout(() => inp.focus({ preventScroll: true }), 900)
      } else {
        const r = form.querySelector(`input[name="block"][value="${v}"]`)
        if (r) r.checked = true
        render()
        scroll.to(root)
      }
    })
  )

  root.querySelector('[data-calc-send]')?.addEventListener('click', (e) => {
    if (!last) return
    const r = last
    const text =
      `Расчёт блоков: стеновой ${r.b.label} — ${nf.format(r.wallCount)} шт (${m3(r.wallVolume)}), ` +
      `перегородочный — ${nf.format(r.partCount)} шт (${m3(r.partVolume)}), поддонов — ${r.pallets}, ` +
      `клей — ${r.glue} мешков. Ориентировочно ${nf.format(Math.round(r.total / 1000) * 1000)} ₽.`
    const link = e.currentTarget
    link.dataset.interest = 'Покупка блоков'
    link.dataset.messageText = text
    prefill(link)
  })
}
