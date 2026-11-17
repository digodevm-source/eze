import * as THREE from 'three';
import { buildWorld, palm, island, rock } from '../world.js';
import { buildCharacter, pose } from '../character.js';

export const MAIN = { seed: 3 };
export const BRO = {
  seed: 9, tee: '#e9e4dc', teePrint: 'wave', shorts: '#2b2d3a', shoes: '#26252b', sole: '#d8d4cc',
  hair: { type: 'straight', color: '#14121a', light: '#3a3550' }, iris: '#6b4a36', irisDark: '#3a261b', skin: '#eec0a6',
};

export async function build(E, params) {
  const view = params.get('view') || 'wide';
  const world = buildWorld(E.scene, { shoreZ: -2 });
  world.setPhase(Number(params.get('phase') || 0.15));

  const a = buildCharacter(MAIN);
  const b = buildCharacter(BRO);
  E.scene.add(a.root, b.root);
  a.root.position.set(0.36, world.groundY(0.36, 0), 0);
  b.root.position.set(-0.38, world.groundY(-0.38, 0.05), 0.05);
  a.root.rotation.y = -0.22; b.root.rotation.y = 0.28;

  a.apply(pose({ shoulderL: [0.1, 0, 0.2], elbowL: [-0.4, 0, 0], shoulderR: [-0.2, 0, -0.15], elbowR: [-1.2, 0, 0], head: [0.05, -0.15, 0.06], spine: [0.0, 0.05, 0] }));
  b.apply(pose({ shoulderL: [0.0, 0, 0.1], elbowL: [-0.2, 0, 0], shoulderR: [0.1, 0, -0.2], head: [-0.03, 0.2, -0.04], hipL: [0.05, 0, 0.08], kneeL: [0.1, 0, 0] }));
  a.face.set({ open: 0.55, smile: 0.1, lookX: -0.1 });
  b.face.set({ open: 0, smile: 0.5, lookX: 0.4, lid: 0.35 });

  const p1 = palm(4, 6.5); p1.position.set(-2.2, world.groundY(-2.2, -4), -4); p1.rotation.z = -0.15; E.scene.add(p1);
  const p2 = palm(8, 5.5); p2.position.set(2.6, world.groundY(2.6, -6), -6); p2.rotation.y = 2; E.scene.add(p2);
  const isl = island(2, 160, 14); isl.position.set(-150, -0.5, -380); E.scene.add(isl);
  const isl2 = island(5, 90, 8, '#4a3060'); isl2.position.set(110, -0.5, -360); E.scene.add(isl2);
  const r1 = rock(3, 0.5); r1.position.set(1.4, 0.1, -1.6); E.scene.add(r1);

  const cam = E.camera;
  if (view === 'close') {
    cam.fov = 30; cam.updateProjectionMatrix();
    cam.position.set(0.12, 1.78, 2.1);
    cam.lookAt(0.3, 1.72, 0);
    world.focus.set(0.3, 1, 0);
  } else {
    cam.position.set(0, 1.05, 5.6);
    cam.lookAt(0, 1.3, 0);
    world.focus.set(0, 1, 0);
  }
  const words = 'ЕДЕМ НА МОРЕ С БРАТОМ'.split(' ').map((w, i) => ({ w, t0: i * 0.1, t1: i * 0.1 + 0.3 }));
  return {
    world, duration: 1,
    update(t) { world.update(t + 3, cam); },
    overlay(ctx, t, drawCaption) { if (view !== 'close') drawCaption(ctx, words, 1.0, { top: 300 }); },
  };
}
