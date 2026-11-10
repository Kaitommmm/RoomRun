// Slow-mo grab: in the last ~second before the boss dog catches the kid the game
// runs slower so the grab reads on video. The sim's rules are untouched; main.js
// feeds the loop less time per real second.
import config from '../config.js';

/** @returns {number} time scale to ease toward: config.juice.slowMoScale or 1 */
export function slowMoTarget(world, cfg = config) {
  if (world.phase !== 'running') return 1;
  const j = cfg.juice;
  const closing = world.chaser.speedMps - world.player.speedMps;
  const gap = world.chaser.gap;
  return closing > 0.5 && gap < j.slowMoMaxGap && gap / closing < j.slowMoWindow ? j.slowMoScale : 1;
}

/**
 * Hit-stop: on impact the game clock freezes for cfg.effects.hitStop real seconds.
 * main.js multiplies frame time by factor(); caught and restart cancel it.
 */
export function createHitStop(cfg = config) {
  let left = 0;
  return {
    trigger() { left = cfg.effects.hitStop; },
    reset() { left = 0; },
    /** @param {number} realDt @returns {0|1} */
    factor(realDt) {
      if (left <= 0) return 1;
      left -= realDt;
      return 0;
    },
  };
}
