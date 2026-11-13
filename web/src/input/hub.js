// Every control method (keyboard, phones, later the ESP32 sticks) is a source;
// the game only ever sees the one merged InputFrame.

/** @typedef {{ speed: number, laneDelta: -1|0|1, jump: boolean, steps: number }} InputFrame */
/** @typedef {{ read(nowMs: number): InputFrame }} InputSource */

export function createInputHub() {
  /** @type {InputSource[]} */
  const sources = [];
  return {
    /** @param {InputSource} source */
    add(source) { sources.push(source); },
    /** @returns {InputFrame} max speed, first lane change, any jump, summed steps */
    read(nowMs) {
      /** @type {InputFrame} */
      const frame = { speed: 0, laneDelta: 0, jump: false, steps: 0 };
      // Read every source, even after a lane change is found: reading consumes one-shots.
      for (const source of sources) {
        const f = source.read(nowMs);
        frame.speed = Math.max(frame.speed, f.speed);
        if (frame.laneDelta === 0) frame.laneDelta = f.laneDelta;
        frame.jump = frame.jump || f.jump;
        frame.steps += f.steps;
      }
      return frame;
    },
  };
}
