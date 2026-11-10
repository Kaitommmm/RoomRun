// Shophouse widths along a segment.

/**
 * Width of the next house given `rest` metres left in the segment (always >= 3).
 * A leftover under 3 m used to become a sliver house whose code-built windows
 * stuck into its neighbours and z-fought their glass, so the tail is shared out:
 * the last house takes all of a short remainder, or the last two split it.
 * @param {number} rest
 * @param {() => number} r
 */
export function houseWidth(rest, r) {
  const w = 4.2 + r() * 1.6;
  if (rest - w >= 3) return w;
  return rest <= 6 ? rest : rest / 2;
}
