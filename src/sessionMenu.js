import { createWorld } from './sim/world.js';

// Retain the world object's identity used by renderers. Controller connections,
// settings and saved leaderboard belong to the session and are not disconnected.
export function resetWorldToMenu(world) {
  Object.assign(world,createWorld(world.cfg));
  return world;
}
