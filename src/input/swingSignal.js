// Remove slowly changing device-frame offsets before taking a rotation-invariant
// magnitude. Confirm local peaks on their falling edge, rather than demanding
// several samples above one high absolute threshold and a near-zero reset.
export function createSwingSignal({ positiveOnly = false, cyclePeaks = false } = {}) {
  let center = null, filtered = [0, 0, 0], previousTime = null;
  let valley = 0, peak = 0, tracking = false, activeSamples = 0;
  let level = 0, peakHold = 0;
  let settleUntil = 0;
  let peakQuality = 1;
  let peakVector = [0,0,0], cycleDirection = null, cycleTime = -Infinity;
  return {
    get level() { return level; },
    get peak() { return peakHold; },
    push(a, time, threshold, enabled = true, quality = 1) {
      if (!center || previousTime == null || time - previousTime > 250 || time <= previousTime) {
        // Gravity-relative linear acceleration should be centred on zero. Do
        // not mistake the first upward running stroke for its standing offset.
        center = positiveOnly || cyclePeaks ? [0,0,0] : [...a]; filtered = [0, 0, 0]; previousTime = time;
        cycleDirection = null; cycleTime = -Infinity;
        settleUntil = time + 120;
        valley = peak = level = peakHold = 0; tracking = false; activeSamples = 0;
        return false;
      }
      const dt = Math.min(0.1, (time - previousTime) / 1000);
      previousTime = time;
      if (time < settleUntil) {
        if (!positiveOnly && !cyclePeaks) center = center.map((x, i) => x + 0.5 * (a[i] - x));
        return false;
      }
      const slow = 1 - Math.exp(-dt / 0.8), smooth = 1 - Math.exp(-dt / 0.025);
      const dynamic = a.map((x, i) => {
        center[i] += slow * (x - center[i]);
        const d = x - center[i];
        filtered[i] += smooth * (d - filtered[i]);
        return d;
      });
      const rawStrength = positiveOnly ? Math.max(0, dynamic[2]) : Math.hypot(...dynamic);
      level = positiveOnly ? Math.max(0, filtered[2]) : Math.hypot(...filtered);
      peakHold = Math.max(level, peakHold * Math.exp(-dt / 1.5));
      if (!enabled) { tracking = false; valley = level; peak = level; activeSamples = 0; return false; }
      if (!tracking) {
        valley = Math.min(valley, level);
        if (level - valley >= threshold * 0.45) {
          tracking = true; peak = level; peakQuality = quality; peakVector = [...filtered];
          activeSamples = rawStrength >= threshold * 0.65 ? 1 : 0;
        }
        return false;
      }
      if (level > peak) { peak = level; peakQuality = quality; peakVector = [...filtered]; }
      if (rawStrength >= threshold * 0.65) activeSamples = Math.min(10, activeSamples + 1);
      if (peak - level < Math.max(0.25, threshold * 0.2)) return false;
      let counted = peak - valley >= threshold && activeSamples >= 2 && peakQuality >= 0.45;
      if (counted && cyclePeaks) {
        // The magnitude has peaks on both halves of a swing. Keep one direction
        // per cycle, selected from the movement itself rather than a fixed axis.
        // A pause releases the direction so a new gesture can begin either way.
        const norm = Math.hypot(...peakVector);
        const direction = peakVector.map(x => x / norm);
        const opposite = cycleDirection && time - cycleTime <= 1100
          && direction.reduce((sum,x,i) => sum + x * cycleDirection[i], 0) < -0.25;
        if (opposite) counted = false;
        else { cycleDirection = direction; cycleTime = time; }
      }
      tracking = false; valley = level; peak = level; activeSamples = 0;
      return counted;
    },
  };
}
