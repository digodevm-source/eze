/*!
 * FORMLESS® — WebGL scene
 * Glass-like bioluminescent butterflies with flowing tendrils, bloom and dust.
 * Plain WebGL2, no dependencies. Exposes window.FormlessScene.
 */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth01(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function smoother01(t) { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); }
  function rng(seed) {
    var s = (seed * 2654435761) >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  /* ------------------------------------------------------------------ */
  /* Matrices (column-major)                                             */
  /* ------------------------------------------------------------------ */
  var m4 = {
    id: function () { var o = new Float32Array(16); o[0] = o[5] = o[10] = o[15] = 1; return o; },
    mul: function (a, b) {
      var o = new Float32Array(16);
      for (var c = 0; c < 4; c++) {
        var b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
        o[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
        o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
        o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
        o[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
      }
      return o;
    },
    chain: function () {
      var r = arguments[0];
      for (var i = 1; i < arguments.length; i++) r = m4.mul(r, arguments[i]);
      return r;
    },
    t: function (x, y, z) { var o = m4.id(); o[12] = x; o[13] = y; o[14] = z; return o; },
    s: function (x, y, z) { var o = m4.id(); o[0] = x; o[5] = y; o[10] = z; return o; },
    rx: function (a) { var o = m4.id(), c = Math.cos(a), s = Math.sin(a); o[5] = c; o[6] = s; o[9] = -s; o[10] = c; return o; },
    ry: function (a) { var o = m4.id(), c = Math.cos(a), s = Math.sin(a); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o; },
    rz: function (a) { var o = m4.id(), c = Math.cos(a), s = Math.sin(a); o[0] = c; o[1] = s; o[4] = -s; o[5] = c; return o; },
    persp: function (fovy, aspect, n, f) {
      var o = new Float32Array(16), q = 1 / Math.tan(fovy / 2);
      o[0] = q / aspect; o[5] = q; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = (2 * f * n) / (n - f);
      return o;
    },
    pt: function (m, x, y, z) {
      return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
    },
    dir: function (m, x, y, z) {
      return [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];
    }
  };

  /* ------------------------------------------------------------------ */
  /* Shaders                                                             */
  /* ------------------------------------------------------------------ */
  var NOISE = [
    'float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
    'float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y); }'
  ].join('\n');

  var WING_VS = [
    '#version 300 es',
    'precision highp float;',
    'layout(location = 0) in vec2 aST;',
    'uniform mat4 uPV;',
    'uniform mat4 uModel;',
    'uniform vec4 uShapeA;  // length, half angle, tip power, profile power',
    'uniform vec4 uShapeB;  // sweep, curl, cup, ruffle',
    'uniform vec4 uAnim;    // time, flex, seed, ruffle frequency',
    'out vec2 vST;',
    'out float vEdge;',
    'out vec3 vN;',
    'out vec3 vW;',
    'float outlineR(float t){',
    '  float at = abs(t);',
    '  float prof = pow(max(1.0 - pow(at, uShapeA.z), 0.0), uShapeA.w);',
    '  float wav = 1.0 + 0.05 * sin(t * 7.0 + uAnim.z) + 0.03 * sin(t * 15.0 + uAnim.z * 1.7) + 0.015 * sin(t * 31.0 + uAnim.z * 2.9);',
    '  return uShapeA.x * prof * wav;',
    '}',
    'vec3 petal(vec2 st){',
    '  float s = st.x; float t = st.y; float L = uShapeA.x;',
    '  float r = s * outlineR(t);',
    '  float ang = t * uShapeA.y + uShapeB.x * s * s;',
    '  vec3 p = vec3(cos(ang) * r, sin(ang) * r, 0.0);',
    '  float z = uShapeB.z * L * t * t * s;',
    '  z += uShapeB.y * L * s * s;',
    '  z += uShapeB.w * L * s * s * sin(t * uAnim.w + uAnim.z + uAnim.x * 1.1 + s * 3.0);',
    '  z += 0.25 * uShapeB.w * L * smoothstep(0.7, 1.0, s) * sin(t * uAnim.w * 2.3 - uAnim.x * 0.8 + uAnim.z * 3.1);',
    '  z += 0.04 * L * sin(t * 3.14159 * 2.0 + uAnim.z) * s;',
    '  z += uAnim.y * L * s * s * (1.0 + 0.4 * t);',
    '  p.z = z;',
    '  return p;',
    '}',
    'void main(){',
    '  vec3 p = petal(aST);',
    '  vec2 sts = vec2(max(aST.x, 0.04), clamp(aST.y, -0.97, 0.97));',
    '  vec3 ps = petal(sts);',
    '  vec3 dS = petal(sts + vec2(0.004, 0.0)) - ps;',
    '  vec3 dT = petal(sts + vec2(0.0, 0.004)) - ps;',
    '  vec3 n = cross(dS, dT);',
    '  float nl = length(n);',
    '  n = nl > 1e-9 ? n / nl : vec3(0.0, 0.0, 1.0);',
    '  vec4 w = uModel * vec4(p, 1.0);',
    '  vW = w.xyz;',
    '  vN = mat3(uModel) * n;',
    '  vST = aST;',
    '  vEdge = (1.0 - aST.x) * outlineR(aST.y);',
    '  gl_Position = uPV * w;',
    '}'
  ].join('\n');

  var WING_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vST;',
    'in float vEdge;',
    'in vec3 vN;',
    'in vec3 vW;',
    'uniform vec3 uCam;',
    'uniform vec4 uShapeA;',
    'uniform vec4 uAnim;',
    'uniform float uGain;',
    'out vec4 o;',
    NOISE,
    'float vein(float x, float w){',
    '  float d = abs(fract(x + 0.5) - 0.5);',
    '  float fw = max(fwidth(x), 1e-5);',
    '  float ww = max(w, fw * 0.75);',
    '  return (1.0 - smoothstep(ww - fw * 0.5, ww + fw * 0.5, d)) * (w / ww);',
    '}',
    'void main(){',
    '  float s = vST.x; float t = vST.y; float L = uShapeA.x; float seed = uAnim.z;',
    '  vec3 N = vN / max(length(vN), 1e-6);',
    '  vec3 V = normalize(uCam - vW);',
    '  float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);',
    '  float fres = pow(1.0 - ndv, 2.6);',
    '  float fe = max(fwidth(vEdge), 1e-5);',
    '  float alpha = smoothstep(0.0, fe * 1.5, vEdge);',
    '  float rimLine = 1.0 - smoothstep(fe * 0.6, fe * 0.6 + 0.012 * L, vEdge);',
    '  float rimSoft = 1.0 - smoothstep(0.0, 0.16 * L, vEdge);',
    '  float wob = 0.07 * sin(s * 6.0 + t * 4.0 + seed) + 0.08 * (vnoise(vec2(t * 5.0 + seed, s * 3.0)) - 0.5);',
    '  float v1 = vein(t * 5.5 + wob, 0.03);',
    '  float v2 = vein(t * 11.0 + wob * 1.7 + 0.5, 0.045) * smoothstep(0.22, 0.5, s);',
    '  float v3 = vein(t * 23.0 + wob * 2.6 + 0.25 + 0.25 * sin(s * 13.0 + seed), 0.06) * smoothstep(0.45, 0.8, s);',
    '  float veins = (v1 + v2 * 0.55 + v3 * 0.28) * (1.0 - 0.5 * smoothstep(0.9, 1.0, s));',
    '  float frost = vnoise(vec2(t * 26.0, s * 34.0) + seed) * vnoise(vec2(t * 61.0, s * 83.0) - seed);',
    '  float folds = 0.5 + 0.5 * sin(t * 9.0 + wob * 6.0 + seed);',
    '  vec3 Lg = normalize(vec3(-0.45, 0.65, 0.62));',
    '  vec3 H = normalize(Lg + V);',
    '  float spec = pow(clamp(abs(dot(N, H)), 0.0, 1.0), 48.0);',
    '  float diff = clamp(abs(dot(N, Lg)), 0.0, 1.0);',
    '  vec3 deep = vec3(0.05, 0.12, 0.34);',
    '  vec3 ice  = vec3(0.48, 0.66, 1.00);',
    '  vec3 milk = vec3(0.80, 0.88, 1.00);',
    '  vec3 warm = vec3(1.00, 0.94, 0.86);',
    '  float core = exp(-s * 7.0);',
    '  float body = 0.55 + 0.45 * smoothstep(0.0, 0.5, s);',
    '  vec3 col = deep * (0.16 + 0.14 * diff) * body;',
    '  col += milk * (0.025 + 0.05 * folds * folds) * (1.0 - 0.5 * s);',
    '  col += ice * fres * 0.95;',
    '  col += milk * rimSoft * rimSoft * 0.26;',
    '  col += vec3(0.86, 0.93, 1.0) * rimLine * 1.0;',
    '  col += mix(ice, milk, 0.7) * veins * (0.22 + 0.42 * (1.0 - s));',
    '  col += warm * core * 0.75;',
    '  col += milk * spec * 0.7;',
    '  col += ice * frost * 0.08;',
    '  col += vec3(0.22, 0.08, 0.32) * fres * 0.25 * (0.5 + 0.5 * sin(t * 6.0 + s * 4.0 + uAnim.x * 0.4));',
    '  col = max(col, vec3(0.0));',
    '  o = vec4(col * alpha * uGain, 0.0);',
    '}'
  ].join('\n');

  var RIBBON_VS = [
    '#version 300 es',
    'precision highp float;',
    'layout(location = 0) in vec3 aPos;',
    'layout(location = 1) in vec4 aData; // across, along, gain, style',
    'uniform mat4 uPV;',
    'out vec4 vD;',
    'void main(){ vD = aData; gl_Position = uPV * vec4(aPos, 1.0); }'
  ].join('\n');

  var RIBBON_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec4 vD;',
    'uniform float uTime;',
    'out vec4 o;',
    NOISE,
    'void main(){',
    '  float x = vD.x; float a = abs(x); float along = vD.y;',
    '  float fw = max(fwidth(x), 1e-4);',
    '  float aa = 1.0 - smoothstep(1.0 - fw * 1.5, 1.0, a);',
    '  float thin = clamp((fw - 0.18) * 2.2, 0.0, 1.0);',
    '  vec3 deep = vec3(0.05, 0.11, 0.32);',
    '  vec3 ice = vec3(0.42, 0.62, 1.0);',
    '  vec3 white = vec3(0.86, 0.93, 1.0);',
    '  vec3 col;',
    '  if (vD.w < 0.5) {',
    '    float rim = pow(a, 5.0);',
    '    float streak = exp(-pow((x + 0.42) / 0.16, 2.0));',
    '    float streak2 = exp(-pow((x - 0.55) / 0.1, 2.0)) * 0.4;',
    '    col = deep * 0.6 + ice * rim * 0.9 + white * (streak * 0.45 + streak2 * 0.3);',
    '    col = mix(col, ice * 0.55 + white * 0.08, thin);',
    '    float fade = smoothstep(0.0, 0.05, along) * (1.0 - smoothstep(0.45, 1.0, along));',
    '    float spark = pow(vnoise(vec2(along * 70.0 - uTime * 0.7, vD.z * 37.0)), 10.0) * 1.6;',
    '    col += white * spark * (1.0 - a);',
    '    col *= fade;',
    '  } else {',
    '    float core = 1.0 - a * a;',
    '    float tip = smoothstep(0.86, 1.0, along);',
    '    col = mix(ice, white, 0.5 + 0.5 * tip) * core * (0.7 + 0.8 * tip);',
    '    col *= smoothstep(0.0, 0.25, along);',
    '  }',
    '  o = vec4(col * aa * vD.z, 0.0);',
    '}'
  ].join('\n');

  var SPRITE_VS = [
    '#version 300 es',
    'precision highp float;',
    'layout(location = 0) in vec2 aCorner;',
    'uniform mat4 uPV;',
    'uniform vec3 uCenter;',
    'uniform vec2 uSize;',
    'out vec2 vUv;',
    'void main(){ vUv = aCorner; gl_Position = uPV * vec4(uCenter + vec3(aCorner * uSize, 0.0), 1.0); }'
  ].join('\n');

  var CORE_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUv;',
    'uniform float uGain;',
    'uniform float uSeed;',
    'uniform float uTime;',
    'out vec4 o;',
    NOISE,
    'void main(){',
    '  float r = length(vUv);',
    '  float g = exp(-r * r * 70.0) * 1.05 + exp(-r * r * 16.0) * 0.26 + exp(-r * 4.5) * 0.07;',
    '  vec2 p = vUv * 9.0 + uSeed * 3.7;',
    '  vec2 ip = floor(p); vec2 fp = fract(p);',
    '  float f1 = 8.0;',
    '  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {',
    '    vec2 b = vec2(float(i), float(j));',
    '    vec2 rnd = vec2(h21(ip + b), h21(ip + b + 17.3));',
    '    rnd = 0.5 + 0.38 * sin(uTime * 0.5 + 6.2831 * rnd);',
    '    vec2 d = b + rnd - fp;',
    '    f1 = min(f1, dot(d, d));',
    '  }',
    '  float bub = (1.0 - smoothstep(0.0, 0.16, f1)) * (1.0 - smoothstep(0.08, 0.3, r));',
    '  float shell = smoothstep(0.1, 0.3, f1) * (1.0 - smoothstep(0.12, 0.3, r)) * 0.25;',
    '  vec3 warm = vec3(1.0, 0.95, 0.88); vec3 ice = vec3(0.48, 0.66, 1.0);',
    '  vec3 col = mix(ice, warm, exp(-r * r * 20.0)) * g + warm * bub * 0.45 + ice * shell * 0.3;',
    '  o = vec4(col * uGain * (1.0 - smoothstep(0.8, 1.0, r)), 0.0);',
    '}'
  ].join('\n');

  var PEARL_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUv;',
    'uniform float uGain;',
    'out vec4 o;',
    'void main(){',
    '  float r2 = dot(vUv, vUv);',
    '  float fw = fwidth(r2);',
    '  float a = 1.0 - smoothstep(1.0 - fw * 1.5, 1.0, r2);',
    '  if (a <= 0.0) discard;',
    '  vec3 n = vec3(vUv, sqrt(max(0.0, 1.0 - r2)));',
    '  vec3 L = normalize(vec3(-0.45, 0.62, 0.65));',
    '  float diff = max(dot(n, L), 0.0);',
    '  float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 30.0);',
    '  float fres = pow(1.0 - n.z, 2.0);',
    '  vec3 base = mix(vec3(0.42, 0.50, 0.78), vec3(0.86, 0.85, 0.98), diff);',
    '  vec3 irid = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + n.x * 0.55 + n.y * 0.35 + 0.15));',
    '  vec3 col = base * (0.3 + 0.7 * diff) + irid * fres * 0.4 + vec3(1.0) * spec * 1.25 + vec3(0.6, 0.75, 1.0) * fres * 0.45;',
    '  col += vec3(1.0, 0.86, 0.82) * smoothstep(0.1, -0.9, n.y) * 0.35;',
    '  o = vec4(col * a * uGain, a * 0.97 * uGain);',
    '}'
  ].join('\n');

  var DUST_VS = [
    '#version 300 es',
    'precision highp float;',
    'layout(location = 0) in vec4 aP;',
    'uniform mat4 uPV;',
    'uniform vec2 uVis;',
    'uniform float uTime;',
    'uniform float uScroll;',
    'uniform float uPx;',
    'out float vA;',
    'void main(){',
    '  float d = aP.z;',
    '  float y = fract(aP.y - uTime * (0.004 + 0.01 * aP.w) - uScroll * (0.12 + 0.55 * d));',
    '  float x = aP.x + 0.015 * sin(uTime * 0.25 + aP.w * 40.0) + 0.01 * sin(uTime * 0.11 + aP.w * 13.0);',
    '  vec3 pos = vec3((x - 0.5) * uVis.x * 1.08, (0.5 - y) * uVis.y * 1.1, (d - 0.5) * 2.0);',
    '  gl_Position = uPV * vec4(pos, 1.0);',
    '  float tw = 0.55 + 0.45 * sin(uTime * (0.6 + aP.w) + aP.w * 60.0);',
    '  vA = (0.18 + 0.7 * d * d) * tw;',
    '  gl_PointSize = (1.2 + 3.2 * d * d) * uPx;',
    '}'
  ].join('\n');

  var DUST_FS = [
    '#version 300 es',
    'precision highp float;',
    'in float vA;',
    'out vec4 o;',
    'void main(){',
    '  float r = length(gl_PointCoord - 0.5) * 2.0;',
    '  float a = exp(-r * r * 3.5) * (1.0 - smoothstep(0.7, 1.0, r));',
    '  o = vec4(vec3(0.62, 0.76, 1.0) * a * vA, 0.0);',
    '}'
  ].join('\n');

  var FS_VS = [
    '#version 300 es',
    'precision highp float;',
    'layout(location = 0) in vec2 aPos;',
    'out vec2 vUv;',
    'void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  var DOWN_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUv;',
    'uniform sampler2D uTex;',
    'uniform vec2 uTexel;',
    'out vec4 o;',
    'void main(){',
    '  vec2 h = uTexel;',
    '  vec4 s = texture(uTex, vUv) * 4.0;',
    '  s += texture(uTex, vUv - h);',
    '  s += texture(uTex, vUv + h);',
    '  s += texture(uTex, vUv + vec2(h.x, -h.y));',
    '  s += texture(uTex, vUv - vec2(h.x, -h.y));',
    '  o = s / 8.0;',
    '  if (any(isnan(o)) || any(isinf(o))) o = vec4(0.0);',
    '}'
  ].join('\n');

  var UP_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUv;',
    'uniform sampler2D uTex;',
    'uniform vec2 uTexel;',
    'out vec4 o;',
    'void main(){',
    '  vec2 h = uTexel;',
    '  vec4 s = texture(uTex, vUv + vec2(-h.x * 2.0, 0.0));',
    '  s += texture(uTex, vUv + vec2(-h.x, h.y)) * 2.0;',
    '  s += texture(uTex, vUv + vec2(0.0, h.y * 2.0));',
    '  s += texture(uTex, vUv + vec2(h.x, h.y)) * 2.0;',
    '  s += texture(uTex, vUv + vec2(h.x * 2.0, 0.0));',
    '  s += texture(uTex, vUv + vec2(h.x, -h.y)) * 2.0;',
    '  s += texture(uTex, vUv + vec2(0.0, -h.y * 2.0));',
    '  s += texture(uTex, vUv + vec2(-h.x, -h.y)) * 2.0;',
    '  o = s / 12.0;',
    '}'
  ].join('\n');

  var COMPOSITE_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUv;',
    'uniform sampler2D uScene;',
    'uniform sampler2D uBloom;',
    'uniform float uBloomGain;',
    'uniform float uExposure;',
    'uniform float uTime;',
    'uniform float uFade;',
    'uniform vec2 uRes;',
    'out vec4 o;',
    NOISE,
    'void main(){',
    '  vec3 sc = texture(uScene, vUv).rgb;',
    '  if (any(isnan(sc)) || any(isinf(sc))) sc = vec3(0.0);',
    '  vec3 bl = texture(uBloom, vUv).rgb;',
    '  vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;',
    '  float vig = 1.0 - smoothstep(0.25, 1.15, length(q));',
    '  vec3 c = sc + bl * uBloomGain;',
    '  c = vec3(1.0) - exp(-c * uExposure);',
    '  vec3 bg = vec3(0.0035, 0.0065, 0.016) + vec3(0.008, 0.018, 0.045) * vig;',
    '  bg += vec3(0.004, 0.010, 0.030) * smoothstep(0.2, 1.0, vnoise(vUv * 2.5 + uTime * 0.02));',
    '  c = c * uFade + bg;',
    '  c *= mix(0.7, 1.0, vig);',
    '  c += (h21(gl_FragCoord.xy + fract(uTime * 7.0) * 113.0) - 0.5) / 255.0;',
    '  o = vec4(c, 1.0);',
    '}'
  ].join('\n');

  /* ------------------------------------------------------------------ */
  /* GL helpers                                                          */
  /* ------------------------------------------------------------------ */
  function compile(gl, vsSrc, fsSrc) {
    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        var log = gl.getShaderInfoLog(s);
        gl.deleteShader(s);
        throw new Error('Shader compile error: ' + log);
      }
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Program link error: ' + gl.getProgramInfoLog(p));
    var cache = {};
    return {
      p: p,
      u: function (name) {
        if (!(name in cache)) cache[name] = gl.getUniformLocation(p, name);
        return cache[name];
      }
    };
  }

  function makeTexture(gl, w, h, fmt) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internal, w, h, 0, gl.RGBA, fmt.type, null);
    return t;
  }

  function makeTarget(gl, w, h, fmt) {
    var tex = makeTexture(gl, w, h, fmt);
    var fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    return { tex: tex, fb: fb, w: w, h: h, ok: ok };
  }

  function freeTarget(gl, t) {
    if (!t) return;
    if (t.tex) gl.deleteTexture(t.tex);
    if (t.rb) gl.deleteRenderbuffer(t.rb);
    if (t.fb) gl.deleteFramebuffer(t.fb);
  }

  /* ------------------------------------------------------------------ */
  /* Butterfly                                                           */
  /* ------------------------------------------------------------------ */
  var WINGS = {
    fore: { base: [0.024, 0.02, 0.0], theta: 0.34, L: 0.62, A: 0.62, q: 1.25, p: 0.68, sweep: 0.52, curl: 0.14, cup: 0.10, ruff: 0.055, freq: 7.0, gain: 1.0 },
    hind: { base: [0.02, -0.035, -0.012], theta: -0.72, L: 0.45, A: 0.72, q: 2.0, p: 0.78, sweep: -0.38, curl: 0.07, cup: 0.13, ruff: 0.06, freq: 8.0, gain: 0.92 },
    tail: { base: [0.0, -0.06, 0.018], theta: -Math.PI / 2, L: 0.31, A: 0.42, q: 1.55, p: 0.85, sweep: 0.0, curl: 0.18, cup: 0.2, ruff: 0.045, freq: 6.0, gain: 0.85 }
  };

  function jitterWing(def, r) {
    function j(v, amt) { return v * (1 + (r() * 2 - 1) * amt); }
    return {
      base: def.base.slice(), theta: def.theta + (r() * 2 - 1) * 0.06, L: j(def.L, 0.07), A: j(def.A, 0.06),
      q: j(def.q, 0.08), p: j(def.p, 0.08), sweep: j(def.sweep, 0.15), curl: j(def.curl, 0.25), cup: j(def.cup, 0.2),
      ruff: j(def.ruff, 0.2), freq: j(def.freq, 0.12), gain: def.gain, seed: r() * 100
    };
  }

  function Tendril(n, len, rootLocal, dirLocal, width, gain, seed) {
    this.n = n;
    this.len = len;
    this.seg = len / (n - 1);
    this.p = new Float32Array(n * 3);
    this.q = new Float32Array(n * 3);
    this.rootLocal = rootLocal;
    this.dirLocal = dirLocal;
    this.width = width;
    this.gain = gain;
    this.seed = seed;
    this.ready = false;
  }

  function Butterfly(opts) {
    var r = rng(opts.seed || 1);
    this.seed = opts.seed || 1;
    this.rand = r;
    this.kind = opts.kind || 'companion';
    this.pos = [0, 0, 0];
    this.vel = [0, 0, 0];
    this.target = [0, 0, 0];
    this.span = 1;
    this.targetSpan = 1;
    this.yaw = 0; this.pitch = -0.2; this.roll = 0;
    this.tYaw = 0; this.tPitch = -0.2; this.tRoll = 0;
    this.phase = r() * TAU;
    this.lastPhi = 0;
    this.flex = 0;
    this.glide = 1;
    this.gain = opts.gain || 1;
    this.visible = true;
    this.placed = false;
    this.screen = { x: 0, y: 0, span: 0, on: false };
    this.wings = {
      fore: jitterWing(WINGS.fore, r),
      hind: jitterWing(WINGS.hind, r),
      tail: jitterWing(WINGS.tail, r)
    };
    var tcount = opts.tendrils || 6;
    this.tendrils = [];
    // tendrils grow in loose bundles that flow together, like the strands in the reference
    var bundles = [];
    for (var bI = 0; bI < 3; bI++) {
      var side0 = (bI === 0 ? -1 : bI === 1 ? 1 : (r() < 0.5 ? -1 : 1)) * (0.35 + r() * 0.6);
      bundles.push({ side: side0, seed: r() * 100, drift: [side0 * (0.5 + r() * 0.5), -0.35 - r() * 0.4] });
    }
    for (var i = 0; i < tcount; i++) {
      var bd = bundles[i % 3];
      var side = bd.side + (r() - 0.5) * 0.25;
      var ang = -Math.PI / 2 + side * 0.85;
      var dir = [Math.cos(ang), Math.sin(ang), -0.25 - r() * 0.3];
      var dl = Math.hypot(dir[0], dir[1], dir[2]);
      dir = [dir[0] / dl, dir[1] / dl, dir[2] / dl];
      var root = [(r() - 0.5) * 0.05 + side * 0.02, -0.02 - r() * 0.04, -0.01];
      var len = (opts.tendrilLength || 3.2) * (0.6 + r() * 0.6);
      var thick = r() < 0.35 ? 0.0028 + r() * 0.002 : 0.009 + r() * 0.008;
      var td = new Tendril(opts.tendrilPoints || 34, len, root, dir, thick, 0.7 + r() * 0.45, bd.seed + r() * 0.8);
      td.drift = [bd.drift[0] + (r() - 0.5) * 0.2, bd.drift[1] + (r() - 0.5) * 0.15];
      this.tendrils.push(td);
    }
    this.stamens = [];
    var sc = 5;
    for (var k = 0; k < sc; k++) {
      var a = Math.PI * (0.1 + 0.8 * (k / (sc - 1))) + (r() - 0.5) * 0.3;
      var l = 0.2 + r() * 0.2;
      this.stamens.push({ a: a, l: l, bend: (r() - 0.5) * 0.6, z: 0.05 + r() * 0.08, ph: r() * TAU });
    }
  }

  Butterfly.prototype.update = function (t, dt, env) {
    // Spring motion towards target
    var k = this.kind === 'follower' ? 11 : 6;
    var c = 2 * Math.sqrt(k) * 0.82;
    for (var i = 0; i < 3; i++) {
      var acc = k * (this.target[i] - this.pos[i]) - c * this.vel[i];
      this.vel[i] += acc * dt;
      this.pos[i] += this.vel[i] * dt;
    }
    this.span += (this.targetSpan - this.span) * (1 - Math.exp(-dt * 2.2));

    var span = this.span;
    var speed = Math.hypot(this.vel[0], this.vel[1]) / Math.max(span, 1e-3);

    // Occasional glides keep the motion soft and natural
    var g = 0.5 + 0.5 * Math.sin(t * 0.23 + this.seed * 3.1) * Math.sin(t * 0.37 + this.seed);
    var glideTarget = clamp(0.6 + g * 0.5 + speed * 0.45, 0.55, 1.15);
    this.glide += (glideTarget - this.glide) * (1 - Math.exp(-dt * 1.5));

    var freq = (env.reduce ? 0.9 : 1.55) + Math.min(speed * 1.3, 2.4) + (this.kind === 'companion' ? 0.25 : 0);
    this.phase += TAU * freq * dt;
    var amp = (env.reduce ? 0.26 : 0.53) * this.glide;
    var rest = 0.14;
    var w = Math.sin(this.phase) + 0.2 * Math.sin(2 * this.phase + 0.7);
    var ph2 = this.phase - 0.5;
    var w2 = Math.sin(ph2) + 0.2 * Math.sin(2 * ph2 + 0.7);
    var phiF = rest + amp * w;
    var phiH = rest * 0.85 + amp * 0.82 * w2;
    var dphi = dt > 0 ? (phiF - this.lastPhi) / dt : 0;
    this.lastPhi = phiF;
    this.flex += (clamp(-dphi * 0.014, -0.16, 0.16) - this.flex) * (1 - Math.exp(-dt * 12));

    // Orientation: base pose + banking from velocity + idle sway
    var vx = this.vel[0] / Math.max(span, 1e-3), vy = this.vel[1] / Math.max(span, 1e-3);
    var yaw = this.tYaw + clamp(vx * 0.18, -0.5, 0.5) + 0.09 * Math.sin(t * 0.31 + this.seed);
    var pitch = this.tPitch + clamp(-vy * 0.12, -0.35, 0.35) + 0.05 * Math.sin(t * 0.43 + this.seed * 2.0);
    var roll = this.tRoll + clamp(-vx * 0.22, -0.6, 0.6) + 0.07 * Math.sin(t * 0.27 + this.seed * 1.3);
    var sm = 1 - Math.exp(-dt * 3);
    this.yaw += (yaw - this.yaw) * sm;
    this.pitch += (pitch - this.pitch) * sm;
    this.roll += (roll - this.roll) * sm;

    var bob = -0.022 * span * w;
    this.M = m4.chain(
      m4.t(this.pos[0], this.pos[1] + bob, this.pos[2]),
      m4.rz(this.roll), m4.ry(this.yaw), m4.rx(this.pitch),
      m4.s(span, span, span)
    );

    var W = this.wings;
    var M = this.M;
    this.wingMats = [
      { def: W.fore, m: m4.chain(M, m4.t(W.fore.base[0], W.fore.base[1], W.fore.base[2]), m4.ry(-phiF), m4.rz(W.fore.theta)) },
      { def: W.fore, m: m4.chain(M, m4.t(-W.fore.base[0], W.fore.base[1], W.fore.base[2]), m4.ry(phiF), m4.s(-1, 1, 1), m4.rz(W.fore.theta)) },
      { def: W.hind, m: m4.chain(M, m4.t(W.hind.base[0], W.hind.base[1], W.hind.base[2]), m4.ry(-phiH), m4.rz(W.hind.theta)) },
      { def: W.hind, m: m4.chain(M, m4.t(-W.hind.base[0], W.hind.base[1], W.hind.base[2]), m4.ry(phiH), m4.s(-1, 1, 1), m4.rz(W.hind.theta)) },
      { def: W.tail, m: m4.chain(M, m4.t(W.tail.base[0], W.tail.base[1], W.tail.base[2]), m4.rx(0.18 * Math.sin(this.phase * 0.5) - 0.1), m4.rz(W.tail.theta)) }
    ];
    this.corePos = m4.pt(M, 0, -0.005, 0.03);
    this.pearlPos = m4.pt(M, -0.032, 0.048, 0.085);

    // Tendrils (verlet + follow-the-leader)
    var steps = Math.min(3, Math.max(1, Math.round(dt * 60)));
    var h = dt / steps;
    for (var s = 0; s < steps; s++) {
      for (var j = 0; j < this.tendrils.length; j++) this.stepTendril(this.tendrils[j], t + s * h, h, env);
    }
  };

  Butterfly.prototype.stepTendril = function (td, t, h, env) {
    var M = this.M, span = this.span;
    var root = m4.pt(M, td.rootLocal[0], td.rootLocal[1], td.rootLocal[2]);
    var d = m4.dir(M, td.dirLocal[0], td.dirLocal[1], td.dirLocal[2]);
    var dl = Math.hypot(d[0], d[1], d[2]) || 1;
    d[0] /= dl; d[1] /= dl; d[2] /= dl;
    var n = td.n, p = td.p, q = td.q;
    var seg = td.seg * span;
    if (!td.ready) {
      for (var i = 0; i < n; i++) {
        var curl = Math.sin(i * 0.18 + td.seed) * 0.35;
        p[i * 3] = q[i * 3] = root[0] + (d[0] + curl * 0.6) * seg * i;
        p[i * 3 + 1] = q[i * 3 + 1] = root[1] + d[1] * seg * i;
        p[i * 3 + 2] = q[i * 3 + 2] = root[2] + d[2] * seg * i * 0.3;
      }
      td.ready = true;
    }
    var hh = h * h;
    var grav = -0.12 * span;
    var amp = 1.5 * span;
    var kf = 1.7 / span;
    var dx0 = td.drift[0] * 0.5 * span, dy0 = td.drift[1] * 0.5 * span;
    var ph = td.seed;
    var damp = 0.965;
    var wind = env.windY || 0;
    p[0] = root[0]; p[1] = root[1]; p[2] = root[2];
    q[0] = root[0]; q[1] = root[1]; q[2] = root[2];
    for (i = 1; i < n; i++) {
      var ix = i * 3;
      var x = p[ix], y = p[ix + 1], z = p[ix + 2];
      var vx = (x - q[ix]) * damp, vy = (y - q[ix + 1]) * damp, vz = (z - q[ix + 2]) * damp;
      q[ix] = x; q[ix + 1] = y; q[ix + 2] = z;
      var fx = Math.sin(y * kf + t * 0.31 + ph) + 0.6 * Math.sin(z * kf * 1.7 + t * 0.21 + ph * 1.3);
      var fy = 0.55 * Math.sin(x * kf * 0.9 + t * 0.27 + ph * 0.7);
      var fz = 0.4 * Math.sin((x + y) * kf * 0.6 + t * 0.19 + ph * 2.1) + (root[2] - z) * 0.5 / span;
      var along = i / (n - 1);
      var ax = fx * amp * (0.3 + along) + dx0 * along;
      var ay = fy * amp * (0.3 + along) + grav + dy0 * along + wind * along;
      var az = fz * amp * 0.5;
      p[ix] = x + vx + ax * hh;
      p[ix + 1] = y + vy + ay * hh;
      p[ix + 2] = z + vz + az * hh;
    }
    // stiff stem near the root
    for (i = 1; i <= 3 && i < n; i++) {
      var w = 0.5 / i;
      p[i * 3] += (root[0] + d[0] * seg * i - p[i * 3]) * w;
      p[i * 3 + 1] += (root[1] + d[1] * seg * i - p[i * 3 + 1]) * w;
      p[i * 3 + 2] += (root[2] + d[2] * seg * i - p[i * 3 + 2]) * w;
    }
    // smoothing (bending stiffness)
    for (i = 1; i < n - 1; i++) {
      var a = i * 3;
      p[a] += ((p[a - 3] + p[a + 3]) * 0.5 - p[a]) * 0.12;
      p[a + 1] += ((p[a - 2] + p[a + 4]) * 0.5 - p[a + 1]) * 0.12;
      p[a + 2] += ((p[a - 1] + p[a + 5]) * 0.5 - p[a + 2]) * 0.12;
    }
    // follow the leader: inextensible segments
    for (i = 1; i < n; i++) {
      var b = i * 3;
      var dx = p[b] - p[b - 3], dy = p[b + 1] - p[b - 2], dz = p[b + 2] - p[b - 1];
      var len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      var f = seg / len;
      var nx = p[b - 3] + dx * f, ny = p[b - 2] + dy * f, nz = p[b - 1] + dz * f;
      // velocity correction keeps it from gaining energy
      q[b] += (nx - p[b]) * 0.9; q[b + 1] += (ny - p[b + 1]) * 0.9; q[b + 2] += (nz - p[b + 2]) * 0.9;
      p[b] = nx; p[b + 1] = ny; p[b + 2] = nz;
    }
  };

  /* ------------------------------------------------------------------ */
  /* Ribbon builder (dynamic geometry for tendrils / filaments / strands) */
  /* ------------------------------------------------------------------ */
  function RibbonBuffer(maxVerts) {
    this.max = maxVerts;
    this.v = new Float32Array(maxVerts * 7);
    this.i = new Uint32Array(maxVerts * 3);
    this.nv = 0;
    this.ni = 0;
    this.tmp = new Float32Array(4096 * 3);
  }
  RibbonBuffer.prototype.reset = function () { this.nv = 0; this.ni = 0; };
  // pts: flat xyz array with count points. widthFn(along) -> half width (world). pxPerUnit for min width.
  RibbonBuffer.prototype.add = function (pts, count, widthFn, gain, style, pxPerUnit, minPx) {
    if (count < 2 || this.nv + count * 2 > this.max) return;
    var v = this.v, ii = this.i;
    var base = this.nv;
    for (var k = 0; k < count; k++) {
      var a = Math.max(0, k - 1), b = Math.min(count - 1, k + 1);
      var tx = pts[b * 3] - pts[a * 3], ty = pts[b * 3 + 1] - pts[a * 3 + 1];
      var tl = Math.hypot(tx, ty) || 1e-6;
      var sx = -ty / tl, sy = tx / tl;
      var along = k / (count - 1);
      var hw = widthFn(along);
      var g = gain;
      var px = hw * pxPerUnit;
      if (px < minPx) { g *= Math.max(px / minPx, 0.05); hw = minPx / pxPerUnit; }
      var x = pts[k * 3], y = pts[k * 3 + 1], z = pts[k * 3 + 2];
      var o = (base + k * 2) * 7;
      v[o] = x + sx * hw; v[o + 1] = y + sy * hw; v[o + 2] = z; v[o + 3] = 1; v[o + 4] = along; v[o + 5] = g; v[o + 6] = style;
      v[o + 7] = x - sx * hw; v[o + 8] = y - sy * hw; v[o + 9] = z; v[o + 10] = -1; v[o + 11] = along; v[o + 12] = g; v[o + 13] = style;
    }
    for (k = 0; k < count - 1; k++) {
      var i0 = base + k * 2;
      var n = this.ni;
      ii[n] = i0; ii[n + 1] = i0 + 1; ii[n + 2] = i0 + 2;
      ii[n + 3] = i0 + 1; ii[n + 4] = i0 + 3; ii[n + 5] = i0 + 2;
      this.ni += 6;
    }
    this.nv += count * 2;
  };

  // Catmull-Rom subdivision of a flat xyz array
  function catmull(src, n, sub, out) {
    var c = 0;
    for (var i = 0; i < n - 1; i++) {
      var i0 = Math.max(0, i - 1) * 3, i1 = i * 3, i2 = (i + 1) * 3, i3 = Math.min(n - 1, i + 2) * 3;
      for (var j = 0; j < sub; j++) {
        var t = j / sub, t2 = t * t, t3 = t2 * t;
        for (var a = 0; a < 3; a++) {
          var p0 = src[i0 + a], p1 = src[i1 + a], p2 = src[i2 + a], p3 = src[i3 + a];
          out[c * 3 + a] = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
        }
        c++;
      }
    }
    out[c * 3] = src[(n - 1) * 3]; out[c * 3 + 1] = src[(n - 1) * 3 + 1]; out[c * 3 + 2] = src[(n - 1) * 3 + 2];
    return c + 1;
  }

  /* ------------------------------------------------------------------ */
  /* Scene                                                               */
  /* ------------------------------------------------------------------ */
  function Scene(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.reduce = !!opts.reduce;
    var gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;
    this.mobile = Math.min(window.innerWidth, window.innerHeight) < 700 || matchMedia('(hover: none)').matches;
    this.time = 0;
    this.fade = 0;
    this.lastT = null;
    this.scroll = 0;
    this.lastScroll = null;
    this.scrollVel = 0;
    this.pointer = { x: 0.5, y: 0.5, sx: 0.5, sy: 0.5 };
    this.camZ = 10;
    this.fov = 35 * Math.PI / 180;
    this.quality = 1;
    this.adaptive = opts.adaptive !== false;
    this.frameEMA = 1 / 60;
    this.adaptT = 0;

    var hasFloat = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    this.fmt = hasFloat ? { internal: gl.RGBA16F, type: gl.HALF_FLOAT } : { internal: gl.RGBA8, type: gl.UNSIGNED_BYTE };

    this.progs = {
      wing: compile(gl, WING_VS, WING_FS),
      ribbon: compile(gl, RIBBON_VS, RIBBON_FS),
      core: compile(gl, SPRITE_VS, CORE_FS),
      pearl: compile(gl, SPRITE_VS, PEARL_FS),
      dust: compile(gl, DUST_VS, DUST_FS),
      down: compile(gl, FS_VS, DOWN_FS),
      up: compile(gl, FS_VS, UP_FS),
      comp: compile(gl, FS_VS, COMPOSITE_FS)
    };

    this.buildGeometry();
    this.buildButterflies();
    this.resize();
    this.measure();
  }

  Scene.prototype.buildGeometry = function () {
    var gl = this.gl;
    // Wing grid (s radial, t angular)
    var NS = this.mobile ? 30 : 40, NT = this.mobile ? 44 : 60;
    var verts = new Float32Array((NS + 1) * (NT + 1) * 2);
    var idx = new Uint16Array(NS * NT * 6);
    var o = 0;
    for (var i = 0; i <= NS; i++) {
      for (var j = 0; j <= NT; j++) {
        verts[o++] = i / NS;
        verts[o++] = (j / NT) * 2 - 1;
      }
    }
    o = 0;
    for (i = 0; i < NS; i++) {
      for (j = 0; j < NT; j++) {
        var a = i * (NT + 1) + j, b = a + 1, c = a + NT + 1, d = c + 1;
        idx[o++] = a; idx[o++] = c; idx[o++] = b;
        idx[o++] = b; idx[o++] = c; idx[o++] = d;
      }
    }
    this.wingCount = idx.length;
    this.wingVAO = gl.createVertexArray();
    gl.bindVertexArray(this.wingVAO);
    var vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    var ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

    // Sprite quad
    this.quadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.quadVAO);
    var qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Fullscreen triangle
    this.triVAO = gl.createVertexArray();
    gl.bindVertexArray(this.triVAO);
    var tb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, tb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Ribbons (dynamic)
    this.ribbons = new RibbonBuffer(60000);
    this.ribbonVAO = gl.createVertexArray();
    gl.bindVertexArray(this.ribbonVAO);
    this.ribbonVB = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ribbonVB);
    gl.bufferData(gl.ARRAY_BUFFER, this.ribbons.v.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
    this.ribbonIB = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ribbonIB);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.ribbons.i.byteLength, gl.DYNAMIC_DRAW);

    // Dust
    var count = this.mobile ? 140 : 260;
    var r = rng(77);
    var dust = new Float32Array(count * 4);
    for (i = 0; i < count; i++) {
      dust[i * 4] = r(); dust[i * 4 + 1] = r(); dust[i * 4 + 2] = r(); dust[i * 4 + 3] = r();
    }
    this.dustCount = count;
    this.dustVAO = gl.createVertexArray();
    gl.bindVertexArray(this.dustVAO);
    var db = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, db);
    gl.bufferData(gl.ARRAY_BUFFER, dust, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Ambient strands (bundles of glassy fibres drifting through the page)
    var rs = rng(1234);
    this.strands = [];
    var bundles = this.mobile ? 7 : 11;
    for (i = 0; i < bundles; i++) {
      var m = 2 + Math.floor(rs() * 3);
      var fromLeft = rs() < 0.5;
      this.strands.push({
        page: (i + 0.35 + rs() * 0.3) / bundles,
        p0: [fromLeft ? -0.25 : 1.25, 0.2 + rs() * 0.6],
        p1: [0.15 + rs() * 0.3, -0.2 + rs() * 0.6],
        p2: [0.55 + rs() * 0.3, 0.5 + rs() * 0.6],
        p3: [fromLeft ? 1.25 : -0.25, 0.1 + rs() * 0.8],
        count: m,
        spread: 0.008 + rs() * 0.012,
        phase: rs() * TAU,
        gain: 0.28 + rs() * 0.22,
        width: 0.004 + rs() * 0.004
      });
    }
  };

  Scene.prototype.buildButterflies = function () {
    var mob = this.mobile;
    this.follower = new Butterfly({ seed: 7, kind: 'follower', tendrils: mob ? 6 : 9, tendrilLength: 3.6, tendrilPoints: mob ? 28 : 36, gain: 1 });
    this.companions = [];
    var nodes = document.querySelectorAll('[data-companion]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var parts = (el.getAttribute('data-companion') || '').split(',').map(parseFloat);
      var b = new Butterfly({ seed: 31 + i * 17, kind: 'companion', tendrils: mob ? 4 : 6, tendrilLength: 2.8, tendrilPoints: mob ? 24 : 30, gain: 0.95 });
      b.el = el;
      b.scale = parts[0] || 0.5;
      b.depth = parts[1] || 0.9;
      b.tYaw = parts[2] || 0;
      b.tRoll = parts[3] || 0;
      b.tPitch = -0.12 - (b.rand() * 0.2);
      b.mobileHide = el.hasAttribute('data-desktop-only');
      this.companions.push(b);
    }
    this.all = [this.follower].concat(this.companions);
  };

  Scene.prototype.resize = function () {
    var gl = this.gl;
    var cssW = window.innerWidth, cssH = window.innerHeight;
    var cap = this.mobile ? 1.5 : 1.75;
    var maxPx = this.mobile ? 2.0e6 : 3.5e6;
    var dpr = Math.min(window.devicePixelRatio || 1, cap, Math.sqrt(maxPx / Math.max(1, cssW * cssH)));
    dpr = Math.max(0.5, dpr * this.quality);
    var w = Math.max(2, Math.round(cssW * dpr)), h = Math.max(2, Math.round(cssH * dpr));
    this.cssW = cssW; this.cssH = cssH; this.dpr = dpr;
    if (this.canvas.width === w && this.canvas.height === h && this.msaa) return;
    this.canvas.width = w; this.canvas.height = h;
    this.w = w; this.h = h;

    freeTarget(gl, this.msaa);
    freeTarget(gl, this.sceneT);
    if (this.levels) this.levels.forEach(function (l) { freeTarget(gl, l); });

    // MSAA scene target
    var fmt = this.fmt;
    var samples = w * h > 2.2e6 ? 2 : 4;
    try {
      var supported = gl.getInternalformatParameter(gl.RENDERBUFFER, fmt.internal, gl.SAMPLES);
      if (supported && supported.length) samples = Math.min(samples, supported[0]);
    } catch (e) { samples = 0; }
    var rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    if (samples > 0) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, fmt.internal, w, h);
    else gl.renderbufferStorage(gl.RENDERBUFFER, fmt.internal, w, h);
    var fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
    this.msaa = { fb: fb, rb: rb, w: w, h: h };

    this.sceneT = makeTarget(gl, w, h, fmt);
    if (!this.sceneT.ok && fmt.type !== gl.UNSIGNED_BYTE) {
      // Fall back to 8-bit targets
      this.fmt = { internal: gl.RGBA8, type: gl.UNSIGNED_BYTE };
      this.msaa = null; this.canvas.width = 0;
      return this.resize();
    }
    this.levels = [];
    var lw = w, lh = h;
    for (var i = 0; i < 6; i++) {
      lw = Math.max(2, lw >> 1); lh = Math.max(2, lh >> 1);
      this.levels.push(makeTarget(gl, lw, lh, this.fmt));
      if (lw <= 8 || lh <= 8) break;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.visH = 2 * this.camZ * Math.tan(this.fov / 2);
    this.visW = this.visH * (cssW / cssH);
    this.unit = Math.min(this.visH, this.visW * 1.25);
    this.proj = m4.persp(this.fov, cssW / cssH, 0.1, 100);
    this.view = m4.t(0, 0, -this.camZ);
    this.PV = m4.mul(this.proj, this.view);
    this.pxPerUnit = h / this.visH;
  };

  // Read the section anchors that drive the follower's flight path
  Scene.prototype.measure = function () {
    var vh = window.innerHeight;
    var sy = window.scrollY || window.pageYOffset || 0;
    var max = Math.max(0, document.documentElement.scrollHeight - vh);
    var narrow = window.innerWidth < 760;
    var nodes = document.querySelectorAll('[data-bf]');
    var stops = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var r = el.getBoundingClientRect();
      var top = r.top + sy;
      var start = clamp(top, 0, max);
      var end = clamp(top + r.height - vh, start, max);
      if (stops.length && start < stops[stops.length - 1].end) start = stops[stops.length - 1].end;
      if (end < start) end = start;
      var spec = (narrow && el.getAttribute('data-bf-m')) || el.getAttribute('data-bf');
      var v = spec.split(',').map(parseFloat);
      stops.push({ start: start, end: end, x: v[0], y: v[1], s: v[2] || 1, yaw: v[3] || 0, pitch: (v[4] !== undefined && !isNaN(v[4])) ? v[4] : -0.2, roll: v[5] || 0 });
    }
    this.stops = stops;
    for (var c = 0; c < this.companions.length; c++) {
      var b = this.companions[c];
      var rr = b.el.getBoundingClientRect();
      b.pageX = rr.left + rr.width / 2;
      b.pageY = rr.top + sy + rr.height / 2;
    }
    this.docH = document.documentElement.scrollHeight;
  };

  Scene.prototype.flight = function (scrollY) {
    var st = this.stops;
    if (!st || !st.length) return { x: 0.5, y: 0.4, s: 1, yaw: 0, pitch: -0.2, roll: 0 };
    if (scrollY <= st[0].end) return st[0];
    for (var i = 0; i < st.length - 1; i++) {
      var a = st[i], b = st[i + 1];
      if (scrollY <= a.end) return a;
      if (scrollY < b.start) {
        var t = (scrollY - a.end) / Math.max(1, b.start - a.end);
        var e = smoother01(clamp((t - 0.08) / 0.84, 0, 1));
        var dx = b.x - a.x, dy = b.y - a.y;
        var dl = Math.hypot(dx, dy) || 1;
        var arc = Math.sin(Math.PI * e) * (0.07 + 0.06 * dl) * (i % 2 === 0 ? 1 : -1);
        return {
          x: lerp(a.x, b.x, e) + (-dy / dl) * arc,
          y: lerp(a.y, b.y, e) + (dx / dl) * arc - Math.sin(Math.PI * e) * 0.03,
          s: lerp(a.s, b.s, e) * (1 - 0.12 * Math.sin(Math.PI * e)),
          yaw: lerp(a.yaw, b.yaw, e),
          pitch: lerp(a.pitch, b.pitch, e),
          roll: lerp(a.roll, b.roll, e)
        };
      }
    }
    return st[st.length - 1];
  };

  Scene.prototype.toWorld = function (fx, fy) {
    return [(fx - 0.5) * this.visW, (0.5 - fy) * this.visH];
  };

  Scene.prototype.project = function (p) {
    var m = this.PV;
    var x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
    var y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    var w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    return { x: (x / w * 0.5 + 0.5) * this.cssW, y: (0.5 - y / w * 0.5) * this.cssH };
  };

  Scene.prototype.frame = function (tSec, scrollY, pointer) {
    if (this.lastT === null) this.lastT = tSec;
    var dt = clamp(tSec - this.lastT, 0, 1 / 20);
    this.lastT = tSec;
    this.time += dt;
    var t = this.time;
    var vh = this.cssH;

    // Adaptive resolution: keep the motion smooth on slower GPUs
    if (this.adaptive && dt > 0) {
      this.frameEMA += (dt - this.frameEMA) * 0.05;
      this.adaptT += dt;
      if (this.adaptT > 2.5 && this.frameEMA > 1 / 40 && this.quality > 0.55) {
        this.quality = Math.max(0.55, this.quality * 0.85);
        this.adaptT = 0;
        this.msaa = null;
        this.canvas.width = 0;
        this.resize();
      }
    }

    if (this.lastScroll === null) this.lastScroll = scrollY;
    var sv = dt > 0 ? (scrollY - this.lastScroll) / dt : 0;
    this.lastScroll = scrollY;
    this.scrollVel += (sv - this.scrollVel) * (1 - Math.exp(-dt * 6));
    this.scroll = scrollY;
    if (pointer) {
      this.pointer.x = pointer.x; this.pointer.y = pointer.y;
    }
    var ps = 1 - Math.exp(-dt * 2.5);
    this.pointer.sx += (this.pointer.x - this.pointer.sx) * ps;
    this.pointer.sy += (this.pointer.y - this.pointer.sy) * ps;
    this.fade = Math.min(1, this.fade + dt * 0.6);

    var env = {
      reduce: this.reduce,
      // scrolling pushes the tendrils as if the creatures drift through the page
      windY: clamp(this.scrollVel / vh, -3, 3) * 1.4
    };

    // Follower target from the flight path
    var f = this.flight(scrollY);
    var px = (this.pointer.sx - 0.5) * 0.035, py = (this.pointer.sy - 0.5) * 0.025;
    var hover = [
      0.012 * Math.sin(t * 0.41) + 0.008 * Math.sin(t * 0.83 + 1.3),
      0.012 * Math.sin(t * 0.53 + 0.7) + 0.006 * Math.sin(t * 1.07)
    ];
    var fw = this.toWorld(f.x + px + hover[0], f.y + py + hover[1]);
    var fb = this.follower;
    fb.target[0] = fw[0]; fb.target[1] = fw[1]; fb.target[2] = 0;
    fb.targetSpan = f.s * 0.5 * this.unit;
    fb.tYaw = f.yaw; fb.tPitch = f.pitch; fb.tRoll = f.roll;
    if (!fb.placed) {
      // enter from the lower right, then glide into place
      var start = this.toWorld(1.15, 0.95);
      fb.pos = [start[0], start[1], 0];
      fb.span = fb.targetSpan * 0.6;
      fb.placed = true;
    }

    // Companions are anchored to the page, with depth parallax
    var narrow = window.innerWidth < 760;
    for (var i = 0; i < this.companions.length; i++) {
      var b = this.companions[i];
      b.visible = !(narrow && b.mobileHide);
      var off = (b.pageY - scrollY) - vh / 2;
      var sy = (vh / 2 + off * b.depth) / vh;
      var sx = b.pageX / this.cssW;
      var wander = [
        0.02 * Math.sin(t * 0.29 + b.seed) + 0.012 * Math.sin(t * 0.61 + b.seed * 2.1),
        0.018 * Math.sin(t * 0.37 + b.seed * 1.7) + 0.01 * Math.sin(t * 0.71 + b.seed)
      ];
      var w = this.toWorld(sx + wander[0] - px * 0.6, sy + wander[1] - py * 0.6);
      b.target[0] = w[0]; b.target[1] = w[1]; b.target[2] = 0;
      b.targetSpan = b.scale * 0.5 * this.unit * (narrow ? 1.25 : 1);
      if (!b.placed) {
        b.pos = [w[0], w[1] - this.visH * 0.1, 0];
        b.span = b.targetSpan;
        b.placed = true;
      }
    }

    for (i = 0; i < this.all.length; i++) {
      var bb = this.all[i];
      bb.update(t, dt, env);
      var sp = this.project(bb.corePos);
      bb.screen.x = sp.x; bb.screen.y = sp.y;
      bb.screen.span = bb.span / this.visH * vh;
      bb.screen.on = bb.visible && sp.y > -vh * 0.6 && sp.y < vh * 1.6;
    }

    this.render(t);
  };

  Scene.prototype.buildRibbons = function (t) {
    var rb = this.ribbons;
    rb.reset();
    var tmp = rb.tmp;
    var ppu = this.pxPerUnit;
    var minPx = 0.9 * this.dpr;
    var self = this;

    // ambient strands
    var vh = this.cssH, docH = this.docH || vh;
    var pts = new Float32Array(70 * 3);
    for (var s = 0; s < this.strands.length; s++) {
      var st = this.strands[s];
      var pageY = st.page * docH;
      var cy = (pageY - this.scroll) / vh;
      if (cy < -1.2 || cy > 2.2) continue;
      for (var k = 0; k < st.count; k++) {
        var N = 64;
        var off = (k - (st.count - 1) / 2) * st.spread;
        for (var j = 0; j < N; j++) {
          var u = j / (N - 1), iu = 1 - u;
          var bx = iu * iu * iu * st.p0[0] + 3 * iu * iu * u * st.p1[0] + 3 * iu * u * u * st.p2[0] + u * u * u * st.p3[0];
          var by = iu * iu * iu * st.p0[1] + 3 * iu * iu * u * st.p1[1] + 3 * iu * u * u * st.p2[1] + u * u * u * st.p3[1];
          var wob = Math.sin(u * 9 + t * 0.35 + st.phase + k * 0.9) * 0.018 + Math.sin(u * 3.3 - t * 0.21 + st.phase) * 0.03;
          var braid = off * (1 + 0.8 * Math.sin(u * 12 + t * 0.4 + k * 2.1 + st.phase));
          var fy = cy - 0.5 + by + wob + braid;
          var fx = bx + wob * 0.4;
          var wpt = this.toWorld(fx, fy);
          pts[j * 3] = wpt[0]; pts[j * 3 + 1] = wpt[1]; pts[j * 3 + 2] = -0.6 - k * 0.1;
        }
        var wd = st.width * this.unit * (k === 0 ? 1 : 0.6);
        rb.add(pts, N, (function (wd) { return function (a) { return wd * (0.4 + 0.6 * Math.sin(Math.PI * a)); }; })(wd), st.gain, 0, ppu, minPx);
      }
    }

    // butterfly tendrils & stamens
    for (var i = 0; i < this.all.length; i++) {
      var b = this.all[i];
      if (!b.screen.on) continue;
      for (var tI = 0; tI < b.tendrils.length; tI++) {
        var td = b.tendrils[tI];
        var cnt = catmull(td.p, td.n, 3, tmp);
        var base = td.width * b.span;
        rb.add(tmp, cnt, (function (base) {
          return function (a) { return base * (0.45 + 0.55 * smooth01(a * 8)) * (1 - 0.55 * a); };
        })(base), td.gain * b.gain, 0, ppu, minPx);
      }
      // stamens: thin filaments with glowing tips
      var M = b.M;
      var sp = new Float32Array(18 * 3);
      for (var q = 0; q < b.stamens.length; q++) {
        var sm = b.stamens[q];
        var sway = 0.08 * Math.sin(t * 1.3 + sm.ph);
        for (var e = 0; e < 18; e++) {
          var uu = e / 17;
          var ang = sm.a + sm.bend * uu * uu + sway * uu;
          var rr = sm.l * uu;
          var lp = m4.pt(M, Math.cos(ang) * rr, 0.01 + Math.sin(ang) * rr, 0.03 + sm.z * uu);
          sp[e * 3] = lp[0]; sp[e * 3 + 1] = lp[1]; sp[e * 3 + 2] = lp[2];
        }
        var sw = b.span * 0.0022;
        rb.add(sp, 18, (function (sw) { return function (a) { return sw * (1 - 0.4 * a + 1.3 * smooth01((a - 0.9) / 0.1)); }; })(sw), 1.1 * b.gain, 1, ppu, minPx);
      }
    }
    void self;
  };

  Scene.prototype.render = function (t) {
    var gl = this.gl;
    var P = this.progs;

    this.buildRibbons(t);

    // --- scene pass (MSAA) ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msaa.fb);
    gl.viewport(0, 0, this.w, this.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    // ribbons
    if (this.ribbons.ni > 0) {
      gl.useProgram(P.ribbon.p);
      gl.uniformMatrix4fv(P.ribbon.u('uPV'), false, this.PV);
      gl.uniform1f(P.ribbon.u('uTime'), t);
      gl.bindVertexArray(this.ribbonVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ribbonVB);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.ribbons.v, 0, this.ribbons.nv * 7);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ribbonIB);
      gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, this.ribbons.i, 0, this.ribbons.ni);
      gl.drawElements(gl.TRIANGLES, this.ribbons.ni, gl.UNSIGNED_INT, 0);
    }

    // wings
    gl.useProgram(P.wing.p);
    gl.uniformMatrix4fv(P.wing.u('uPV'), false, this.PV);
    gl.uniform3f(P.wing.u('uCam'), 0, 0, this.camZ);
    gl.bindVertexArray(this.wingVAO);
    var i, b;
    for (i = 0; i < this.all.length; i++) {
      b = this.all[i];
      if (!b.screen.on) continue;
      for (var w = 0; w < b.wingMats.length; w++) {
        var wm = b.wingMats[w], d = wm.def;
        gl.uniformMatrix4fv(P.wing.u('uModel'), false, wm.m);
        gl.uniform4f(P.wing.u('uShapeA'), d.L, d.A, d.q, d.p);
        gl.uniform4f(P.wing.u('uShapeB'), d.sweep, d.curl, d.cup, d.ruff);
        gl.uniform4f(P.wing.u('uAnim'), t + d.seed, b.flex * (w === 4 ? 0.3 : 1), d.seed + (w % 2) * 0.37, d.freq);
        gl.uniform1f(P.wing.u('uGain'), d.gain * b.gain);
        gl.drawElements(gl.TRIANGLES, this.wingCount, gl.UNSIGNED_SHORT, 0);
      }
    }

    // glowing cores
    gl.bindVertexArray(this.quadVAO);
    gl.useProgram(P.core.p);
    gl.uniformMatrix4fv(P.core.u('uPV'), false, this.PV);
    gl.uniform1f(P.core.u('uTime'), t);
    for (i = 0; i < this.all.length; i++) {
      b = this.all[i];
      if (!b.screen.on) continue;
      gl.uniform3fv(P.core.u('uCenter'), b.corePos);
      gl.uniform2f(P.core.u('uSize'), b.span * 0.45, b.span * 0.45);
      gl.uniform1f(P.core.u('uSeed'), b.seed);
      gl.uniform1f(P.core.u('uGain'), b.gain * clamp(b.screen.span / 420, 0.35, 1));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // pearls (premultiplied over)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(P.pearl.p);
    gl.uniformMatrix4fv(P.pearl.u('uPV'), false, this.PV);
    for (i = 0; i < this.all.length; i++) {
      b = this.all[i];
      if (!b.screen.on) continue;
      gl.uniform3fv(P.pearl.u('uCenter'), b.pearlPos);
      gl.uniform2f(P.pearl.u('uSize'), b.span * 0.052, b.span * 0.042);
      gl.uniform1f(P.pearl.u('uGain'), 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // dust
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(P.dust.p);
    gl.uniformMatrix4fv(P.dust.u('uPV'), false, this.PV);
    gl.uniform2f(P.dust.u('uVis'), this.visW, this.visH);
    gl.uniform1f(P.dust.u('uTime'), t);
    gl.uniform1f(P.dust.u('uScroll'), this.scroll / this.cssH);
    gl.uniform1f(P.dust.u('uPx'), this.dpr);
    gl.bindVertexArray(this.dustVAO);
    gl.drawArrays(gl.POINTS, 0, this.dustCount);

    // --- resolve MSAA ---
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msaa.fb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.sceneT.fb);
    gl.blitFramebuffer(0, 0, this.w, this.h, 0, 0, this.w, this.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

    // --- bloom (dual filter) ---
    gl.bindVertexArray(this.triVAO);
    gl.useProgram(P.down.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(P.down.u('uTex'), 0);
    var src = this.sceneT;
    for (i = 0; i < this.levels.length; i++) {
      var dst = this.levels[i];
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
      gl.viewport(0, 0, dst.w, dst.h);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform2f(P.down.u('uTexel'), 1 / src.w, 1 / src.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      src = dst;
    }
    gl.useProgram(P.up.p);
    gl.uniform1i(P.up.u('uTex'), 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (i = this.levels.length - 1; i > 0; i--) {
      var from = this.levels[i], to = this.levels[i - 1];
      gl.bindFramebuffer(gl.FRAMEBUFFER, to.fb);
      gl.viewport(0, 0, to.w, to.h);
      gl.bindTexture(gl.TEXTURE_2D, from.tex);
      gl.uniform2f(P.up.u('uTexel'), 1 / from.w, 1 / from.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.BLEND);

    // --- composite ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(P.comp.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneT.tex);
    gl.uniform1i(P.comp.u('uScene'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.levels[0].tex);
    gl.uniform1i(P.comp.u('uBloom'), 1);
    gl.uniform1f(P.comp.u('uBloomGain'), 0.22);
    gl.uniform1f(P.comp.u('uExposure'), 1.25);
    gl.uniform1f(P.comp.u('uTime'), t);
    gl.uniform1f(P.comp.u('uFade'), smooth01(this.fade));
    gl.uniform2f(P.comp.u('uRes'), this.w, this.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
  };

  // Run the simulation forward without drawing (used to settle the tendrils on load)
  Scene.prototype.advance = function (seconds, scrollY) {
    var render = this.render, adaptive = this.adaptive;
    this.render = function () {};
    this.adaptive = false;
    var t0 = this.lastT === null ? 0 : this.lastT;
    var steps = Math.round(seconds * 30);
    for (var i = 1; i <= steps; i++) this.frame(t0 + i / 30, scrollY, null);
    this.render = render;
    this.adaptive = adaptive;
    this.lastT = this.lastT === null ? null : t0;
  };

  Scene.prototype.getScreen = function (index) {
    var b = index < 0 ? this.follower : this.companions[index];
    return b ? b.screen : null;
  };

  window.FormlessScene = {
    create: function (canvas, opts) {
      try {
        return new Scene(canvas, opts);
      } catch (e) {
        if (window.console) console.warn('[FORMLESS] WebGL scene disabled:', e.message);
        return null;
      }
    }
  };
})();
