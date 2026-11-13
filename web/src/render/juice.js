// Code motion layered on top of the mocap clips (Mixamo kid, Mesh2Motion dogs),
// so the characters bounce like the rest of the game.

/**
 * Squash (negative) or stretch (positive) around a jump: crouch at take-off,
 * stretch while rising, squash on landing.
 * @param {number} jumpT seconds since take-off
 * @param {number} landT seconds since landing
 * @param {boolean} airborne
 * @param {number} rise vertical speed over jump speed, -1..1
 * @returns {number|null} null when no jump is on
 */
export function jumpSquash(jumpT, landT, airborne, rise) {
  if (landT < 0.14) return -0.2 * (1 - landT / 0.14);
  if (jumpT < 0.08) return -0.22 * (1 - jumpT / 0.08);
  if (airborne) return 0.04 + 0.1 * Math.max(0, rise);
  return null;
}

/**
 * Body bob for a dog on its Run clip, one bound per clip loop.
 * @param {number} frac 0..1 through the clip
 * @returns {{ bob: number, pitch: number }} bob in model metres, pitch rad (nose down > 0)
 */
export function runBob(frac) {
  const a = frac * Math.PI * 2;
  return { bob: 0.035 * (0.5 + 0.5 * Math.sin(a)), pitch: 0.06 * Math.cos(a) };
}
