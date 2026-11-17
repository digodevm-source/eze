// Face drawn on a canvas and wrapped on the head sphere (equirectangular UV).
// u=0.25 is the front of the head; canvas right = character's left = screen right when facing camera.
import * as THREE from 'three';

const W = 2048, H = 1024;
const PX = W / 360; // pixels per degree
const CX = W * 0.25, CY = H / 2;
const P = (lon, lat) => [CX + lon * PX, CY - lat * PX];

export class Face {
  constructor(o = {}) {
    this.o = {
      skin: '#f1c6ae', blush: 'rgba(232,120,120,0.28)', iris: '#86a29a', irisDark: '#4d6461',
      lash: '#2a1712', brow: '#3a2219', lip: '#c9837d', mouthIn: '#3b1219', tongue: '#c4606a',
      eyeLat: -7, eyeLon: 23, eyeW: 122, eyeH: 74, browLat: 10, sleepy: 0.3, ...o,
    };
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.state = { open: 0, smile: 0, blink: 0, lookX: 0, lookY: 0, brow: 0, angry: 0, wink: 0, oShape: 0, squint: 0, lid: null };
    this.key = '';
    this.draw();
  }

  set(s) {
    Object.assign(this.state, s);
    const st = this.state;
    const q = (v) => Math.round((v || 0) * 40);
    const key = [st.open, st.smile, st.blink, st.lookX, st.lookY, st.brow, st.angry, st.wink, st.oShape, st.squint, st.lid ?? -1].map(q).join(',');
    if (key !== this.key) { this.key = key; this.draw(); this.tex.needsUpdate = true; }
  }

  draw() {
    const c = this.ctx, o = this.o, s = this.state;
    c.fillStyle = o.skin; c.fillRect(0, 0, W, H);

    // blush
    for (const side of [-1, 1]) {
      const [x, y] = P(side * 29, -21);
      const g = c.createRadialGradient(x, y, 4, x, y, 70);
      g.addColorStop(0, o.blush); g.addColorStop(1, 'rgba(232,120,120,0)');
      c.fillStyle = g; c.fillRect(x - 80, y - 80, 160, 160);
    }

    // eyes
    for (const side of [-1, 1]) this.eye(side);

    // brows
    c.strokeStyle = o.brow; c.lineCap = 'round';
    for (const side of [-1, 1]) {
      const [x, y] = P(side * o.eyeLon, o.browLat + s.brow * 3);
      const tilt = s.angry * 10 - s.brow * 2;
      c.lineWidth = 19;
      c.beginPath();
      c.moveTo(x - side * 56, y + 4 - tilt * 0.2);
      c.quadraticCurveTo(x, y - 8, x + side * 58, y + 6 + tilt);
      c.stroke();
    }

    // nose shadow
    {
      const [x, y] = P(2, -22);
      c.strokeStyle = 'rgba(150,80,70,0.55)'; c.lineWidth = 7;
      c.beginPath(); c.moveTo(x - 4, y - 26); c.quadraticCurveTo(x + 6, y, x - 12, y + 6); c.stroke();
    }

    this.mouth();
  }

