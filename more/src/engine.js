// Renderer, post-processing and the frame API used by the headless renderer.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { shared } from './toon.js';

export const W = 1080, H = 1920;

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, vignette: { value: 0.55 }, grain: { value: 0.05 }, lift: { value: new THREE.Color('#1a0f2a') }, flash: { value: 0 }, aberr: { value: 0.0015 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, vignette, grain, flash, aberr; uniform vec3 lift; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * aberr * (1.0 + r2 * 4.0);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      col = col + lift * (1.0 - col) * 0.35;
      float v = smoothstep(0.85, 0.15, length(c * vec2(1.0, 0.75)) * (1.0 + vignette));
      col *= mix(1.0, v, vignette);
      col += (hash(vUv * vec2(1080.0, 1920.0) + fract(time * 13.7) * 100.0) - 0.5) * grain;
      col = mix(col, vec3(1.0, 0.95, 0.9), flash);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createEngine(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, W / H, 0.05, 2000);

  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.32, 0.45, 0.92);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  const E = { renderer, scene, camera, composer, bloom, grade };
  const tmp = new THREE.Vector3();
  E.render = (t, world) => {
    if (world) {
      // rim direction in view space toward the key light
      camera.updateMatrixWorld();
      tmp.copy(world.sunDir).transformDirection(camera.matrixWorldInverse);
      shared.rimDir.value.copy(tmp);
      shared.rimColor.value.copy(world.pal.rim);
    }
    grade.uniforms.time.value = t;
    composer.render();
  };
  return E;
}
