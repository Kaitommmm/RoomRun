import { test, expect } from 'vitest';
import * as THREE from 'three';
import { meshPool } from '../src/render/actors.js';

test('meshPool: a stand-in taken before its GLB loaded never comes back after the swap', () => {
  const templates = { dog: new THREE.Group() };
  const root = new THREE.Group();
  const { take, give } = meshPool(templates, root);
  const early = take('dog');
  templates.dog = new THREE.Group(); // GLB arrived
  give('dog', early);
  const next = take('dog');
  expect(next).not.toBe(early);
  expect(early.parent).toBe(null);
  give('dog', next);
  expect(take('dog')).toBe(next); // current-template meshes are still reused
});
