import{a as e,r as t}from"./index-BAXfrons.js";var n=`
attribute vec2 p;
varying vec2 vUv;
void main() {
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`,r=`
precision highp float;
varying vec2 vUv;
uniform sampler2D uImage;
uniform sampler2D uDepth;
uniform vec2 uCover;   // uv scale for object-fit: cover
uniform vec2 uOffset;  // pointer offset, -1..1
uniform float uZoom;
uniform float uFocus;

void main() {
  vec2 uv = (vUv - 0.5) * uCover / uZoom + 0.5;
  // blur the depth a touch to avoid tearing at silhouettes
  float d = 0.0;
  vec2 px = vec2(0.0025);
  d += texture2D(uDepth, uv).r * 0.4;
  d += texture2D(uDepth, uv + vec2(px.x, 0.0)).r * 0.15;
  d += texture2D(uDepth, uv - vec2(px.x, 0.0)).r * 0.15;
  d += texture2D(uDepth, uv + vec2(0.0, px.y)).r * 0.15;
  d += texture2D(uDepth, uv - vec2(0.0, px.y)).r * 0.15;
  vec2 shift = uOffset * (d - uFocus) * 0.018;
  vec3 c = texture2D(uImage, uv + shift).rgb;
  gl_FragColor = vec4(c, 1.0);
}`;function i(i,a){if(t())return;let o=i.querySelector(`.hero__img`),s=i.querySelector(`[data-hero-canvas]`);if(!o||!s)return;let c=o.currentSrc||o.src;if(!c)return;let l=`./img/${c.includes(`sosny_portrait`)?`sosny_portrait`:`sosny_hero`}_depth.webp`,u=s.getContext(`webgl`,{antialias:!1,alpha:!1,premultipliedAlpha:!1});if(!u)return;let d=e=>new Promise((t,n)=>{let r=new Image;r.decoding=`async`,r.onload=()=>t(r),r.onerror=n,r.src=e});Promise.all([d(c),d(l)]).then(([e,t])=>m(e,t)).catch(()=>{});function f(e,t){let n=u.createShader(e);return u.shaderSource(n,t),u.compileShader(n),n}function p(e,t){let n=u.createTexture();return u.activeTexture(u.TEXTURE0+t),u.bindTexture(u.TEXTURE_2D,n),u.pixelStorei(u.UNPACK_FLIP_Y_WEBGL,!0),u.texImage2D(u.TEXTURE_2D,0,u.RGB,u.RGB,u.UNSIGNED_BYTE,e),u.texParameteri(u.TEXTURE_2D,u.TEXTURE_MIN_FILTER,u.LINEAR),u.texParameteri(u.TEXTURE_2D,u.TEXTURE_MAG_FILTER,u.LINEAR),u.texParameteri(u.TEXTURE_2D,u.TEXTURE_WRAP_S,u.CLAMP_TO_EDGE),u.texParameteri(u.TEXTURE_2D,u.TEXTURE_WRAP_T,u.CLAMP_TO_EDGE),n}function m(t,o){let c=u.createProgram();if(u.attachShader(c,f(u.VERTEX_SHADER,n)),u.attachShader(c,f(u.FRAGMENT_SHADER,r)),u.linkProgram(c),!u.getProgramParameter(c,u.LINK_STATUS))return;u.useProgram(c);let l=u.createBuffer();u.bindBuffer(u.ARRAY_BUFFER,l),u.bufferData(u.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),u.STATIC_DRAW);let d=u.getAttribLocation(c,`p`);u.enableVertexAttribArray(d),u.vertexAttribPointer(d,2,u.FLOAT,!1,0,0),p(t,0),p(o,1);let m=e=>u.getUniformLocation(c,e);u.uniform1i(m(`uImage`),0),u.uniform1i(m(`uDepth`),1),u.uniform1f(m(`uFocus`),.45);let h=m(`uCover`),g=m(`uOffset`),_=m(`uZoom`),v=t.naturalWidth/t.naturalHeight,y=()=>{let e=Math.min(window.devicePixelRatio,1.75),t=i.clientWidth,n=i.clientHeight;s.width=Math.round(t*e),s.height=Math.round(n*e),u.viewport(0,0,s.width,s.height);let r=t/n;u.uniform2f(h,r>v?1:r/v,r>v?v/r:1)};window.addEventListener(`resize`,y),y();let b=window.matchMedia(`(hover: none)`).matches,x=0,S=0,C=0,w=0;b||(i.addEventListener(`pointermove`,e=>{let t=i.getBoundingClientRect();x=(e.clientX-t.left)/t.width*2-1,S=(e.clientY-t.top)/t.height*2-1}),i.addEventListener(`pointerleave`,()=>{x=0,S=0}));let T=0;a.on(e=>T=Math.min(1,e/Math.max(1,i.offsetHeight)));let E=!0;e(i,e=>E=e);let D=performance.now(),O=!0,k=e=>{if(requestAnimationFrame(k),!E)return;let t=(e-D)/1e3;b&&(x=Math.sin(t*.21)*.6,S=Math.sin(t*.13+1.3)*.25),C+=(x-C)*.045,w+=(S-w)*.045,u.uniform2f(g,-C,w),u.uniform1f(_,1.02+T*.05),u.drawArrays(u.TRIANGLE_STRIP,0,4),O&&(O=!1,setTimeout(()=>s.classList.add(`is-ready`),2200))};requestAnimationFrame(k)}}export{i as initHeroDepth};