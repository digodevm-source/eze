import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createPSBTextures, boxUVs } from './psb-texture.js'
import { visibility, reducedMotion, webglAvailable, clamp } from '../js/utils.js'

/*
 * The wall block as a still life: it stands on a limestone plinth in soft
 * window light with leaf shadows. The block never moves; picking a property
 * in the list changes what is shown around it (dimensions, a loupe with the
 * macro photo, water droplets).
 */

const L = 0.6
const Hh = 0.3
const W = 0.4
const P = 0.07 // plinth height

const GEOMETRY = 0
const GRANULES = 1
const MATRIX = 2
const WATER = 3

// where the loupe points to on the block (local coordinates) and its caption
const LOUPE = {
  [GRANULES]: { at: [0.1, Hh * 0.55, W / 2], label: 'Гранулы пенополистирола, 2–5 мм', pos: '78% 72%', zoom: 1.5 },
  [MATRIX]: { at: [-0.16, Hh, 0.04], label: 'Цементная матрица вокруг гранул', pos: '84% 78%', zoom: 2.1 },
}

// soft shadows of an olive branch, projected by the key light
function leafTexture() {
  const S = 1024
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')
  g.fillStyle = '#fff'
  g.fillRect(0, 0, S, S)
  let seed = 11
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const branch = (x, y, ang, len, depth) => {
    g.strokeStyle = 'rgba(0,0,0,0.75)'
    g.lineWidth = 7 - depth * 2
    let px = x
    let py = y
    for (let i = 0; i < 14; i++) {
      const t = i / 13
      const a = ang + Math.sin(t * 2.2) * 0.25
      const nx = px + Math.cos(a) * (len / 13)
      const ny = py + Math.sin(a) * (len / 13)
      g.beginPath()
      g.moveTo(px, py)
      g.lineTo(nx, ny)
      g.stroke()
      // narrow olive leaves in pairs along the stem
      if (i > 1) {
        for (const side of [-1, 1]) {
          if (rnd() < 0.2) continue
          const la = a + side * (0.55 + rnd() * 0.35)
          const ll = 46 + rnd() * 30
          g.save()
          g.translate(nx, ny)
          g.rotate(la)
          g.fillStyle = `rgba(0,0,0,${0.62 + rnd() * 0.25})`
          g.beginPath()
          g.ellipse(ll / 2, 0, ll / 2, 7 + rnd() * 3, 0, 0, Math.PI * 2)
          g.fill()
          g.restore()
        }
      }
      if (depth < 1 && i === 6) branch(nx, ny, a - 0.7, len * 0.55, depth + 1)
      if (depth < 1 && i === 10) branch(nx, ny, a + 0.6, len * 0.45, depth + 1)
      px = nx
      py = ny
    }
  }
  branch(-40, 300, 0.32, 760, 0)
  branch(1080, 120, 2.6, 640, 0)
  branch(300, 1100, -0.95, 520, 0)
  // blur for a soft, out-of-focus shadow, then fade the edges of the light pool
  const b = document.createElement('canvas')
  b.width = b.height = S
  const bg = b.getContext('2d')
  bg.filter = 'blur(14px)'
  bg.drawImage(c, 0, 0)
  bg.filter = 'none'
  const v = bg.createRadialGradient(S / 2, S / 2, S * 0.28, S / 2, S / 2, S * 0.52)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,1)')
  bg.fillStyle = v
  bg.fillRect(0, 0, S, S)
  const t = new THREE.CanvasTexture(b)
  t.colorSpace = THREE.SRGBColorSpace
  t.center.set(0.5, 0.5)
  return t
}

