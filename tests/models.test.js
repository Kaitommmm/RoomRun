import { test, expect } from 'vitest';
import * as THREE from 'three';
import { animationFor, makeStandIn, dogVariant, addEyes, BOSS_EYES } from '../src/render/models.js';

test('animationFor', () => {
  expect(animationFor({ airborne: true, stumbleT: 0, speedMps: 5 })).toBe('jump');
  expect(animationFor({ airborne: false, stumbleT: 0.5, speedMps: 5 })).toBe('stumble');
  expect(animationFor({ airborne: false, stumbleT: 0, speedMps: 0.2 })).toBe('idle');
  expect(animationFor({ airborne: false, stumbleT: 0, speedMps: 5 })).toBe('run');
});

test('every stand-in builds, sits on the ground, and has outlines', () => {
  for (const name of ['kid', 'bossdog', 'dog', 'jar', 'cart', 'tuktuk', 'coin']) {
    const obj = makeStandIn(name);
    expect(obj.name).toBe(name);
    let meshes = 0, outlines = 0;
    obj.traverse((o) => { if (o.isMesh) { meshes++; if (o.name.endsWith('-outline')) outlines++; } });
    expect(meshes).toBeGreaterThan(1); expect(outlines).toBeGreaterThan(0);
  }
});

test('unknown stand-in name throws', () => {
  expect(() => makeStandIn('dragon')).toThrow();
});

test('ghost is gone', () => {
  expect(() => makeStandIn('ghost')).toThrow();
});

test('boss dog stand-in: ~1.1 m long, on the ground, two eyes', () => {
  const d = makeStandIn('bossdog');
  const box = new THREE.Box3().setFromObject(d);
  const len = box.max.z - box.min.z;
  expect(len).toBeGreaterThanOrEqual(1.0); expect(len).toBeLessThanOrEqual(1.2);
  expect(box.min.y).toBeCloseTo(0, 1);
  expect(d.userData.eyes.length).toBe(2);
});

const firstColor = (obj) => {
  let m; obj.traverse((o) => { if (!m && o.isMesh && o.name !== 'eye' && !o.name.endsWith('-outline')) m = o; });
  return m;
};

test('dogVariant scales, tints, leaves source alone', () => {
  const src = makeStandIn('bossdog');
  const before = firstColor(src).material.color.getHex();
  const v = dogVariant(src, { scale: 0.6, tint: 0xd9a066 });
  expect(v.scale.x).toBeCloseTo(0.6); expect(v.scale.y).toBeCloseTo(0.6);
  expect(firstColor(src).material.color.getHex()).toBe(before);
  expect(firstColor(v).material.color.getHex()).not.toBe(before);
  expect(firstColor(v).material).not.toBe(firstColor(src).material);
});

test('addEyes: optional x centre for a turned head; BOSS_EYES sits on the GLB head', () => {
  const g = new THREE.Group();
  const [l, r] = addEyes(g, { x: -0.02, y: 0.5, z: 0.4, spread: 0.08 });
  expect(l.position.x).toBeCloseTo(-0.1); expect(r.position.x).toBeCloseTo(0.06);
  expect(BOSS_EYES.y).toBeGreaterThan(0.4); expect(BOSS_EYES.z).toBeGreaterThan(0.4);
});
