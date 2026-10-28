import type { Size } from "@/lib/dashboard/grid"
import type { LayoutMode } from "@/components/dashboard/canvas/use-card-tier"

/**
 * What every card view receives. Views choose their content from `tier` (and
 * fill their cell with CSS); `size` and `mode` describe the layout the tier was
 * picked for. When the phone and large layouts give the same tier, the canvas
 * renders the view once with the large size and mode.
 */
export type CardViewProps = {
  data: unknown
  config: Record<string, unknown>
  tier: number
  size: Size
  mode: LayoutMode
  editing: boolean
}
