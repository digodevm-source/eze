// Pose library and procedural animation helpers.
import { pose, mixPose } from './character.js';
import { lerp, smooth, clamp01 } from './toon.js';

export const P = {
  stand: pose({}),
  relaxed: pose({ shoulderL: [0.05, 0, 0.1], elbowL: [-0.25, 0, 0], head: [0.04, 0, 0] }),
  pockets: pose({ shoulderL: [0.18, 0, 0.18], elbowL: [-0.55, 0, 0], wristL: [0, 0, 0] }),
  crossed: pose({ shoulderL: [-0.3, -1.2, 0.1], elbowL: [-1.75, 0, 0], shoulderR: [-0.42, 1.2, -0.1], elbowR: [-1.7, 0, 0] }),
  sitSeat: pose({ hipL: [-1.5, 0, 0.06], kneeL: [1.45, 0, 0], ankleL: [0.1, 0, 0], spine: [-0.08, 0, 0], shoulderL: [-0.2, 0, 0.12], elbowL: [-0.7, 0, 0] }),
  sitEdge: pose({ hipL: [-1.52, 0, 0.08], kneeL: [1.2, 0, 0], ankleL: [0.3, 0, 0], spine: [0.08, 0, 0], shoulderL: [0.15, 0, 0.42], elbowL: [-0.1, 0, 0] }),
  sitSand: pose({ hipL: [-2.05, 0, 0.18], kneeL: [2.1, 0, 0], ankleL: [0.3, 0, 0], spine: [0.12, 0, 0], shoulderL: [-0.95, 0, 0.12], elbowL: [-0.5, 0, 0] }),
  lounge: pose({ hipL: [-0.62, 0, 0.08], kneeL: [0.15, 0, 0], shoulderL: [-2.6, 0, 0.5], elbowL: [-2.2, 0, 0] }),
  lie: pose({ shoulderL: [-0.1, 0, 0.55], elbowL: [-0.1, 0, 0], hipL: [0, 0, 0.12] }),
  lieAngel: pose({ shoulderL: [-0.1, 0, 2.1], elbowL: [-0.1, 0, 0], hipL: [0, 0, 0.35] }),
  lieHeadHands: pose({ shoulderL: [-2.6, 0, 0.5], elbowL: [-2.2, 0, 0], hipL: [0, 0, 0.1], hipR: [-0.4, 0, -0.1], kneeR: [0.8, 0, 0] }),
  holdChest: pose({ shoulderL: [-0.75, 0, 0.12], elbowL: [-1.35, 0, 0], wristL: [0.2, 0, 0] }),
  raiseBoth: pose({ shoulderL: [-2.5, 0, 0.35], elbowL: [-0.35, 0, 0], wristL: [0.3, 0, 0], head: [-0.12, 0, 0] }),
  cheersR: pose({ shoulderR: [-1.35, -0.3, -0.1], elbowR: [-0.9, 0, 0], shoulderL: [0.05, 0, 0.12], elbowL: [-0.2, 0, 0] }),
  drink: pose({ shoulderR: [-1.0, 0.4, -0.05], elbowR: [-2.2, 0, 0], shoulderL: [0.05, 0, 0.12], elbowL: [-0.2, 0, 0], head: [-0.15, 0, 0] }),
  shrug: pose({ shoulderL: [-0.35, 0, 0.62], elbowL: [-1.65, -0.0, 0], wristL: [0, 0.9, 0.4], head: [0.05, 0, 0.15], spine: [0, 0, 0] }),
  waveOff: pose({ shoulderR: [-1.35, 0.25, -0.35], elbowR: [-0.45, 0, 0], wristR: [0.3, 0, 0], shoulderL: [0.05, 0, 0.12] }),
  fistOut: pose({ shoulderL: [-1.15, 0, 0.8], elbowL: [-0.35, 0, 0], shoulderR: [0.05, 0, -0.12] }),
  fist: pose({ shoulderL: [-1.35, -0.55, 0.15], elbowL: [-0.35, 0, 0], shoulderR: [0.05, 0, -0.12] }),
  drive: pose({ hipL: [-1.5, 0, 0.06], kneeL: [1.3, 0, 0], spine: [-0.1, 0, 0], shoulderL: [-1.1, 0, 0.12], elbowL: [-0.65, 0, 0], shoulderR: [-1.1, 0, -0.12], elbowR: [-0.65, 0, 0] }),
  pointUp: pose({ shoulderR: [-2.3, 0, -0.25], elbowR: [-0.2, 0, 0] }),
  rapR: pose({ shoulderR: [-0.9, 0.2, -0.25], elbowR: [-1.3, 0, 0], wristR: [0.3, 0, 0] }),
};

export const blend = mixPose;

// Rap gestures: hand bounces with syllables, head nods on beats.
export function rapLayer(p, t, mouth, beatPhase, amt = 1, hand = 'R') {
  const q = JSON.parse(JSON.stringify(p));
  const nod = Math.pow(Math.max(0, Math.cos(beatPhase * Math.PI * 2)), 6) * 0.08 * amt;
  q.head = [q.head[0] + nod, q.head[1] + Math.sin(t * 1.3) * 0.05 * amt, q.head[2]];
  q.neck = [q.neck[0] + nod * 0.5, q.neck[1], q.neck[2]];
  const sh = 'shoulder' + hand, el = 'elbow' + hand, wr = 'wrist' + hand;
  const s = hand === 'R' ? -1 : 1;
  const g = amt * (0.35 + mouth * 0.65);
  q[sh] = [lerp(q[sh][0], -0.85 - mouth * 0.25, g), q[sh][1] + 0.25 * s * g, lerp(q[sh][2], 0.25 * s, g)];
  q[el] = [lerp(q[el][0], -1.25 + Math.sin(t * 8) * 0.12, g), q[el][1], q[el][2]];
  q[wr] = [lerp(q[wr][0], 0.35 + mouth * 0.3, g), q[wr][1], q[wr][2]];
  return q;
}

export function breathe(p, t, amt = 1) {
  const q = JSON.parse(JSON.stringify(p));
  q.spine = [q.spine[0] + Math.sin(t * 2.1) * 0.012 * amt, q.spine[1], q.spine[2]];
  q.head = [q.head[0] + Math.sin(t * 2.1 + 1) * 0.01 * amt, q.head[1], q.head[2]];
  return q;
}

export function blinkAt(t, seed = 0) {
  const period = 3.1 + (seed % 3) * 0.7;
  const ph = ((t + seed * 1.37) % period) / period;
  const d = Math.abs(ph - 0.5) * period;
  return d < 0.07 ? 1 - d / 0.07 : 0;
}

export { smooth, clamp01, lerp };
