import { BRAND_SHAPES, BRAND_TILE_RADIUS, BRAND_VIEWBOX } from "@/lib/brand-icon"

/**
 * The HomeCenter mark, coloured by the active theme. The colours are CSS
 * variables (app/brand-icon.css), so it changes with the theme without any script
 * and matches the favicon and installed-app icon built from the same palettes.
 */
export function BrandIcon({ className }: { className?: string }) {
  const s = BRAND_SHAPES
  return (
    <svg viewBox={`0 0 ${BRAND_VIEWBOX} ${BRAND_VIEWBOX}`} className={className} aria-hidden="true" focusable="false">
      <rect width={BRAND_VIEWBOX} height={BRAND_VIEWBOX} rx={BRAND_TILE_RADIUS} style={{ fill: "var(--brand-tile)" }} />
      <rect x={s.chimney.x} y={s.chimney.y} width={s.chimney.width} height={s.chimney.height} rx={s.chimney.rx} style={{ fill: "var(--brand-glyph)" }} />
      <path d={s.roof} fill="none" strokeWidth={s.roofWidth} strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--brand-glyph)" }} />
      <path d={s.wall} fill="none" strokeWidth={s.wallWidth} strokeLinecap="round" style={{ stroke: "var(--brand-glyph)" }} />
      <path d={s.check} fill="none" strokeWidth={s.checkWidth} strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--brand-check)" }} />
      <path d={s.hill} style={{ fill: "var(--brand-hill)" }} />
    </svg>
  )
}