// faint tonal variation for the limestone plinth
function stoneTexture() {
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')
  const img = g.createImageData(S, S)
  let seed = 5
  for (let i = 0; i < S * S; i++) {
    seed = (seed * 16807) % 2147483647
    const n = (seed / 2147483647 - 0.5) * 10
    img.data[i * 4] = 214 + n
    img.data[i * 4 + 1] = 209 + n
    img.data[i * 4 + 2] = 201 + n
    img.data[i * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(3, 2)
  return t
}

export function initBlockViewer(root) {
  if (!webglAvailable()) return
  const canvas = root.querySelector('canvas')
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.5

  // one fixed viewpoint: a three-quarter view, slightly from above
  const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 20)
  const target = new THREE.Vector3(0.1, P + 0.1, -0.04)
  camera.position.set(-1.94, P + 1.42, 2.42)
  camera.lookAt(target)

  // key: warm window light through leaves
  const leaves = leafTexture()
  const key = new THREE.SpotLight(0xfff3e6, 70, 0, 0.32, 0.6, 2)
  key.position.set(-1.7, 2.7, 1.5)
  key.target.position.set(0, P + 0.1, 0)
  key.map = leaves
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.radius = 6
  key.shadow.blurSamples = 16
  key.shadow.bias = -0.0003
  scene.add(key, key.target)
  const fill = new THREE.DirectionalLight(0xe9eef5, 0.6)
  fill.position.set(2.2, 1.2, 1.4)
  scene.add(fill)

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: 0.12 }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const plinth = new THREE.Mesh(
    new RoundedBoxGeometry(1.08, P, 0.74, 3, 0.012),
    new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.82, metalness: 0 })
  )
  plinth.position.y = P / 2
  plinth.castShadow = true
  plinth.receiveShadow = true
  scene.add(plinth)

  // everything that stands on the plinth
  const stage = new THREE.Group()
  stage.position.y = P
  scene.add(stage)

  // contact shadow right under the block
  const cs = document.createElement('canvas')
  cs.width = cs.height = 256
  const cg = cs.getContext('2d')
  const grad = cg.createRadialGradient(128, 128, 10, 128, 128, 128)
  grad.addColorStop(0, 'rgba(40,32,24,0.5)')
  grad.addColorStop(0.55, 'rgba(40,32,24,0.16)')
  grad.addColorStop(1, 'rgba(40,32,24,0)')
  cg.fillStyle = grad
  cg.fillRect(0, 0, 256, 256)
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(L * 1.45, W * 1.6),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cs), transparent: true, depthWrite: false })
  )
  contact.rotation.x = -Math.PI / 2
  contact.position.y = 0.001
  stage.add(contact)

  const tex = createPSBTextures({ size: window.innerWidth < 700 ? 768 : 1024 })
  const block = new THREE.Mesh(
    boxUVs(new RoundedBoxGeometry(L, Hh, W, 4, 0.004), tex.tile),
    new THREE.MeshStandardMaterial({
      map: tex.map,
      normalMap: tex.normalMap,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughnessMap: tex.roughnessMap,
      roughness: 1,
      metalness: 0,
    })
  )
  block.position.y = Hh / 2
  block.castShadow = true
  block.receiveShadow = true
  stage.add(block)

  // dimension lines
  const dims = new THREE.Group()
  const lineMat = new THREE.LineBasicMaterial({ color: 0x22201c, transparent: true, opacity: 0 })
  const seg = (a, b) => {
    dims.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]), lineMat))
  }
  const o = 0.06
  const t = 0.018
  seg([-L / 2, 0.002, W / 2 + o], [L / 2, 0.002, W / 2 + o])
  seg([-L / 2, 0.002, W / 2 + o - t], [-L / 2, 0.002, W / 2 + o + t])
  seg([L / 2, 0.002, W / 2 + o - t], [L / 2, 0.002, W / 2 + o + t])
  seg([L / 2 + o, 0, W / 2], [L / 2 + o, Hh, W / 2])
  seg([L / 2 + o - t, 0, W / 2], [L / 2 + o + t, 0, W / 2])
  seg([L / 2 + o - t, Hh, W / 2], [L / 2 + o + t, Hh, W / 2])
  seg([-L / 2 - o, 0.002, -W / 2], [-L / 2 - o, 0.002, W / 2])
  seg([-L / 2 - o - t, 0.002, -W / 2], [-L / 2 - o + t, 0.002, -W / 2])
  seg([-L / 2 - o - t, 0.002, W / 2], [-L / 2 - o + t, 0.002, W / 2])
  stage.add(dims)
  const labels = root.querySelectorAll('.tech__dims span')
  // each label sits on its dimension line and is pushed off it in screen
  // space, so it never overlaps the line however small the viewer gets
  const labelPos = [
    new THREE.Vector3(0, 0.002, W / 2 + o),
    new THREE.Vector3(L / 2 + o, Hh / 2, W / 2),
    new THREE.Vector3(-L / 2 - o, 0.002, 0),
  ]
  const labelAnchor = ['translate(-50%, 0.5em)', 'translate(0.7em, -50%)', 'translate(calc(-100% - 0.7em), -50%)']

  // water droplets beading on the top face
  const drops = new THREE.Group()
  const dropMat = new THREE.MeshPhysicalMaterial({
    color: 0xeef3f5,
    roughness: 0.02,
    transmission: 0.82,
    thickness: 0.02,
    ior: 1.33,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    specularIntensity: 1,
    envMapIntensity: 2.2,
  })
  const dropGeo = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)
  // beads scattered over the top face, larger ones first so they appear first
  const beads = []
  let ds = 11
  const dr = () => ((ds = (ds * 16807) % 2147483647) / 2147483647)
  while (beads.length < 26) {
    const x = (dr() - 0.5) * (L - 0.08)
    const z = (dr() - 0.5) * (W - 0.08)
    const r = 0.007 + Math.pow(dr(), 1.6) * 0.019
    if (beads.every(([bx, bz, br]) => Math.hypot(x - bx, z - bz) > r + br + 0.012)) beads.push([x, z, r])
  }
  beads.sort((p, q) => q[2] - p[2])
  for (const [x, z, r] of beads) {
    const d = new THREE.Mesh(dropGeo, dropMat)
    d.position.set(x, Hh + 0.0005, z)
    d.userData.r = r
    d.scale.setScalar(0.0001)
    drops.add(d)
  }
  stage.add(drops)

  // loupe overlay (HTML) and its leader line (SVG)
  const loupe = root.querySelector('[data-loupe]')
  const loupeImg = loupe?.querySelector('img')
  const loupeLabel = root.querySelector('[data-loupe-label]')
  const lead = root.querySelector('[data-lead]')
  const leadLine = lead?.querySelector('line')
  const leadDot = lead?.querySelector('circle')

  // ---------------------------------------------------------------- state
  let state = GEOMETRY
  let dims01 = 1
  let drops01 = 0
  root.addEventListener('tech:point', (e) => {
    state = e.detail
    const l = LOUPE[state]
    if (l && loupe) {
      loupeLabel.textContent = l.label
      if (loupeImg) {
        loupeImg.style.objectPosition = l.pos
        loupeImg.style.transform = `scale(${l.zoom})`
      }
    }
    root.classList.toggle('show-loupe', !!l)
  })

  // ---------------------------------------------------------------- loop
  let visible = true
  visibility(root, (v) => (visible = v))
  const resize = () => {
    const r = root.getBoundingClientRect()
    renderer.setSize(r.width, r.height, false)
    camera.aspect = r.width / r.height
    camera.updateProjectionMatrix()
  }
  new ResizeObserver(resize).observe(root)
  resize()

  const still = reducedMotion()
  let prev = performance.now()
  let elapsed = 0
  const tmp = new THREE.Vector3()
  const loop = () => {
    requestAnimationFrame(loop)
    if (!visible) return
    const now = performance.now()
    const dt = Math.min((now - prev) / 1000, 0.05)
    prev = now
    elapsed += dt
    const k = 1 - Math.pow(0.003, dt)

    // the branch outside "breathes" in a light breeze — a few pixels, slowly
    if (!still) {
      leaves.rotation = Math.sin(elapsed * 0.35) * 0.018 + Math.sin(elapsed * 0.9) * 0.004
      leaves.offset.set(Math.sin(elapsed * 0.23) * 0.006, Math.cos(elapsed * 0.31) * 0.004)
    }

    dims01 += ((state === GEOMETRY ? 1 : 0) - dims01) * k
    lineMat.opacity = dims01 * 0.75
    drops01 += ((state === WATER ? 1 : 0) - drops01) * k * 0.8
    drops.children.forEach((d, i) => {
      const s = Math.max(0.0001, clamp(drops01 * 2 - i * 0.035) * d.userData.r)
      d.scale.set(s, s * 0.62, s)
    })

    renderer.render(scene, camera)

    labels.forEach((el, i) => {
      tmp.copy(labelPos[i]).applyMatrix4(stage.matrixWorld).project(camera)
      el.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * 100}cqw, ${(-tmp.y * 0.5 + 0.5) * 100}cqh) ${labelAnchor[i]}`
      el.style.opacity = String(dims01)
    })

    // leader line from the loupe to the point on the block
    const l = LOUPE[state]
    if (l && lead && loupe) {
      tmp.set(...l.at).applyMatrix4(stage.matrixWorld).project(camera)
      const box = root.getBoundingClientRect()
      const lb = loupe.getBoundingClientRect()
      const x = (tmp.x * 0.5 + 0.5) * box.width
      const y = (-tmp.y * 0.5 + 0.5) * box.height
      const cx = lb.left - box.left + lb.width / 2
      const cy = lb.top - box.top + lb.height / 2
      const ang = Math.atan2(y - cy, x - cx)
      const rr = lb.width / 2
      leadLine.setAttribute('x1', String(cx + Math.cos(ang) * rr))
      leadLine.setAttribute('y1', String(cy + Math.sin(ang) * rr))
      leadLine.setAttribute('x2', String(x))
      leadLine.setAttribute('y2', String(y))
      leadDot.setAttribute('cx', String(x))
      leadDot.setAttribute('cy', String(y))
    }
  }

  requestAnimationFrame(() => {
    loop()
    root.classList.add('is-3d')
  })
}
