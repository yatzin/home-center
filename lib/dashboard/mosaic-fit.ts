// How many square-ish thumbnails fit an asset card's photo mosaic, and how
// they are laid out. Pure, so the sizing rules are testable without a browser.

export const MOSAIC_MIN_TILE = 72
export const MOSAIC_GAP = 2

export type MosaicFit = {
  cols: number
  rows: number
  /** Thumbnails to render (at most the loaded items). */
  visible: number
  /** Items not shown: everything beyond `visible`, including unloaded ones. */
  hidden: number
  /** Columns the last tile spans, so a short last row still fills the box. */
  lastSpan: number
}

function size(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function mosaicFit(args: {
  width: number
  height: number
  itemCount: number
  total: number
  minTile?: number
  gap?: number
}): MosaicFit {
  const minTile = Math.max(1, size(args.minTile ?? MOSAIC_MIN_TILE))
  const gap = size(args.gap ?? MOSAIC_GAP)
  const width = size(args.width)
  const height = size(args.height)
  const itemCount = Math.max(0, Math.floor(size(args.itemCount)))
  const total = Math.max(0, Math.floor(size(args.total)))

  const maxCols = Math.max(1, Math.floor((width + gap) / (minTile + gap)))
  const maxRows = Math.max(1, Math.floor((height + gap) / (minTile + gap)))
  const visible = Math.min(itemCount, maxCols * maxRows)
  const hidden = Math.max(0, total - visible)
  if (visible <= 1) return { cols: 1, rows: 1, visible, hidden, lastSpan: 1 }

  // Fewer items than cells: pick the grid whose tiles are closest to square
  // (then with the fewest empty cells), so tiles grow to fill the box.
  let best = { cols: maxCols, rows: maxRows, score: Infinity }
  for (let rows = 1; rows <= maxRows; rows++) {
    const cols = Math.ceil(visible / rows)
    if (cols > maxCols) continue
    // A row with no tile in it would leave the box partly blank.
    if ((rows - 1) * cols >= visible) continue
    const aspect = width > 0 && height > 0 ? width / cols / (height / rows) : 1
    const score = Math.abs(Math.log(aspect)) + (0.5 * (cols * rows - visible)) / (cols * rows)
    if (score < best.score) best = { cols, rows, score }
  }
  const lastSpan = best.cols - ((visible - 1) % best.cols)
  return { cols: best.cols, rows: best.rows, visible, hidden, lastSpan }
}