  eye(side) {
    const c = this.ctx, o = this.o, s = this.state;
    const [cx, cy] = P(side * o.eyeLon, o.eyeLat);
    const w = o.eyeW, h = o.eyeH;
    const baseLid = s.lid ?? o.sleepy;
    let close = Math.max(baseLid, s.blink, side > 0 ? s.wink : 0);
    close = Math.max(close, s.squint * 0.45);
    const inner = cx - side * w / 2, outer = cx + side * w / 2;
    const topY = cy - h * 0.55 + h * 1.05 * close;
    const botY = cy + h * 0.42 - s.squint * h * 0.15;

    if (close > 0.93) {
      // closed: a soft curved lash line
      c.strokeStyle = o.lash; c.lineWidth = 10; c.lineCap = 'round';
      c.beginPath(); c.moveTo(inner, cy + 6);
      c.quadraticCurveTo(cx, cy + 22 - (s.smile > 0.3 ? 0 : 10), outer + side * 6, cy + 2); c.stroke();
      return;
    }

    c.save();
    c.beginPath();
    c.moveTo(inner, cy + 4);
    c.bezierCurveTo(inner + side * w * 0.18, topY - 6, outer - side * w * 0.3, topY - 4, outer, cy - h * 0.05 + close * h * 0.3);
    c.bezierCurveTo(outer - side * w * 0.2, botY + 2, inner + side * w * 0.25, botY + 6, inner, cy + 4);
    c.closePath();
    c.fillStyle = '#f5f0ea'; c.fill();
    c.clip();

    // iris
    const ix = cx + s.lookX * w * 0.22 + side * 2, iy = cy + 2 - s.lookY * h * 0.25;
    const r = h * 0.47;
    const g = c.createRadialGradient(ix, iy - r * 0.2, r * 0.1, ix, iy, r);
    g.addColorStop(0, o.iris); g.addColorStop(0.75, o.irisDark); g.addColorStop(1, '#2b3434');
    c.fillStyle = g; c.beginPath(); c.arc(ix, iy, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#121014'; c.beginPath(); c.arc(ix, iy, r * 0.45, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.95)';
    c.beginPath(); c.arc(ix + r * 0.35, iy - r * 0.38, r * 0.2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(ix - r * 0.3, iy + r * 0.35, r * 0.09, 0, Math.PI * 2); c.fill();
    // lid shadow on the eyeball
    c.fillStyle = 'rgba(120,70,70,0.25)';
    c.fillRect(cx - w, topY - 40, w * 2, 52);
    c.restore();

    // upper lash line
    c.strokeStyle = o.lash; c.lineCap = 'round'; c.lineJoin = 'round';
    c.lineWidth = 9;
    c.beginPath();
    c.moveTo(inner, cy + 4);
    c.bezierCurveTo(inner + side * w * 0.18, topY - 6, outer - side * w * 0.3, topY - 4, outer, cy - h * 0.05 + close * h * 0.3);
    c.lineTo(outer + side * 4, cy - h * 0.06 + close * h * 0.3);
    c.stroke();
    // crease
    c.lineWidth = 4; c.strokeStyle = 'rgba(120,60,50,0.55)';
    c.beginPath();
    c.moveTo(inner + side * 10, topY - 12);
    c.quadraticCurveTo(cx, Math.min(topY, cy - h * 0.5) - 22, outer - side * 4, topY - 8);
    c.stroke();
    // lower lid
    c.lineWidth = 4; c.strokeStyle = 'rgba(110,60,55,0.6)';
    c.beginPath(); c.moveTo(inner + side * 12, botY - 2);
    c.quadraticCurveTo(cx, botY + 10, outer - side * 8, botY - 8); c.stroke();
  }

  mouth() {
    const c = this.ctx, o = this.o, s = this.state;
    const [mx, my] = P(1, -37);
    const open = Math.max(0, Math.min(1, s.open));
    const wdt = 88 - s.oShape * 30 + s.smile * 14;
    const curve = s.smile * 16;
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (open < 0.06) {
      // closed lips
      c.strokeStyle = '#6d2f31'; c.lineWidth = 9;
      c.beginPath();
      c.moveTo(mx - wdt / 2, my - curve * 0.6);
      c.quadraticCurveTo(mx, my + 6 + curve * 0.4, mx + wdt / 2, my - curve * 0.6 - 3);
      c.stroke();
      c.fillStyle = 'rgba(200,120,115,0.55)';
      c.beginPath(); c.ellipse(mx, my + 19, wdt * 0.3, 10, 0, 0, Math.PI * 2); c.fill();
      return;
    }
    const h = 10 + open * 84;
    const ww = wdt * (1 - open * 0.15);
    c.beginPath();
    c.moveTo(mx - ww / 2, my - curve * 0.5);
    c.bezierCurveTo(mx - ww * 0.3, my - h * 0.32, mx + ww * 0.3, my - h * 0.32, mx + ww / 2, my - curve * 0.5);
    c.bezierCurveTo(mx + ww * 0.45, my + h * 0.9, mx - ww * 0.45, my + h * 0.9, mx - ww / 2, my - curve * 0.5);
    c.closePath();
    c.fillStyle = o.mouthIn; c.fill();
    c.save(); c.clip();
    if (open > 0.25) { c.fillStyle = '#f3ece6'; c.fillRect(mx - ww / 2, my - h * 0.45, ww, h * 0.22); }
    c.fillStyle = o.tongue; c.beginPath(); c.ellipse(mx, my + h * 0.62, ww * 0.32, h * 0.28, 0, 0, Math.PI * 2); c.fill();
    c.restore();
    c.strokeStyle = '#5c2327'; c.lineWidth = 6; c.stroke();
    // lower lip highlight
    c.strokeStyle = 'rgba(205,125,120,0.6)'; c.lineWidth = 9;
    c.beginPath(); c.moveTo(mx - ww * 0.25, my + h * 0.78); c.quadraticCurveTo(mx, my + h * 0.86 + 6, mx + ww * 0.25, my + h * 0.78); c.stroke();
  }
}
