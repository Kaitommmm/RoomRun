// Observe the upstream detector without changing, filtering or consuming its
// input/output. read() forwards the one-shot frame exactly once to the game.
export function withMotionDiagnostics(detector, onJump = () => {}) {
  const observers = new Set();
  return {
    ...detector,
    observe(callback) { observers.add(callback); return () => observers.delete(callback); },
    push(sample) {
      detector.push(sample);
      const { a, ag, hand, ts } = sample ?? {};
      if (!observers.size || !['L', 'R'].includes(hand) || !Number.isFinite(ts)
          || !Array.isArray(a) || a.length !== 3 || !a.every(Number.isFinite)) return;
      const raw = Array.isArray(ag) && ag.length === 3 && ag.every(Number.isFinite) ? ag : null;
      const g = raw?.map((v, i) => v - a[i]), gn = g ? Math.hypot(...g) : 0;
      const up = gn > 3 ? a.reduce((sum, v, i) => sum + v * g[i], 0) / gn : 0;
      const value = { hand, ts, a: [...a], ag: raw ? [...raw] : null, up, load: raw ? Math.hypot(...raw) : null };
      for (const callback of observers) callback(value);
    },
    read(now) {
      const frame = detector.read(now);
      if (frame.jump) onJump(now);
      return frame;
    },
  };
}
