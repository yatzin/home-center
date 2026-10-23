// Pixel metrics of the dashboard grid. Column counts come from lib/dashboard
// (LARGE_COLS, PHONE_COLS); these say how big one unit is on screen.

/** Height of one grid row. A 1-row card fits a number and its label. */
export const ROW_HEIGHT = 88
/** Space between cards, both directions. */
export const GAP = 16
/**
 * Canvas width (its own width, not the viewport's) at which the large layout
 * replaces the phone one: 40rem. Below it a 12-column cell would be under
 * ~40px. The `@min-[40rem]/dash:` classes in dashboard-canvas.tsx encode this
 * value; Tailwind needs it spelled out in the class names, so keep them in step.
 */
export const LARGE_MIN_WIDTH = 640
