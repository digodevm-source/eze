import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createPSBTextures, boxUVs } from './psb-texture.js'
import { clamp, smoothstep, lerp, visibility, webglAvailable } from '../js/utils.js'

/*
 * An architectural maquette: a single-storey house on a model base board that
 * builds itself as the visitor scrolls through the six construction steps
 * (progress 0…6): plot → slab → block walls course by course → roof & windows
 * → facade → landscaping and lights. Everything is matte and pale, the way a
 * physical presentation model is, so the block texture is the only "real"
 * material in the frame.
 */

const HX = 6 // half length, m
const HZ = 4 // half depth, m
const T = 0.4 // wall thickness (block 600×300×400)
const BL = 0.6
const BH = 0.3
const COURSES = 10
const SLAB = 0.3

const C = {
  board: 0xe8e6e1,
  lawn: 0xc3c8b6,
  hedge: 0xaeb4a0,
  paving: 0xd9d5cd,
  slab: 0xc4c0b8,
  plaster: 0xf6f4ef,
  roof: 0xeeebe5,
  fascia: 0x3a3631,
  frame: 0x3a3631,
  glass: 0x7c878c,
  wood: 0xa98361,
  deck: 0xc2a688,
  glow: 0xffc98f,
  pine: 0xe9e8e2,
  trunk: 0xc9bfb0,
}
// the model base board (top face at y = 0)
const BOARD = { w: 50, d: 38, h: 0.6 }

// openings: wall id, from, to (along the wall), first course, last course (exclusive)
const OPENINGS = [
  ['S', -0.6, 0.6, 0, 8], // door
  ['S', -4.7, -2.3, 3, 8],
  ['S', 2.3, 4.7, 3, 8],
  ['N', -3.5, -1.1, 3, 8],
  ['N', 1.7, 3.5, 3, 8],
  ['E', -1.2, 1.2, 3, 8],
  ['W', -2.4, 0.0, 3, 8],
]

function layout() {
  // wall lines: S (front, z = +), N (back), E (x = +), W
  const out = []
  for (let c = 0; c < COURSES; c++) {
    const even = c % 2 === 0
    const lines = even
      ? [
          ['S', -HX, HX], ['N', -HX, HX],
          ['E', -HZ + T, HZ - T], ['W', -HZ + T, HZ - T],
        ]
      : [
          ['E', -HZ, HZ], ['W', -HZ, HZ],
          ['S', -HX + T, HX - T], ['N', -HX + T, HX - T],
        ]
    // build order: go around the house so the walls rise evenly
    for (const [wall, a, b] of lines) {
      let u = a
      const off = (c + (wall === 'E' || wall === 'W' ? 1 : 0)) % 2 ? BL / 2 : 0
      let first = true
      while (u < b - 0.02) {
        let len = first && off ? off : BL
        first = false
        len = Math.min(len, b - u)
        let segs = [[u, u + len]]
        for (const [w, o0, o1, c0, c1] of OPENINGS) {
          if (w !== wall || c < c0 || c >= c1) continue
          segs = segs.flatMap(([s0, s1]) => {
            if (s1 <= o0 || s0 >= o1) return [[s0, s1]]
            const r = []
            if (s0 < o0) r.push([s0, o0])
            if (s1 > o1) r.push([o1, s1])
            return r
          })
        }
        for (const [s0, s1] of segs) {
          if (s1 - s0 < 0.05) continue
          out.push({ wall, s0, s1, c })
        }
        u += len
      }
    }
  }
  return out
}

