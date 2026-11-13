// Session commands are independent of the motion detector and game physics.
// Pausing preserves the run; start on a running game resumes without resetting it.
export function createRunControls({ getPhase, onStart, onPause, onResume, onMenu = () => {}, onChange = () => {} }) {
  let paused = false, waitingForMotion = false;
  const changed = () => onChange({ paused, waitingForMotion });
  function start() {
    if (getPhase() !== 'running') {
      paused = false; waitingForMotion = true;
      onStart(); changed(); return 'start';
    }
    if (!paused) return null;
    paused = false; waitingForMotion = true;
    onResume(); changed(); return 'resume';
  }
  function pause() {
    if (paused || getPhase() === 'caught') return null;
    paused = true; waitingForMotion = false;
    onPause(); changed(); return 'pause';
  }
  return {
    start, pause,
    menu() {
      if (!paused) return null;
      paused = false; waitingForMotion = false;
      onMenu(); changed(); return 'menu';
    },
    press(hand) { return hand === 'L' ? pause() : hand === 'R' ? start() : null; },
    restart() {
      paused = false; waitingForMotion = true;
      onStart(); changed(); return 'start';
    },
    canAdvance(speed, minimum = 0.2) {
      if (paused) return false;
      if (waitingForMotion) {
        if (!Number.isFinite(speed) || speed < minimum) return false;
        waitingForMotion = false; changed();
      }
      return true;
    },
    get paused() { return paused; },
    get waitingForMotion() { return waitingForMotion; },
  };
}
