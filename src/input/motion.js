// Arm-swing motion -> InputFrame, from two hand-held phones now and the ESP32
// sticks later. Samples are linear acceleration a (gravity removed) and,
// when the device reports it, ag (gravity included), m/s^2, with timestamps
// already on the game clock.
//
// Hands twist hard while running (up to ~1400 deg/s), so no device axis stays
// "up" or "sideways" for long. Steps and jumps therefore use orientation-free
// magnitudes; only the legacy motion lanes still read device axes.
//
// Step (exercise, default): require clear linear-acceleration peaks in any direction and
// three regularly spaced pulses before producing speed. This encourages
// jogging in place; a hand IMU cannot prove actual foot contact or posture.
// Step (allAxes, light-play/test): use the magnitude of linear acceleration across all
// three axes, so mounting flat/upright/tilted does not select a different axis.
// Remove slowly changing offsets and confirm local peaks on their falling edge;
// reject isolated one-sample spikes and share the refractory between hands.
// A rotation by itself need not be a step.
// Step (vertical mode, bounceSteps): the body bounces once per footstep and both
//   hands ride it, so a footstep is world-up rising past bounceStepThreshold
//   on either hand. Tilt-free, so the arms can swing and twist naturally.
//   Footsteps come slower than arm-swing peaks: motion.cadence has its own rates.
// Step (old, bounceSteps off): |a| rises past stepThreshold. A swing has two peaks per arm cycle
//   (front and back), so each hand counts every stepEvery-th peak: one step per
//   cycle per hand, like the legs. stepSign != 0 instead keeps only the peaks
//   where the vertical axis has that sign (old, tilt-sensitive).
// Jump: both hands push up past their bar within jumpWindowMs (the takeoff,
//   so it fires early). "Up" is the gravity direction, ag - a, so wrist tilt
//   does not matter. Running bounces the body (both hands together) once per
//   step, so the bar is jumpOverBounce x the recent bounce peak, never under
//   jumpThreshold. The landing thump falls in jumpCooldownMs. Backup: both
//   hands in free fall (|ag| under freefallThreshold) together for freefallMs.
// Lane (motionLanes only): both hands' lateral axis past swipeThreshold, same
//   sign, within swipeWindowMs. Off by default: lanes come from phone taps.
import config from '../config.js';
import { createCadence } from './cadence.js';
import { createSwingSignal } from './swingSignal.js';

/**
 * @param {typeof config.motion} cfg read live on every sample
 * @param {ReturnType<typeof createCadence>} cadence shared by both hands
 */
