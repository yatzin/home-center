// Runs card loaders (server only), each isolated: one failing card returns its
// own error result instead of failing the rest.
import type { CardInstance } from "./layout"
import { LOADERS, type CardResult, type LoaderContext } from "./loaders"

export async function loadCard(card: CardInstance, ctx: LoaderContext): Promise<CardResult> {
  const base = { id: card.id, type: card.type, config: card.config }
  try {
    return { ...base, status: "ok", data: await LOADERS[card.type](card.config, ctx) }
  } catch (error) {
    // One failing card must not take down the page: it renders its own error state.
    console.error(`[dashboard] card "${card.id}" (${card.type}) failed to load`, error)
    return { ...base, status: "error" }
  }
}
