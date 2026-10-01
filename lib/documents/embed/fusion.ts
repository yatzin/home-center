import type { Hit } from "../index-db"

// Keyword (BM25) and vector scores aren't comparable, so the lists are merged
// by rank instead: each list gives a chunk 1 / (k + rank). A chunk both
// searches found beats the top of either list alone, and exact model-number
// matches still rank high through the keyword list.

export const RRF_K = 60

/** Lists best-first in, best-first out; score = −fused so lower is better, as everywhere else. */
export function fuse(lists: Hit[][], limit: number, k: number = RRF_K): Hit[] {
  const merged = new Map<number, { hit: Hit; score: number }>()
  for (const list of lists) {
    list.forEach((hit, rank) => {
      const add = 1 / (k + rank + 1)
      const seen = merged.get(hit.chunkId)
      if (seen) seen.score += add
      else merged.set(hit.chunkId, { hit, score: add })
    })
  }
  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ hit, score }) => ({ ...hit, score: -score }))
}
