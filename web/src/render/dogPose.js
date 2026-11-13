// Cartoon gallop for the static dog meshes: no moving legs, the whole body
// bounds (bob up, lean forward, stretch) once per BOUND_LENGTH metres run.

/** Metres per bound. */
export const BOUND_LENGTH = 1.6;

/** @returns {number} new phase (radians), one 2π per bound */
export function advanceGallop(phase, speedMps, dt) {
  return phase + (2 * Math.PI * speedMps / BOUND_LENGTH) * dt;
}

/** @returns {{ bob: number, lean: number, stretch: number }} bob m, lean rad forward, stretch along the body */
export function gallopPose(phase) {
  const up = Math.abs(Math.sin(phase / 2)); // one hop per 2π
  return { bob: 0.18 * up, lean: 0.22 * (1 - up), stretch: 1 + 0.07 * up };
}
