import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createPSBTextures, boxUVs } from './psb-texture.js'
import { visibility, reducedMotion, webglAvailable, clamp } from '../js/utils.js'

const L = 0.6
const Hh = 0.3
const W = 0.4

// camera presets per highlighted property: yaw, pitch, distance, look-at
const VIEWS = [
  { yaw: -0.62, pitch: 0.42, dist: 2.25, target: [0, 0.13, 0] }, // geometry: whole block + dimensions
  { yaw: -0.5, pitch: 0.22, dist: 1.05, target: [0.06, 0.15, 0.0] }, // granules: close to the face
  { yaw: -0.95, pitch: 0.55, dist: 1.55, target: [0, 0.12, 0] }, // matrix: raking light over the top
  { yaw: -0.35, pitch: 0.75, dist: 1.35, target: [0.02, 0.28, 0] }, // water: droplets on top
]
const GEOMETRY = 0
const MATRIX = 2
const WATER = 3

export function initBlockViewer(root) {
  if (!webglAvailable()) return
  const canvas = root.querySelector('canvas')
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.localClippingEnabled = false

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.55

  const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 20)

  // lights: warm key from upper left, cool fill, soft shadow on an invisible floor
  const key = new THREE.DirectionalLight(0xfff1df, 2.4)
  key.position.set(-1.6, 2.4, 1.4)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.left = -0.8
  key.shadow.camera.right = 0.8
  key.shadow.camera.top = 0.8
  key.shadow.camera.bottom = -0.8
  key.shadow.radius = 8
  key.shadow.blurSamples = 20
  key.shadow.bias = -0.0004
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xe8eef6, 0.5)
  fill.position.set(2, 0.8, 1.6)
  scene.add(fill)

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.16 }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  // contact shadow: a soft dark ellipse right under the block
  const cs = document.createElement('canvas')
  cs.width = cs.height = 256
  const g = cs.getContext('2d')
  const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128)
  grad.addColorStop(0, 'rgba(40,32,24,0.55)')
  grad.addColorStop(0.55, 'rgba(40,32,24,0.18)')
  grad.addColorStop(1, 'rgba(40,32,24,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(L * 1.5, W * 1.7),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cs), transparent: true, depthWrite: false })
  )
  contact.rotation.x = -Math.PI / 2
  contact.position.y = 0.001
  scene.add(contact)

  // the block
  const tex = createPSBTextures({ size: window.innerWidth < 700 ? 768 : 1024 })
  const geo = boxUVs(new RoundedBoxGeometry(L, Hh, W, 4, 0.004), tex.tile)
  const mat = new THREE.MeshStandardMaterial({
    map: tex.map,
    normalMap: tex.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: tex.roughnessMap,
    roughness: 1,
    metalness: 0,
  })
  const block = new THREE.Mesh(geo, mat)
  block.position.y = Hh / 2
  block.castShadow = true
  block.receiveShadow = true
  const pivot = new THREE.Group()
  pivot.add(block, contact)
  scene.add(pivot)

  // dimension lines (geometry state)
  const dims = new THREE.Group()
  const lineMat = new THREE.LineBasicMaterial({ color: 0x22201c, transparent: true, opacity: 0 })
  const seg = (a, b) => {
    const gg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)])
    dims.add(new THREE.Line(gg, lineMat))
  }
  const o = 0.06
  const t = 0.018
  // length along X, in front of the block on the floor
  seg([-L / 2, 0.002, W / 2 + o], [L / 2, 0.002, W / 2 + o])
  seg([-L / 2, 0.002, W / 2 + o - t], [-L / 2, 0.002, W / 2 + o + t])
  seg([L / 2, 0.002, W / 2 + o - t], [L / 2, 0.002, W / 2 + o + t])
  // height along Y at the front-right corner
  seg([L / 2 + o, 0, W / 2], [L / 2 + o, Hh, W / 2])
  seg([L / 2 + o - t, 0, W / 2], [L / 2 + o + t, 0, W / 2])
  seg([L / 2 + o - t, Hh, W / 2], [L / 2 + o + t, Hh, W / 2])
  // width along Z, on the floor beside the left end (the end facing the camera)
  seg([-L / 2 - o, 0.002, -W / 2], [-L / 2 - o, 0.002, W / 2])
  seg([-L / 2 - o - t, 0.002, -W / 2], [-L / 2 - o + t, 0.002, -W / 2])
  seg([-L / 2 - o - t, 0.002, W / 2], [-L / 2 - o + t, 0.002, W / 2])
  pivot.add(dims)
  const labels = root.querySelectorAll('.tech__dims span')
  const labelPos = [
    new THREE.Vector3(0, 0.002, W / 2 + o + 0.045),
    new THREE.Vector3(L / 2 + o + 0.06, Hh / 2, W / 2),
    new THREE.Vector3(-L / 2 - o - 0.07, 0.002, 0),
  ]

  // water droplets (water state)
  const drops = new THREE.Group()
  const dropMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.03,
    transmission: 1,
    thickness: 0.01,
    ior: 1.33,
    transparent: true,
    envMapIntensity: 1.4,
  })
  const dropGeo = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)
  const dropSpots = [
    [-0.12, 0.05, 0.014], [0.04, -0.06, 0.011], [0.15, 0.08, 0.016], [-0.02, 0.1, 0.008],
    [0.2, -0.1, 0.01], [-0.19, -0.08, 0.012], [0.09, 0.02, 0.007],
  ]
  for (const [x, z, r] of dropSpots) {
    const d = new THREE.Mesh(dropGeo, dropMat)
    d.position.set(x, Hh + 0.0005, z)
    d.userData.r = r
    d.scale.setScalar(0.0001)
    drops.add(d)
  }
  pivot.add(drops)

  // ---------------------------------------------------------------- state
  let state = GEOMETRY
  let yaw = VIEWS[0].yaw
  let pitch = VIEWS[0].pitch
  let dist = VIEWS[0].dist
  const target = new THREE.Vector3(...VIEWS[0].target)
  let goal = { ...VIEWS[0], target: new THREE.Vector3(...VIEWS[0].target) }
  let userYaw = 0
  let userPitch = 0
  let vel = 0
  let dims01 = 1
  let drops01 = 0
  let idle = 0

  root.addEventListener('tech:point', (e) => {
    state = e.detail
    const v = VIEWS[state]
    goal = { ...v, target: new THREE.Vector3(...v.target) }
    userYaw *= 0.3
    userPitch = 0
  })

  // drag to rotate
  let dragging = false
  let lx = 0
  let ly = 0
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true
    lx = e.clientX
    ly = e.clientY
    canvas.setPointerCapture(e.pointerId)
    root.classList.add('was-dragged')
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return
    const dx = e.clientX - lx
    const dy = e.clientY - ly
    lx = e.clientX
    ly = e.clientY
    vel = dx * 0.006
    userYaw += vel
    userPitch = clamp(userPitch + dy * 0.003, -0.25, 0.45)
    idle = 0
  })
  const end = () => (dragging = false)
  canvas.addEventListener('pointerup', end)
  canvas.addEventListener('pointercancel', end)

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
    const k = 1 - Math.pow(0.0025, dt) // frame-rate independent damping

    if (!dragging) {
      userYaw += vel
      vel *= Math.pow(0.04, dt)
      idle += dt
      if (!still && idle > 2.5 && state === GEOMETRY) userYaw += dt * 0.08
    }
    yaw += (goal.yaw + userYaw - yaw) * k
    pitch += (goal.pitch + userPitch - pitch) * k
    dist += (goal.dist - dist) * k
    target.lerp(goal.target, k)

    camera.position.set(
      target.x + dist * Math.cos(pitch) * Math.sin(yaw),
      target.y + dist * Math.sin(pitch),
      target.z + dist * Math.cos(pitch) * Math.cos(yaw)
    )
    camera.lookAt(target)

    // move the key light for the "matrix" state so it rakes across the top
    const kp = state === MATRIX ? [-2.4, 0.9, -0.4] : [-1.6, 2.4, 1.4]
    key.position.lerp(tmp.set(...kp), k * 0.6)

    dims01 += ((state === GEOMETRY ? 1 : 0) - dims01) * k
    lineMat.opacity = dims01 * 0.75
    drops01 += ((state === WATER ? 1 : 0) - drops01) * k * 0.8
    drops.children.forEach((d, i) => {
      const s = Math.max(0.0001, clamp(drops01 * 1.4 - i * 0.06) * d.userData.r)
      d.scale.set(s, s * 0.62, s)
    })

    renderer.render(scene, camera)

    // project dimension labels
    labels.forEach((el, i) => {
      tmp.copy(labelPos[i]).applyMatrix4(pivot.matrixWorld).project(camera)
      el.style.transform = `translate(-50%, -50%) translate(${(tmp.x * 0.5 + 0.5) * 100}cqw, ${(-tmp.y * 0.5 + 0.5) * 100}cqh)`
      el.style.opacity = String(dims01)
    })
  }

  // first frame, then fade the canvas in over the static render
  requestAnimationFrame(() => {
    loop()
    root.classList.add('is-3d')
  })
}
