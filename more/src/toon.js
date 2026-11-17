// Toon materials, rim light and ink outlines shared by every scene.
import * as THREE from 'three';

// Shared uniforms: updated once per frame by the renderer.
export const shared = {
  rimColor: { value: new THREE.Color('#ffb48a') },
  rimStrength: { value: 0.9 },
  rimDir: { value: new THREE.Vector3(0, 0, -1) }, // view-space direction towards the key light
  rimWidth: { value: 0.6 },
  outlineScale: { value: 1.0 },
};

let gradientMap;
export function gradient() {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([60, 150, 255]);
  gradientMap = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

const RIM_CHUNK = `
{
  vec3 vdir = normalize(vViewPosition);
  float fres = 1.0 - max(dot(normal, vdir), 0.0);
  float side = smoothstep(-0.15, 0.35, dot(normal, rimDir));
  float r = smoothstep(rimWidth, rimWidth + 0.05, fres) * side;
  outgoingLight += rimColor * rimStrength * r * (0.35 + 0.65 * diffuseColor.rgb) * rimAmount;
}
#include <opaque_fragment>`;

export function toon(color, opts = {}) {
  const { rim = 1, ...rest } = opts;
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradient(), ...rest });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = shared.rimColor;
    sh.uniforms.rimStrength = shared.rimStrength;
    sh.uniforms.rimDir = shared.rimDir;
    sh.uniforms.rimWidth = shared.rimWidth;
    sh.uniforms.rimAmount = { value: rim };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 rimColor; uniform float rimStrength; uniform vec3 rimDir; uniform float rimWidth; uniform float rimAmount;`)
      .replace('#include <opaque_fragment>', RIM_CHUNK);
  };
  m.customProgramCacheKey = () => 'toonrim';
  return m;
}

const outlineCache = new Map();
export function outlineMaterial(color = '#1b0f16', width = 0.0022) {
  const key = color + width;
  if (outlineCache.has(key)) return outlineCache.get(key);
  const m = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      width: { value: width },
      outlineScale: shared.outlineScale,
      ...THREE.UniformsLib.fog,
    },
    vertexShader: `
      uniform float width; uniform float outlineScale;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        float d = clamp(-mvPosition.z, 0.4, 25.0);
        mvPosition.xyz += n * width * outlineScale * d;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform vec3 color;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    side: THREE.BackSide,
    fog: true,
  });
  outlineCache.set(key, m);
  return m;
}

// Adds an ink outline as a child that shares the mesh geometry.
export function ink(mesh, width = 0.0022, color = '#1b0f16') {
  const o = new THREE.Mesh(mesh.geometry, outlineMaterial(color, width));
  o.name = 'outline';
  o.castShadow = false;
  o.receiveShadow = false;
  mesh.add(o);
  return mesh;
}

export function mesh(geo, mat, { outline = true, width, shadow = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  if (outline) ink(m, width);
  return m;
}

// Deterministic random
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
export const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInOut = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
