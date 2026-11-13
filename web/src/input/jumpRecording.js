// Bounded, browser-local traces. No device identifiers or network upload.
export function createJumpRecording(clock = () => performance.now()) {
  let data = null, stage = 'free', active = false, started = 0;
  return {
    start(kind = 'play', settings = {}) {
      started = clock(); active = true; stage = kind === 'play' ? 'play' : 'prepare';
      data = { version: 2, kind, settings: { ...settings }, samples: [], markers: [], events: [] };
    },
    stage(name) { stage = name; if (active) data.markers.push({ t: clock() - started, stage }); },
    event(name) { if (active && data.events.length < 1000) data.events.push({ t: clock() - started, event: name }); },
    push(sample) {
      if (!active) return;
      if (clock() - started > 90000 || data.samples.length >= 18000) { active = false; return; }
      if (!['L', 'R'].includes(sample.hand) || !Number.isFinite(sample.ts)) return;
      data.samples.push({ t: clock() - started, ts: sample.ts, stage, hand: sample.hand,
        a: [...sample.a], ag: sample.ag ? [...sample.ag] : null,
        up: sample.up, load: sample.load });
    },
    stop() { active = false; return data; },
    get active() { return active; },
    get data() { return data; },
    get elapsed() { return data ? clock() - started : 0; },
  };
}