export function initBuildScene(wrap) {
  if (!webglAvailable()) return
  const canvas = wrap.querySelector('[data-build-canvas]')
  const host = canvas.parentElement
  const mobile = window.innerWidth < 900

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.75 : 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.35

  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 200)

  const hemi = new THREE.HemisphereLight(0xffffff, 0xdcd8d0, 1.05)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xfff7ee, 2.1)
  sun.position.set(-16, 22, 13)
  sun.castShadow = true
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048)
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 90 })
  sun.shadow.radius = 6
  sun.shadow.blurSamples = 16
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.02
  scene.add(sun)

  // ---------------------------------------------------------------- ground & plot
  const board = new THREE.Mesh(
    new RoundedBoxGeometry(BOARD.w, BOARD.h, BOARD.d, 4, 0.14),
    new THREE.MeshStandardMaterial({ color: C.board, roughness: 0.92 })
  )
  board.position.y = -BOARD.h / 2
  board.receiveShadow = true
  board.castShadow = true
  scene.add(board)
  // the "table" under the model only catches its soft shadow
  const table = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.ShadowMaterial({ opacity: 0.1 }))
  table.rotation.x = -Math.PI / 2
  table.position.y = -BOARD.h
  table.receiveShadow = true
  scene.add(table)

  // landscaping, faded in at handover: lawn sheet with a cut-out for the
  // house and the path, and stone slabs from the gate to the door
  const lawnShape = new THREE.Shape()
  const GX = 15.5
  const GZ = 11.5
  lawnShape.moveTo(-GX, -GZ)
  lawnShape.lineTo(GX, -GZ)
  lawnShape.lineTo(GX, GZ)
  lawnShape.lineTo(-GX, GZ)
  lawnShape.closePath()
  const cut = new THREE.Path()
  cut.moveTo(-HX - 0.8, -HZ - 0.8)
  cut.lineTo(-HX - 0.8, HZ + 0.8)
  cut.lineTo(-0.9, HZ + 0.8)
  cut.lineTo(-0.9, GZ)
  cut.lineTo(0.9, GZ)
  cut.lineTo(0.9, HZ + 0.8)
  cut.lineTo(HX + 0.8, HZ + 0.8)
  cut.lineTo(HX + 0.8, -HZ - 0.8)
  cut.closePath()
  lawnShape.holes.push(cut)
  const lawnMat = new THREE.MeshStandardMaterial({ color: C.lawn, roughness: 1, transparent: true, opacity: 0 })
  const lawn = new THREE.Mesh(new THREE.ShapeGeometry(lawnShape), lawnMat)
  lawn.rotation.x = -Math.PI / 2
  lawn.position.y = 0.015
  lawn.receiveShadow = true
  scene.add(lawn)
  const pavingMat = new THREE.MeshStandardMaterial({ color: C.paving, roughness: 0.9, transparent: true, opacity: 0 })
  const paving = new THREE.Group()
  for (let z = HZ + 1.1; z < GZ - 0.3; z += 0.95) {
    const slabStone = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.75), pavingMat)
    slabStone.position.set(0, 0.03, z)
    slabStone.receiveShadow = true
    paving.add(slabStone)
  }
  // a paved strip around the house (the blind area)
  for (const [w, d, x, z] of [
    [HX * 2 + 1.6, 0.8, 0, HZ + 0.4 + 0.02], [HX * 2 + 1.6, 0.8, 0, -HZ - 0.4],
    [0.8, HZ * 2, HX + 0.4, 0], [0.8, HZ * 2, -HX - 0.4, 0],
  ]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), pavingMat)
    strip.position.set(x, 0.02, z)
    strip.receiveShadow = true
    paving.add(strip)
  }
  scene.add(paving)

  const plotMat = new THREE.LineDashedMaterial({ color: 0x5b554c, dashSize: 0.35, gapSize: 0.25, transparent: true })
  const P = [[-HX - 3, -HZ - 3], [HX + 3, -HZ - 3], [HX + 3, HZ + 4], [-HX - 3, HZ + 4]]
  const plotGeo = new THREE.BufferGeometry().setFromPoints([...P, P[0]].map(([x, z]) => new THREE.Vector3(x, 0.02, z)))
  const plot = new THREE.Line(plotGeo, plotMat)
  plot.computeLineDistances()
  scene.add(plot)
  const stakeMat = new THREE.MeshStandardMaterial({ color: 0x8f7a63, roughness: 0.9, transparent: true })
  const stakes = new THREE.Group()
  for (const [x, z] of [[-HX, -HZ], [HX, -HZ], [HX, HZ], [-HX, HZ]]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), stakeMat)
    s.position.set(x, 0.3, z)
    s.castShadow = true
    stakes.add(s)
  }
  // string lines between the stakes (the future wall axis)
  const stringGeo = new THREE.BufferGeometry().setFromPoints(
    [[-HX, -HZ], [HX, -HZ], [HX, HZ], [-HX, HZ], [-HX, -HZ]].map(([x, z]) => new THREE.Vector3(x, 0.5, z))
  )
  const strings = new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: 0xc0583b, transparent: true }))
  stakes.add(strings)
  scene.add(stakes)

  // model trees: slender pines in white foam, as on a presentation model
  const trees = new THREE.Group()
  const pineMat = new THREE.MeshStandardMaterial({ color: C.pine, roughness: 0.95 })
  const trunkMat = new THREE.MeshStandardMaterial({ color: C.trunk, roughness: 1 })
  const trunkGeo = new THREE.CylinderGeometry(0.05, 0.08, 1, 10)
  const coneGeo = new THREE.ConeGeometry(1, 1, 24, 1)
  const pines = [
    [-12.6, -7.8, 7.0], [-10.4, -9.6, 5.4], [-13.6, -3.4, 6.2], [-8.0, -10.6, 6.6], [-4.4, -11.2, 5.0],
    [9.4, -9.8, 6.8], [12.4, -8.0, 5.6], [13.4, -3.0, 7.2], [6.2, -10.8, 5.2], [13.8, 4.6, 5.8],
    [-14.0, 5.0, 5.4], [-17.5, -9.5, 7.6], [17.8, -10.5, 7.0], [1.2, -12.4, 6.0], [-19.0, 1.0, 6.4],
    [19.2, 1.5, 6.6], [-16.5, 10.5, 5.2], [16.8, 10.0, 5.6],
  ]
  for (const [x, z, h] of pines) {
    const g = new THREE.Group()
    const trunk = new THREE.Mesh(trunkGeo, trunkMat)
    trunk.scale.y = h * 0.4
    trunk.position.y = h * 0.2
    trunk.castShadow = true
    // one slim cone: the silhouette of a pine, without toy-like tiers
    const crown = new THREE.Mesh(coneGeo, pineMat)
    crown.scale.set(h * 0.17, h * 0.82, h * 0.17)
    crown.position.y = h * 0.18 + (h * 0.82) / 2
    crown.castShadow = true
    g.add(trunk, crown)
    g.position.set(x, 0, z)
    trees.add(g)
  }
  scene.add(trees)
  // clipped hedges and a timber deck, grown in at handover
  const shrubMat = new THREE.MeshStandardMaterial({ color: C.hedge, roughness: 1, transparent: true, opacity: 0 })
  const shrubs = new THREE.Group()
  for (const [x, z, w, d] of [
    [-3.9, HZ + 1.55, 3.6, 0.55], [-GX + 0.5, 0, 0.6, GZ * 2 - 1], [GX - 0.5, 0, 0.6, GZ * 2 - 1], [0, -GZ + 0.5, GX * 2 - 1, 0.6],
  ]) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, 0.7, d, 3, 0.12), shrubMat)
    m.position.set(x, 0.35, z)
    m.castShadow = m.receiveShadow = true
    m.userData.h = 0.7
    shrubs.add(m)
  }
  scene.add(shrubs)
  const deckMat = new THREE.MeshStandardMaterial({ color: C.deck, roughness: 0.8, transparent: true, opacity: 0 })
  const deck = new THREE.Group()
  for (let x = 1.6; x < HX + 0.4; x += 0.22) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 2.4), deckMat)
    plank.position.set(x, 0.12, HZ + 1.6)
    plank.castShadow = plank.receiveShadow = true
    deck.add(plank)
  }
  scene.add(deck)

  // ---------------------------------------------------------------- slab
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(HX * 2 + 0.6, SLAB, HZ * 2 + 0.6),
    new THREE.MeshStandardMaterial({ color: C.slab, roughness: 0.95 })
  )
  slab.castShadow = slab.receiveShadow = true
  scene.add(slab)

  // ---------------------------------------------------------------- blocks
  const tex = createPSBTextures({ size: mobile ? 512 : 768, tile: 0.6 })
  const blockGeo = boxUVs(new THREE.BoxGeometry(BL - 0.008, BH - 0.006, T), 0.6)
  const blockMat = new THREE.MeshStandardMaterial({
    map: tex.map,
    normalMap: tex.normalMap,
    roughnessMap: tex.roughnessMap,
    roughness: 1,
  })
  const blocks = layout()
  const inst = new THREE.InstancedMesh(blockGeo, blockMat, blocks.length)
  inst.castShadow = inst.receiveShadow = true
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  scene.add(inst)
  const base = blocks.map(({ wall, s0, s1, c }) => {
    const len = s1 - s0
    const mid = (s0 + s1) / 2
    const y = SLAB + c * BH + BH / 2
    const along = wall === 'S' || wall === 'N'
    const pos = along
      ? new THREE.Vector3(mid, y, wall === 'S' ? HZ - T / 2 : -HZ + T / 2)
      : new THREE.Vector3(wall === 'E' ? HX - T / 2 : -HX + T / 2, y, mid)
    return { pos, rotY: along ? 0 : Math.PI / 2, sx: len / BL }
  })
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const sc = new THREE.Vector3()
  const p3 = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  let lastPlaced = -1
  const placeBlocks = (n) => {
    if (Math.abs(n - lastPlaced) < 0.01) return
    lastPlaced = n
    for (let i = 0; i < base.length; i++) {
      const a = clamp((n - i) / 10)
      const e = 1 - Math.pow(1 - a, 3)
      const b = base[i]
      q.setFromAxisAngle(up, b.rotY)
      sc.set(b.sx * (a > 0 ? 1 : 0.0001), a > 0 ? 1 : 0.0001, a > 0 ? 1 : 0.0001)
      p3.copy(b.pos)
      p3.y += (1 - e) * 1.2
      m4.compose(p3, q, sc)
      inst.setMatrixAt(i, m4)
    }
    inst.instanceMatrix.needsUpdate = true
  }

  // ---------------------------------------------------------------- roof, windows, facade
  const H = SLAB + COURSES * BH
  const roof = new THREE.Group()
  const roofSlab = new THREE.Mesh(
    new THREE.BoxGeometry(HX * 2 + 1.6, 0.32, HZ * 2 + 1.6),
    new THREE.MeshStandardMaterial({ color: C.roof, roughness: 0.95 })
  )
  roofSlab.castShadow = roofSlab.receiveShadow = true
  // dark metal edge band around the slab (sits inside the slab's height so
  // only its sides show)
  const fascia = new THREE.Mesh(
    new THREE.BoxGeometry(HX * 2 + 1.64, 0.07, HZ * 2 + 1.64),
    new THREE.MeshStandardMaterial({ color: C.fascia, roughness: 0.5 })
  )
  fascia.position.y = 0.1
  // thin canopy over the entrance, part of the roof package
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 1.5), roofSlab.material)
  canopy.position.set(0, -H + SLAB + 8 * BH + 0.35 - 0.16, HZ + 0.75)
  canopy.castShadow = canopy.receiveShadow = true
  roof.add(roofSlab, fascia, canopy)
  scene.add(roof)

  const glassMat = new THREE.MeshStandardMaterial({
    color: C.glass, metalness: 0.55, roughness: 0.04, envMapIntensity: 1.7, transparent: true, opacity: 0,
  })
  const frameMat = new THREE.MeshStandardMaterial({ color: C.frame, roughness: 0.45, transparent: true, opacity: 0 })
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x6b675f, roughness: 1, emissive: C.glow, emissiveIntensity: 0 })
  const windows = new THREE.Group()
  for (const [w, o0, o1, c0, c1] of OPENINGS) {
    const y0 = SLAB + c0 * BH
    const y1 = SLAB + c1 * BH
    const len = o1 - o0
    const along = w === 'S' || w === 'N'
    const g = new THREE.Group()
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(len, y1 - y0), glassMat)
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.05, y1 - y0 - 0.05), glowMat)
    glow.position.z = -0.12
    g.add(glow, glass)
    // slim frame: four bars
    const bars = [
      [len, 0.06, 0, (y1 - y0) / 2 - 0.03],
      [len, 0.06, 0, -(y1 - y0) / 2 + 0.03],
      [0.06, y1 - y0, -len / 2 + 0.03, 0],
      [0.06, y1 - y0, len / 2 - 0.03, 0],
      ...(len > 1.6 ? [[0.05, y1 - y0, 0, 0]] : []),
    ]
    for (const [bw, bh, bx, by] of bars) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.06), frameMat)
      bar.position.set(bx, by, 0)
      g.add(bar)
    }
    const mid = (o0 + o1) / 2
    const ym = (y0 + y1) / 2
    const inset = 0.16
    if (along) {
      const z = w === 'S' ? HZ - inset : -HZ + inset
      g.position.set(mid, ym, z)
      if (w === 'N') g.rotation.y = Math.PI
    } else {
      const x = w === 'E' ? HX - inset : -HX + inset
      g.position.set(x, ym, mid)
      g.rotation.y = w === 'E' ? Math.PI / 2 : -Math.PI / 2
    }
    windows.add(g)
  }
  scene.add(windows)

  // plaster skin: four thin panels with the same openings, faded in at step 5
  const plasterMat = new THREE.MeshStandardMaterial({ color: C.plaster, roughness: 0.96, transparent: true, opacity: 0 })
  const skin = new THREE.Group()
  const wallShape = (len, holes) => {
    const s = new THREE.Shape()
    s.moveTo(-len / 2, 0)
    s.lineTo(len / 2, 0)
    s.lineTo(len / 2, COURSES * BH)
    s.lineTo(-len / 2, COURSES * BH)
    s.closePath()
    for (const [a, b, c0, c1] of holes) {
      const h = new THREE.Path()
      h.moveTo(a, c0 * BH)
      h.lineTo(a, c1 * BH)
      h.lineTo(b, c1 * BH)
      h.lineTo(b, c0 * BH)
      h.closePath()
      s.holes.push(h)
    }
    return new THREE.ExtrudeGeometry(s, { depth: 0.025, bevelEnabled: false })
  }
  for (const w of ['S', 'N', 'E', 'W']) {
    const along = w === 'S' || w === 'N'
    const len = along ? HX * 2 + 0.05 : HZ * 2 + 0.05
    const holes = OPENINGS.filter((o) => o[0] === w).map(([, a, b, c0, c1]) => [w === 'N' || w === 'E' ? -b : a, w === 'N' || w === 'E' ? -a : b, c0, c1])
    const m = new THREE.Mesh(wallShape(len, holes), plasterMat)
    m.castShadow = m.receiveShadow = true
    if (w === 'S') m.position.set(0, SLAB, HZ)
    if (w === 'N') {
      m.position.set(0, SLAB, -HZ)
      m.rotation.y = Math.PI
    }
    if (w === 'E') {
      m.position.set(HX, SLAB, 0)
      m.rotation.y = Math.PI / 2
    }
    if (w === 'W') {
      m.position.set(-HX, SLAB, 0)
      m.rotation.y = -Math.PI / 2
    }
    skin.add(m)
  }
  scene.add(skin)

  // timber slats on the front facade left of the door
  const woodMat = new THREE.MeshStandardMaterial({ color: C.wood, roughness: 0.7, transparent: true, opacity: 0 })
  const slats = new THREE.Group()
  for (let x = -2.1; x < -0.75; x += 0.09) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, COURSES * BH, 0.05), woodMat)
    s.position.set(x, SLAB + (COURSES * BH) / 2, HZ + 0.06)
    s.castShadow = true
    slats.add(s)
  }
  for (let x = 0.75; x < 2.1; x += 0.09) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, COURSES * BH, 0.05), woodMat)
    s.position.set(x, SLAB + (COURSES * BH) / 2, HZ + 0.06)
    s.castShadow = true
    slats.add(s)
  }
  scene.add(slats)

  const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 8 * BH, 0.06), woodMat)
  door.position.set(0, SLAB + 4 * BH, HZ - 0.18)
  scene.add(door)

  const lamp = new THREE.PointLight(0xffc28a, 0, 14, 1.6)
  lamp.position.set(0, 1.8, 0)
  scene.add(lamp)

  // ---------------------------------------------------------------- camera keys per step
  const KEYS = [
    { a: -0.95, d: 34, h: 19, ty: 0.4 },
    { a: -0.75, d: 30, h: 15, ty: 0.6 },
    { a: -0.55, d: 27, h: 12, ty: 1.4 },
    { a: -0.35, d: 27, h: 11, ty: 1.6 },
    { a: -0.15, d: 26, h: 8.5, ty: 1.8 },
    { a: 0.12, d: 25, h: 6.5, ty: 1.9 },
    { a: 0.22, d: 24, h: 6, ty: 1.9 },
  ]
  const camAt = (p) => {
    const i = Math.min(KEYS.length - 2, Math.floor(p))
    const t = smoothstep(0, 1, p - i)
    const A = KEYS[i]
    const B = KEYS[i + 1]
    return { a: lerp(A.a, B.a, t), d: lerp(A.d, B.d, t), h: lerp(A.h, B.h, t), ty: lerp(A.ty, B.ty, t) }
  }

  // ---------------------------------------------------------------- update
  let target = 0
  let progress = 0
  wrap.addEventListener('process:progress', (e) => (target = e.detail))

  const apply = (p, time) => {
    const plot01 = 1 - smoothstep(1.1, 1.7, p)
    plotMat.opacity = plot01 * 0.8
    stakeMat.opacity = plot01
    strings.material.opacity = plot01
    stakes.visible = plot01 > 0.01
    plot.visible = plot01 > 0.01

    const slab01 = smoothstep(0.9, 1.7, p)
    slab.scale.y = Math.max(0.001, slab01)
    slab.position.y = (SLAB * slab01) / 2
    slab.visible = slab01 > 0.001

    const walls01 = smoothstep(1.85, 2.9, p)
    placeBlocks(walls01 * (base.length + 10))
    inst.visible = walls01 > 0

    const roof01 = smoothstep(3.0, 3.55, p)
    roof.position.y = H + 0.16 + (1 - roof01) * 2.5
    roof.visible = roof01 > 0.001
    roofSlab.material.transparent = roof01 < 1
    roofSlab.material.opacity = roof01
    fascia.material.transparent = roof01 < 1
    fascia.material.opacity = roof01

    const win01 = smoothstep(3.4, 3.95, p)
    glassMat.opacity = win01 * 0.92
    frameMat.opacity = win01
    windows.visible = win01 > 0.001

    const skin01 = smoothstep(4.0, 4.6, p)
    plasterMat.opacity = skin01
    plasterMat.transparent = skin01 < 1
    skin.visible = skin01 > 0.001
    const wood01 = smoothstep(4.4, 4.9, p)
    woodMat.opacity = Math.max(wood01, win01)
    woodMat.transparent = woodMat.opacity < 1
    slats.visible = wood01 > 0.001
    door.visible = win01 > 0.001

    const garden01 = smoothstep(4.6, 5.4, p)
    lawnMat.opacity = garden01
    pavingMat.opacity = garden01
    shrubMat.opacity = garden01
    lawn.visible = paving.visible = shrubs.visible = garden01 > 0.001
    shrubs.children.forEach((m, i) => {
      const k = smoothstep(4.7 + i * 0.06, 5.25 + i * 0.06, p)
      m.scale.y = Math.max(0.001, k)
      m.position.y = (m.userData.h * m.scale.y) / 2
    })
    deckMat.opacity = garden01
    deck.visible = garden01 > 0.001

    const light01 = smoothstep(5.0, 5.6, p)
    glowMat.emissiveIntensity = light01 * 1.6
    lamp.intensity = light01 * 18
    sun.intensity = 2.3 - light01 * 0.7
    hemi.intensity = 0.9 - light01 * 0.25

    const cam = camAt(p)
    const sway = Math.sin(time * 0.15) * 0.02
    const d = cam.d * zoom
    camera.position.set(Math.sin(cam.a + sway) * d, cam.h * zoom, Math.cos(cam.a + sway) * d)
    camera.lookAt(0, cam.ty, 0)
  }

  // ---------------------------------------------------------------- loop
  let visible = false
  let zoom = 1
  visibility(host, (v) => (visible = v))
  const resize = () => {
    const r = host.getBoundingClientRect()
    renderer.setSize(r.width, r.height, false)
    camera.aspect = r.width / r.height
    camera.fov = camera.aspect < 1.2 ? 36 : 30
    // wider-than-4:3 frames (phones) can come closer: the house fills the width
    zoom = camera.aspect > 1.4 ? 0.95 : 1
    camera.updateProjectionMatrix()
  }
  new ResizeObserver(resize).observe(host)
  resize()

  let prev = performance.now()
  let elapsed = 0
  const loop = () => {
    requestAnimationFrame(loop)
    if (!visible) return
    const now = performance.now()
    const dt = Math.min((now - prev) / 1000, 0.05)
    prev = now
    elapsed += dt
    progress += (target - progress) * (1 - Math.pow(0.02, dt))
    apply(progress, elapsed)
    renderer.render(scene, camera)
  }
  apply(0, 0)
  renderer.render(scene, camera)
  requestAnimationFrame(loop)
  wrap.classList.add('is-3d')
}
