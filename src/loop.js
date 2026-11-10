// Fixed-timestep loop: the simulation always advances in steps of stepDt,
// whatever the monitor's refresh rate. A long frame (alt-tab, recording
// stall) is clamped to maxFrameDt so the game never jumps ahead.

const EPS = 1e-9; // absorbs float drift, e.g. 1/60 being a hair under 2 * (1/120)

/**
 * @param {{ step: (dt: number) => void, render: (alpha: number) => void, stepDt: number, maxFrameDt: number }} opts
 * @returns {{ frame(dtSeconds: number): void }}
 */
export function createFixedLoop({ step, render, stepDt, maxFrameDt }) {
  let acc = 0;
  return {
    frame(dtSeconds) {
      const dt = Number.isFinite(dtSeconds) && dtSeconds > 0 ? Math.min(dtSeconds, maxFrameDt) : 0;
      acc += dt;
      while (acc >= stepDt - EPS) {
        step(stepDt);
        acc -= stepDt;
      }
      if (acc < 0) acc = 0;
      render(acc / stepDt);
    },
  };
}
