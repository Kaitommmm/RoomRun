// Where and how the boss dog (and its heel and pack dogs) are drawn. Pure math,
// unit-tested; actors.js does the Three.js side.
import config from '../config.js';

/**
 * Visible gap 0..visibleGap is drawn 0.9..2.2 m behind the kid so the dog stays
 * framed (the camera's lower edge meets the road ~2 m behind the kid; the dog is only 0.8 m tall).
 * @returns {number} metres behind the kid
 */
export function chaserBack(gap, cfg = config.chaser) {
  const k = Math.min(1, Math.max(0, gap / cfg.visibleGap));
  return 0.9 + k * 1.3;
}

/** The boss is on screen when it has caught the kid, is close, or is peeking after a hit. */
export function showChaser(world, peekT) {
  return world.phase === 'caught' || world.chaser.visible || peekT > 0;
}

/** @returns {'amber'|'red'} */
export function eyeColor(world) {
  return world.chaser.visible || world.chase.phase === 'active' ? 'red' : 'amber';
}

/**
 * Where a woken heel dog runs: just behind the kid, half a lane to one side
 * (dog 0 to the road-centre side, dog 1 the other way), clamped to the road.
 * @param {0|1} index
 * @returns {{ x: number, back: number }} back = metres behind the kid
 */
export function heelSlot(index, playerX, laneWidth) {
  const centreSide = playerX > 0.1 ? -1 : 1;
  const side = index === 0 ? centreSide : -centreSide;
  const edge = 1.5 * laneWidth - 0.4;
  const x = Math.max(-edge, Math.min(edge, playerX + side * 0.9));
  return { x, back: index === 0 ? 0.4 : 0.8 }; // the camera's lower edge is ~2 m behind the kid: keep small dogs well inside
}

/** Which side of the kid the boss runs on: toward the road centre so it doesn't hide the kid. */
export function chaserSide(playerX) {
  return playerX > 0.1 ? -1 : 1;
}

/**
 * Caught: heel and pack dogs sit on the far side from the boss (which grabs the
 * shirt 0.5 m to its side), so nothing clips into the hero shot.
 * @returns {{ x: number, back: number }} back = metres behind the kid
 */
export function caughtDogSpot(index, playerX, laneWidth) {
  const edge = 1.5 * laneWidth - 0.4;
  const x = playerX - chaserSide(playerX) * (0.9 + 0.45 * index);
  return { x: Math.max(-edge, Math.min(edge, x)), back: 0.5 + 0.35 * index };
}
