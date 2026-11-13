// Follow camera: behind and above the kid, lower/closer/wider than the mood
// mockup. Sways with each real step, shakes on hits, pulls back a little when
// the ghost is close so it stays in frame, widens with speed.
import * as THREE from 'three';
import config from '../config.js';
import { meterFill } from '../hud/format.js';
import { chaserSide } from './chaserView.js';

const BASE = { back: 5.6, up: 3.1, lookAhead: 8, lookUp: 1.3, fov: 66 };

/**
 * @param {THREE.PerspectiveCamera} camera
 * @param {typeof config} cfg
 */
export function createCameraRig(camera, cfg = config) {
  let x = 0;
  let trauma = 0; // 0..1, shake = trauma^2
  let sway = 0, swaySide = 1, bob = 0;
  let danger = 0, speedK = 0, caughtK = 0;
  let time = 0;
  /** seconds into the caught cutscene */
  let cutT = 0;
  const look = new THREE.Vector3();

  return {
    /**
     * @param {any} world
     * @param {number} dt render seconds (already time-scaled)
     * @param {{ z: number, x: number, y: number }} interp player position between sim steps
     */
    update(world, dt, interp) {
      time += dt;
      const ease = (rate) => 1 - Math.exp(-rate * dt);
      const running = world.phase === 'running';
      x += (interp.x - x) * ease(6);
      trauma = Math.max(0, trauma - dt * 1.6);
      sway += (swaySide * 0.07 - sway) * ease(10);
      bob = Math.max(0, bob - dt * 5);
      danger += ((running ? meterFill(world.chaser.gap, cfg.chaser) : 0) - danger) * ease(3);
      speedK += ((running ? world.player.speedMps / cfg.player.maxSpeed : 0) - speedK) * ease(2);
      caughtK += ((world.phase === 'caught' ? 1 : 0) - caughtK) * ease(3);

      const pull = Math.max(0, danger - 0.5) * 2; // ghost close: back off so it's framed
      const back = BASE.back + pull * 0.9 - caughtK * 1.2;
      const up = BASE.up + pull * 0.5 - caughtK * 0.6 + interp.y * 0.35 - bob * 0.05;
      const shake = trauma * trauma;
      const n = (f, o) => Math.sin(time * f + o) * Math.sin(time * f * 1.7 + o * 2.3);
      const idle = world.phase === 'title' ? Math.sin(time * 0.6) * 0.25 : 0;

      camera.position.set(
        x * 0.6 + sway + idle + shake * 0.35 * n(37, 1),
        up + shake * 0.25 * n(41, 2),
        -interp.z + back,
      );
      look.set(x * 0.4 + sway * 0.4, BASE.lookUp + interp.y * 0.5 + caughtK * 0.2, -interp.z - BASE.lookAhead * (1 - caughtK * 0.6));
      camera.lookAt(look);
      camera.rotateZ(sway * 0.12 + shake * 0.05 * n(29, 3));
      cutT = world.phase === 'caught' ? cutT + dt : 0;
      if (cutT > 0) {
        // caught cutscene: swing round to a low, mostly-front view so the kid's scared face and the
        // dog biting his shirt are both in frame. Swing toward the road's middle (side lanes:
        // the other way runs into the shophouses), else away from the dog.
        const k = Math.min(1, cutT / 0.9), s = k * k * (3 - 2 * k);
        const a = s * 2.6, r = 4.4 - s * 1.6;
        const kx = interp.x, kz = -interp.z + 0.6; // the kid is pulled back 0.6 m
        const side = Math.abs(kx) > 0.5 ? -Math.sign(kx) : -chaserSide(kx);
        const camX = Math.max(-3.5, Math.min(3.5, kx + side * Math.sin(a) * r));
        camera.position.set(camX + shake * 0.2 * n(37, 1), 2.6 - s * 1.6, kz + Math.cos(a) * r);
        camera.lookAt(kx, 0.75, kz);
      }
      const fov = BASE.fov + speedK * 6 + pull * 4 - caughtK * 6;
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    },
    onEvent(name) {
      if (name === 'hit') trauma = Math.min(1, trauma + 0.8);
      else if (name === 'hit-tuktuk') trauma = 1; // the biggest crash
      else if (name === 'caught') trauma = 1;
      else if (name === 'land') bob = 1;
    },
    onSteps(n) {
      if (n > 0) { swaySide = -swaySide; bob = Math.max(bob, 0.4); }
    },
  };
}