export function createMotionDetector(cfg = config.motion, cadence = createCadence(cfg.cadence)) {
  const exerciseCadence = createCadence(cfg.exerciseCadence ?? { ...cfg.cadence, minRate:0, fullRate:3.2, followPace:true });
  const hand = () => ({ mag: 0, lat: 0, up: 0, upPeak: 0, bounce: 0, jumpBar: cfg.jumpThreshold, lastStep: -Infinity, peaks: 0, latSpike: null, upSpike: null, fallSince: null,
    swing: createSwingSignal(), exercise: createSwingSignal({ cyclePeaks:true }), history: [], stepCount: 0, seen: -Infinity });
  const hands = { L: hand(), R: hand() };
  let gestureFreeAt = -Infinity;
  let stepsFreeAt = -Infinity;
  let lastBounceStep = -Infinity;
  let lastSwingStep = -Infinity;
  let lastExerciseStep = -Infinity, exerciseBeats = [], exerciseReady = false, exerciseHoldUntil = -Infinity;
  /** @type {-1|0|1} */
  let laneDelta = 0;
  let jump = false;

  const crossed = (prev, now, threshold) => Math.abs(prev) < threshold && Math.abs(now) >= threshold;
  const pairs = (a, b, t, windowMs) => a && b && a.sign === b.sign && Math.abs(a.t - b.t) <= windowMs && t - a.t <= windowMs;

  function gesture(t, cooldownMs = cfg.gestureCooldownMs) {
    gestureFreeAt = t + cooldownMs;
    stepsFreeAt = t + cfg.suppressStepsAfterGestureMs;
    cadence.holdFor(cfg.gestureHoldMs, t);
    exerciseCadence.holdFor(cfg.gestureHoldMs, t);
    exerciseHoldUntil = t + cfg.gestureHoldMs;
    for (const h of Object.values(hands)) { h.latSpike = null; h.upSpike = null; h.fallSince = null; }
  }

  return {
    /** @param {{ hand: 'L'|'R', ts: number, a: number[]|null, ag?: number[]|null }} sample */
    push(sample) {
      const h = hands[sample.hand];
      const a = sample.a;
      if (!h || !Array.isArray(a) || a.length !== 3 || !a.every(Number.isFinite) || !Number.isFinite(sample.ts)) return;
      const t = sample.ts;
      h.seen = t;
      const other = hands[sample.hand === 'L' ? 'R' : 'L'];
      const v = a[cfg.axes.vertical];
      const lat = a[cfg.axes.lateral] * (cfg.lateralSign[sample.hand] ?? 1);
      const mag = Math.hypot(a[0], a[1], a[2]);
      const agv = Array.isArray(sample.ag) && sample.ag.length === 3 && sample.ag.every(Number.isFinite) ? sample.ag : null;
      const ag = agv ? Math.hypot(...agv) : null;
      // world-up part of a: project onto gravity (ag - a); skipped in free fall, where gravity reads ~0
      const g = agv?.map((x, i) => x - a[i]);
      const gn = g ? Math.hypot(...g) : 0;
      const up = gn > 3 ? (a[0] * g[0] + a[1] * g[1] + a[2] * g[2]) / gn : 0;
      h.upPeak = Math.max(up, h.upPeak * 0.98); // debug readout: recent biggest push
      // each rise is judged against the bounce envelope from before it started, so a jump can't raise its own bar
      if (h.up <= 0 && up > 0) h.jumpBar = Math.max(cfg.jumpThreshold, cfg.jumpOverBounce * h.bounce);

      if (ag != null) h.fallSince = ag < cfg.freefallThreshold ? (h.fallSince ?? t) : null;
      if (t < gestureFreeAt) {
        h.bounce *= cfg.bounceDecay; // landing thumps (in the cooldown) stay out
      } else {
        // capped, so a jump's own push can't lift the bar for the next jump
        h.bounce = Math.max(Math.min(up, cfg.bounceCap), h.bounce * cfg.bounceDecay);
        if (cfg.motionLanes && crossed(h.lat, lat, cfg.swipeThreshold)) h.latSpike = { t, sign: Math.sign(lat) };
        if (h.up < h.jumpBar && up >= h.jumpBar) h.upSpike = { t, sign: 1 };
        if (pairs(h.upSpike, other.upSpike, t, cfg.jumpWindowMs)
            || (h.fallSince != null && other.fallSince != null && t - Math.max(h.fallSince, other.fallSince) >= cfg.freefallMs)) {
          jump = true;
          gesture(t, cfg.jumpCooldownMs);
        } else if (cfg.motionLanes && pairs(h.latSpike, other.latSpike, t, cfg.swipeWindowMs)) {
          laneDelta = /** @type {-1|1} */ (h.latSpike.sign);
          gesture(t);
        }
      }

      const swingPeak = h.swing.push(a, t, cfg.swingThreshold ?? 2.2, cfg.runMode === 'allAxes' && t >= stepsFreeAt);
      const exercisePeak = h.exercise.push(a, t, cfg.exerciseThreshold ?? 4.4,
        cfg.runMode === 'exercise' && t >= stepsFreeAt);
      h.history.push({ ts: t, level: h.swing.level, exercise:h.exercise.level });
      if (h.history.length > 200) h.history.shift();
      if (cfg.runMode === 'exercise') {
        if (exercisePeak && t - lastExerciseStep >= (cfg.exerciseMinGapMs ?? 240)) {
          if (t - lastExerciseStep > (cfg.exerciseMaxGapMs ?? 1100)) {
            exerciseBeats = []; exerciseReady = false; exerciseCadence.reset();
          }
          lastExerciseStep = t; h.stepCount++;
          exerciseBeats.push(t); if (exerciseBeats.length > 3) exerciseBeats.shift();
          if (exerciseReady) exerciseCadence.addStep(t);
          else if (exerciseBeats.length === 3) {
            const a = exerciseBeats[1] - exerciseBeats[0], b = exerciseBeats[2] - exerciseBeats[1];
            if (Math.max(a,b) / Math.min(a,b) <= (cfg.exerciseRhythmRatio ?? 2)) {
              exerciseBeats.forEach(time => exerciseCadence.addStep(time)); exerciseReady = true;
            } else { exerciseReady = false; exerciseCadence.reset(); exerciseBeats.shift(); }
          }
        }
      } else if (cfg.runMode === 'allAxes') {
        if (swingPeak && t - lastSwingStep >= (cfg.swingRefractoryMs ?? 160)) {
          lastSwingStep = t;
          h.stepCount++;
          cadence.addStep(t);
        }
      } else if (cfg.bounceSteps) {
        // both hands ride the same bounce: the first to rise counts the footstep, the other is inside the refractory
        if (t >= stepsFreeAt && h.up < cfg.bounceStepThreshold && up >= cfg.bounceStepThreshold
            && t - lastBounceStep >= cfg.bounceStepRefractoryMs) {
          lastBounceStep = t;
          cadence.addStep(t);
        }
      } else if (t >= stepsFreeAt && crossed(h.mag, mag, cfg.stepThreshold) && t - h.lastStep >= cfg.stepRefractoryMs
          && (cfg.stepSign === 0 || Math.sign(v) === cfg.stepSign)) {
        h.lastStep = t;
        if (++h.peaks % (cfg.stepSign === 0 ? cfg.stepEvery : 1) === 0) cadence.addStep(t);
      }
      h.mag = mag; h.lat = lat; h.up = up;
    },

    /** Debug readout: each hand's recent biggest upward push, m/s^2. */
    upPeaks() { return { L: hands.L.upPeak, R: hands.R.upPeak }; },
    levels(nowMs) {
      return Object.fromEntries(Object.entries(hands).map(([name, h]) => [name,
        { magnitude: nowMs - h.seen <= 500 ? (cfg.runMode === 'exercise' ? h.exercise.level : h.swing.level) : null,
          peak: nowMs - h.seen <= 500 ? (cfg.runMode === 'exercise' ? h.exercise.peak : h.swing.peak) : null, steps: h.stepCount }]));
    },
    exerciseStatus(now) {
      const fresh = now - lastExerciseStep <= (cfg.exerciseMaxGapMs ?? 1100);
      return { ready: fresh && exerciseReady, beats: fresh ? exerciseBeats.length : 0,
        stepsPerMinute: fresh && exerciseReady ? Math.round(exerciseCadence.rate(now) * 60) : 0 };
    },
    samplesSince(time) { return Object.values(hands).flatMap(h => h.history.filter(s => s.ts >= time).map(s => cfg.runMode === 'exercise' ? s.exercise : s.level)); },
    reset() {
      hands.L = hand(); hands.R = hand();
      gestureFreeAt = stepsFreeAt = lastBounceStep = lastSwingStep = -Infinity;
      laneDelta = 0; jump = false; cadence.reset();
      lastExerciseStep = exerciseHoldUntil = -Infinity; exerciseBeats = []; exerciseReady = false; exerciseCadence.reset();
    },

    /** @returns {import('./hub.js').InputFrame} lane and jump fire once */
    read(nowMs) {
      if (cfg.runMode === 'exercise' && nowMs - lastExerciseStep > (cfg.exerciseMaxGapMs ?? 1100) && nowMs > exerciseHoldUntil) {
        exerciseBeats = []; exerciseReady = false;
      }
      const source = cfg.runMode === 'exercise' ? exerciseCadence : cadence;
      const frame = { speed: source.speed(nowMs), laneDelta, jump, steps: source.takeSteps() };
      laneDelta = 0;
      jump = false;
      return frame;
    },
  };
}
