/** Floor plan as SVG: the outline is filled with wall colour and rooms are
 * cut out of it, so wall thickness comes straight from the room geometry. */
const WALL = '#2b2723'
const ROOM = '#faf8f4'
const INK = '#22201c'
const MUTED = '#8a8277'

const fmt = (v) => v.toFixed(1).replace('.', ',')

export function planSVG(plan) {
  const pad = 1.6
  const { w, h } = plan
  const W = w + pad * 2
  const H = h + pad * 2
  const k = 1 // 1 svg unit = 1 m
  const out = []
  const labels = []
  out.push(`<svg viewBox="${-pad} ${-pad} ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="План: ${plan.label}" font-family="Manrope Variable, Manrope, sans-serif">`)

  // outline
  const poly = plan.outline || [[0, 0], [w, 0], [w, h], [0, h]]
  out.push(`<polygon points="${poly.map((p) => p.join(',')).join(' ')}" fill="${WALL}"/>`)

  // windows: [side, from, to, face]
  for (const [side, a, b, face] of plan.windows || []) {
    const t = 0.4
    let x, y, ww, hh
    if (side === 'b') [x, y, ww, hh] = [a, (face ?? h) - t, b - a, t]
    if (side === 't') [x, y, ww, hh] = [a, face ?? 0, b - a, t]
    if (side === 'l') [x, y, ww, hh] = [face ?? 0, a, t, b - a]
    if (side === 'r') [x, y, ww, hh] = [(face ?? w) - t, a, t, b - a]
    out.push(`<rect x="${x}" y="${y}" width="${ww}" height="${hh}" fill="${ROOM}"/>`)
    const horiz = side === 'b' || side === 't'
    if (horiz) out.push(`<line x1="${x}" y1="${y + t / 2}" x2="${x + ww}" y2="${y + t / 2}" stroke="${INK}" stroke-width="0.04"/>`)
    else out.push(`<line x1="${x + t / 2}" y1="${y}" x2="${x + t / 2}" y2="${y + hh}" stroke="${INK}" stroke-width="0.04"/>`)
    out.push(
      horiz
        ? `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" fill="none" stroke="${INK}" stroke-width="0.03"/>`
        : `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" fill="none" stroke="${INK}" stroke-width="0.03"/>`
    )
  }

  // entrance
  if (plan.door) {
    const [side, a, b] = plan.door
    const t = 0.4
    const y = side === 'b' ? h - t : 0
    out.push(`<rect x="${a}" y="${y}" width="${b - a}" height="${t}" fill="${ROOM}"/>`)
    const cx = (a + b) / 2
    const ay = side === 'b' ? h + 0.55 : -0.55
    const dir = side === 'b' ? -1 : 1
    out.push(`<path d="M${cx - 0.28} ${ay} L${cx + 0.28} ${ay} L${cx} ${ay + dir * 0.4} Z" fill="${INK}"/>`)
  }

  // rooms
  let total = 0
  for (const room of plan.rooms) {
    const [x0, y0, x1, y1] = room.r
    const rw = x1 - x0
    const rh = y1 - y0
    const area = rw * rh
    // stair opening on an upper floor: floor-coloured, no name, not counted
    if (room.open) {
      out.push(`<rect x="${x0}" y="${y0}" width="${rw}" height="${rh}" fill="${ROOM}"/>`)
      continue
    }
    if (!room.void) total += area
    out.push(`<rect x="${x0}" y="${y0}" width="${rw}" height="${rh}" fill="${ROOM}"/>`)
    if (room.void) {
      out.push(`<path d="M${x0} ${y0} L${x1} ${y1} M${x1} ${y0} L${x0} ${y1}" stroke="${MUTED}" stroke-width="0.03" stroke-dasharray="0.15 0.12"/>`)
    }
    // centre the name in the part of the room the stair treads leave free
    let [lx0, ly0, lx1, ly1] = [x0, y0, x1, y1]
    const st = plan.stairs
    if (st && st[0] < x1 && st[2] > x0 && st[1] < y1 && st[3] > y0) {
      const vertical = st[3] - st[1] > st[2] - st[0]
      if (vertical) {
        if (st[0] - x0 > x1 - st[2]) lx1 = st[0]
        else lx0 = st[2]
      } else if (st[1] - y0 > y1 - st[3]) ly1 = st[1]
      else ly0 = st[3]
    }
    const lw = lx1 - lx0
    const cx = lx0 + lw / 2
    const cy = ly0 + (ly1 - ly0) / 2
    const small = lw < 2.6 || ly1 - ly0 < 2.4
    // shrink long names until they fit the room instead of dropping them
    const fit = (len, size) => Math.min(size, (lw * 0.86) / (len * 0.56))
    const fs = Math.max(0.24, fit(room.n.length, small ? 0.34 : Math.min(0.5, lw / 9 + 0.2)))
    const label = room.n
    if (label) labels.push(`<text x="${cx}" y="${cy - (small ? 0.05 : 0.12)}" font-size="${fs.toFixed(3)}" fill="${room.void ? MUTED : INK}" text-anchor="middle">${label}</text>`)
    if (!room.void) {
      labels.push(`<text x="${cx}" y="${cy + (label ? fs + 0.1 : 0.12)}" font-size="${(Math.min(fs, 0.36) * 0.86).toFixed(3)}" fill="${MUTED}" text-anchor="middle">${fmt(area)} м²</text>`)
    }
  }

  // stairs
  if (plan.stairs) {
    const [x0, y0, x1, y1] = plan.stairs
    const horiz = x1 - x0 > y1 - y0
    const n = 12
    for (let i = 1; i < n; i++) {
      if (horiz) {
        const x = x0 + ((x1 - x0) * i) / n
        out.push(`<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="${MUTED}" stroke-width="0.025"/>`)
      } else {
        const y = y0 + ((y1 - y0) * i) / n
        out.push(`<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${MUTED}" stroke-width="0.025"/>`)
      }
    }
    out.push(`<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="none" stroke="${MUTED}" stroke-width="0.03"/>`)
  }

  // room names on top of the stair treads, with a halo in the floor colour
  out.push(`<g stroke="${ROOM}" stroke-width="0.14" stroke-linejoin="round" paint-order="stroke">${labels.join('')}</g>`)

  // dimension line along the top
  const dy = -0.9
  out.push(`<line x1="0" y1="${dy}" x2="${w}" y2="${dy}" stroke="${MUTED}" stroke-width="0.02"/>`)
  out.push(`<line x1="0" y1="${dy - 0.18}" x2="0" y2="${dy + 0.18}" stroke="${MUTED}" stroke-width="0.02"/>`)
  out.push(`<line x1="${w}" y1="${dy - 0.18}" x2="${w}" y2="${dy + 0.18}" stroke="${MUTED}" stroke-width="0.02"/>`)
  out.push(`<text x="${w / 2}" y="${dy - 0.22}" font-size="0.36" fill="${MUTED}" text-anchor="middle">${fmt(w)} м</text>`)
  // and the left side
  const dx = -0.9
  out.push(`<line x1="${dx}" y1="0" x2="${dx}" y2="${h}" stroke="${MUTED}" stroke-width="0.02"/>`)
  out.push(`<line x1="${dx - 0.18}" y1="0" x2="${dx + 0.18}" y2="0" stroke="${MUTED}" stroke-width="0.02"/>`)
  out.push(`<line x1="${dx - 0.18}" y1="${h}" x2="${dx + 0.18}" y2="${h}" stroke="${MUTED}" stroke-width="0.02"/>`)
  out.push(`<text transform="translate(${dx - 0.25} ${h / 2}) rotate(-90)" font-size="0.36" fill="${MUTED}" text-anchor="middle">${fmt(h)} м</text>`)

  out.push('</svg>')
  return { svg: out.join(''), total }
}
