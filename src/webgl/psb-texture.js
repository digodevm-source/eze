import * as THREE from 'three'

/**
 * Procedural, tileable polystyrene concrete surface: grey cement matrix with
 * white expanded-polystyrene beads (2–5 mm) and a few air pores.
 * One texture tile covers `tile` metres of surface.
 * Returns colour, normal and roughness textures.
 */
export function createPSBTextures({ size = 1024, tile = 0.3, seed = 7, cement = [118, 116, 110], bead = [226, 225, 219] } = {}) {
  const N = size
  const pxPerMm = N / (tile * 1000)
  let s = seed >>> 0
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const H = new Float32Array(N * N)
  const B = new Float32Array(N * N) // bead coverage 0..1
  const P = new Float32Array(N * N) // pores

  // periodic value noise for the cement tone
  const noise = (cells) => {
    const g = new Float32Array(cells * cells).map(() => rnd())
    const out = new Float32Array(N * N)
    for (let y = 0; y < N; y++) {
      const fy = (y / N) * cells
      const y0 = Math.floor(fy)
      const ty = fy - y0
      const sy = ty * ty * (3 - 2 * ty)
      for (let x = 0; x < N; x++) {
        const fx = (x / N) * cells
        const x0 = Math.floor(fx)
        const tx = fx - x0
        const sx = tx * tx * (3 - 2 * tx)
        const a = g[(y0 % cells) * cells + (x0 % cells)]
        const b = g[(y0 % cells) * cells + ((x0 + 1) % cells)]
        const c = g[((y0 + 1) % cells) * cells + (x0 % cells)]
        const d = g[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)]
        out[y * N + x] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy
      }
    }
    return out
  }
  const n1 = noise(6)
  const n2 = noise(24)

  // beads: dart throwing on a spatial hash, wrapped for tiling
  const beads = []
  const cell = Math.ceil(5.6 * pxPerMm)
  const gridN = Math.ceil(N / cell)
  const grid = Array.from({ length: gridN * gridN }, () => [])
  const target = 0.46 * N * N
  let covered = 0
  let tries = 0
  while (covered < target && tries < 200000) {
    tries++
    const d = 1.8 + Math.pow(rnd(), 1.6) * 3.4 // diameter, mm
    const r = (d / 2) * pxPerMm
    const x = rnd() * N
    const y = rnd() * N
    const gx = Math.floor(x / cell)
    const gy = Math.floor(y / cell)
    let ok = true
    for (let j = -1; j <= 1 && ok; j++) {
      for (let i = -1; i <= 1 && ok; i++) {
        const list = grid[((gy + j + gridN) % gridN) * gridN + ((gx + i + gridN) % gridN)]
        for (const o of list) {
          let dx = Math.abs(o.x - x)
          let dy = Math.abs(o.y - y)
          if (dx > N / 2) dx = N - dx
          if (dy > N / 2) dy = N - dy
          if (dx * dx + dy * dy < (o.r + r + 0.6 * pxPerMm) ** 2) {
            ok = false
            break
          }
        }
      }
    }
    if (!ok) continue
    const b = { x, y, r }
    beads.push(b)
    grid[gy * gridN + gx].push(b)
    covered += Math.PI * r * r
  }

  for (const { x, y, r } of beads) {
    const R = Math.ceil(r + 1.5)
    for (let j = -R; j <= R; j++) {
      for (let i = -R; i <= R; i++) {
        const px = Math.floor(x) + i
        const py = Math.floor(y) + j
        const dx = px + 0.5 - x
        const dy = py + 0.5 - y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > r + 1) continue
        const k = (((py % N) + N) % N) * N + (((px % N) + N) % N)
        const edge = Math.min(1, Math.max(0, r + 0.5 - dist))
        B[k] = Math.max(B[k], edge)
        const dome = dist < r ? Math.sqrt(1 - (dist * dist) / (r * r)) : 0
        // cut beads are slightly concave on a sawn face, moulded ones domed
        H[k] = Math.max(H[k], dome * 0.5 - 0.15)
      }
    }
  }

  // air pores
  for (let n = 0; n < 900; n++) {
    const x = Math.floor(rnd() * N)
    const y = Math.floor(rnd() * N)
    const r = (0.3 + rnd() * 0.6) * pxPerMm
    const R = Math.ceil(r + 1)
    for (let j = -R; j <= R; j++) {
      for (let i = -R; i <= R; i++) {
        const dist = Math.hypot(i, j)
        if (dist > r) continue
        const k = (((y + j) % N + N) % N) * N + (((x + i) % N + N) % N)
        if (B[k] > 0.2) continue
        P[k] = 1
        H[k] -= 0.6 * (1 - dist / r)
      }
    }
  }

  const col = new Uint8ClampedArray(N * N * 4)
  const rough = new Uint8ClampedArray(N * N * 4)
  for (let k = 0; k < N * N; k++) {
    const tone = (n1[k] - 0.5) * 18 + (n2[k] - 0.5) * 10 + (rnd() - 0.5) * 14
    const b = B[k]
    const shade = 0.93 + H[k] * 0.12
    let r = cement[0] + tone
    let g = cement[1] + tone
    let bl = cement[2] + tone
    if (P[k]) {
      r *= 0.55
      g *= 0.55
      bl *= 0.55
    }
    r = r * (1 - b) + bead[0] * shade * b
    g = g * (1 - b) + bead[1] * shade * b
    bl = bl * (1 - b) + bead[2] * shade * b
    col[k * 4] = r
    col[k * 4 + 1] = g
    col[k * 4 + 2] = bl
    col[k * 4 + 3] = 255
    H[k] += (n2[k] - 0.5) * 0.08 + (rnd() - 0.5) * 0.05
    const ro = 0.9 * (1 - b) + 0.58 * b
    rough[k * 4] = rough[k * 4 + 1] = rough[k * 4 + 2] = ro * 255
    rough[k * 4 + 3] = 255
  }

  const nrm = new Uint8ClampedArray(N * N * 4)
  const strength = 2.2
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const l = H[y * N + ((x - 1 + N) % N)]
      const rr = H[y * N + ((x + 1) % N)]
      const u = H[((y - 1 + N) % N) * N + x]
      const d = H[((y + 1) % N) * N + x]
      let nx = (l - rr) * strength
      let ny = (d - u) * strength
      let nz = 1
      const len = Math.hypot(nx, ny, nz)
      nx /= len
      ny /= len
      nz /= len
      const k = (y * N + x) * 4
      nrm[k] = (nx * 0.5 + 0.5) * 255
      nrm[k + 1] = (ny * 0.5 + 0.5) * 255
      nrm[k + 2] = (nz * 0.5 + 0.5) * 255
      nrm[k + 3] = 255
    }
  }

  const tex = (data, srgb) => {
    const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    t.generateMipmaps = true
    t.minFilter = THREE.LinearMipmapLinearFilter
    t.magFilter = THREE.LinearFilter
    t.anisotropy = 8
    t.needsUpdate = true
    return t
  }

  return { map: tex(col, true), normalMap: tex(nrm, false), roughnessMap: tex(rough, false), tile }
}

/**
 * Re-project UVs of a box-like geometry so the texture keeps its real scale
 * (1 tile = `tile` metres) on every face, with a different offset per face.
 */
export function boxUVs(geometry, tile = 0.3) {
  const pos = geometry.attributes.position
  const nor = geometry.attributes.normal
  const uv = geometry.attributes.uv
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const ax = Math.abs(nor.getX(i))
    const ay = Math.abs(nor.getY(i))
    const az = Math.abs(nor.getZ(i))
    let u
    let v
    if (ax >= ay && ax >= az) {
      u = z + (nor.getX(i) > 0 ? 0.13 : 0.71)
      v = y
    } else if (ay >= az) {
      u = x + (nor.getY(i) > 0 ? 0.37 : 0.53)
      v = z + 0.21
    } else {
      u = x + (nor.getZ(i) > 0 ? 0.05 : 0.89)
      v = y + 0.44
    }
    uv.setXY(i, u / tile, v / tile)
  }
  uv.needsUpdate = true
  return geometry
}
