// Pixel metrics of the dashboard grid. Column counts come from lib/dashboard
// (LARGE_COLS, PHONE_COLS); these say how big one unit is on screen.

/** Height of one grid row. A 1-row card fits a number and its label. */
export const ROW_HEIGHT = 88
/** Space between cards, both directions. */
export const GAP = 16
/**
 * Width at which the large layout replaces the phone one. Matches Tailwind's
 * `md` breakpoint, so `md:` utilities switch at the same point.
 */
export const LARGE_MIN_WIDTH = 768
