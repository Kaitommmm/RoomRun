// Phone -> relay messages (protocol in the plan, Task 11). Pure, so it's tested.

const r3 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1000) / 1000 || 0 : null);
const vec = (o, keys) => (o ? keys.map((k) => r3(o[k])) : null);

/**
 * @param {'L'|'R'} hand
 * @param {{ acceleration: any, accelerationIncludingGravity: any, rotationRate: any }} e DeviceMotionEvent
 * @param {number} ts phone clock (performance.now()), ms
 */
export function motionMessage(hand, e, ts) {
  return {
    t: 'm', hand, ts: r3(ts),
    a: vec(e.acceleration, ['x', 'y', 'z']),
    ag: vec(e.accelerationIncludingGravity, ['x', 'y', 'z']),
    r: vec(e.rotationRate, ['alpha', 'beta', 'gamma']),
  };
}

/** @param {{ protocol: string, host: string }} loc */
export function wsUrl(loc) {
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/ws`;
}
