// The HomeCenter mark: a rounded tile with a roofline, a check and a rise of ground.
// One geometry, drawn two ways: inline in the sidebar (colours come live from the
// theme's CSS variables) and as standalone SVG/PNG files for the favicon and the
// installed-app icon (colours resolved per theme in lib/brand-icon-colors.ts).

export type BrandColors = {
  /** The tile behind the mark. */
  tile: string
  /** Roof, wall and chimney. */
  glyph: string
  /** The check. */
  check: string
  /** The ground line under the house. */
  hill: string
  /** The theme's page background, for the app's splash screen. */
  background: string
}

export const BRAND_VIEWBOX = 512
export const BRAND_TILE_RADIUS = 116

/** Stroked paths and filled shapes, in 512 x 512 space. */
export const BRAND_SHAPES = {
  chimney: { x: 350, y: 98, width: 52, height: 82, rx: 8 },
  roof: "M 66 262 L 256 96 L 446 262",
  roofWidth: 40,
  wall: "M 112 280 L 112 394",
  wallWidth: 36,
  check: "M 188 328 L 242 382 L 338 274",
  checkWidth: 40,
  hill: "M 56 440 Q 256 358 456 440 Q 256 410 56 440 Z",
} as const

export type BrandShape = "rounded" | "square"

/**
 * A standalone SVG string. `square` has no rounded corners, for icons the
 * platform masks itself (iOS Home Screen, Android adaptive); `scale` shrinks the
 * mark inside the tile for those masks' safe zone.
 */
export function brandSvg(c: BrandColors, { shape = "rounded", scale = 1 }: { shape?: BrandShape; scale?: number } = {}): string {
  const s = BRAND_SHAPES
  const rx = shape === "rounded" ? BRAND_TILE_RADIUS : 0
  const mid = BRAND_VIEWBOX / 2
  const group = scale === 1 ? "" : ` transform="translate(${mid} ${mid}) scale(${scale}) translate(${-mid} ${-mid})"`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BRAND_VIEWBOX} ${BRAND_VIEWBOX}">` +
    `<rect width="${BRAND_VIEWBOX}" height="${BRAND_VIEWBOX}" rx="${rx}" fill="${c.tile}"/>` +
    `<g${group}>` +
    `<rect x="${s.chimney.x}" y="${s.chimney.y}" width="${s.chimney.width}" height="${s.chimney.height}" rx="${s.chimney.rx}" fill="${c.glyph}"/>` +
    `<path d="${s.roof}" fill="none" stroke="${c.glyph}" stroke-width="${s.roofWidth}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${s.wall}" fill="none" stroke="${c.glyph}" stroke-width="${s.wallWidth}" stroke-linecap="round"/>` +
    `<path d="${s.check}" fill="none" stroke="${c.check}" stroke-width="${s.checkWidth}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${s.hill}" fill="${c.hill}"/>` +
    `</g></svg>`
  )
}

export function brandSvgDataUri(c: BrandColors): string {
  return `data:image/svg+xml,${encodeURIComponent(brandSvg(c))}`
}
