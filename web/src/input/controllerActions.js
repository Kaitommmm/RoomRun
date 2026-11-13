// Context routing for a debounced small-button edge. Never start from L.
export function smallButtonAction({ hand, blocked = false, phase, picking = false, sticksLost = false, paused = false, jumpInput = 'flick' }) {
  if (blocked || !['L', 'R'].includes(hand)) return null;
  if (hand === 'L') return phase === 'caught' ? null : 'pause';
  if (sticksLost) return null;
  if (hand === 'R' && phase === 'running' && !paused && jumpInput === 'button') return 'jump';
  return phase === 'caught' && picking ? 'sign' : 'start';
}

// Main-button edges are commands while paused, and lanes while playing.
export function mainButtonAction({ hand, paused = false, phase, blocked = false, sticksLost = false }) {
  if (!['L', 'R'].includes(hand) || blocked) return 'ignore';
  if (!paused) return 'lane';
  if (hand === 'L' && phase === 'running') return 'menu';
  return hand === 'R' && phase === 'running' && !sticksLost ? 'restart' : 'ignore';
}
