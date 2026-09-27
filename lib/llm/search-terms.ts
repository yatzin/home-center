import { ENTITIES, ENTITY_KEYS, type EntityKey } from "./ontology"

// Models often search for a category ("vehicle", "people") rather than a name.
// Those words never appear in a name field, so they're pulled out as type
// filters: "vehicle" lists vehicles, "powertrain warranty" searches warranties
// for "powertrain".

const FILLER = new Set(["all", "any", "the", "my", "our", "and", "of", "for", "list", "show"])

const TYPE_WORDS = new Map<string, EntityKey>(
  ENTITY_KEYS.flatMap((key) =>
    [key, ENTITIES[key].label, ENTITIES[key].plural]
      .map((w) => w.toLowerCase())
      .filter((w) => !w.includes(" "))
      .map((w) => [w, key] as const)
  )
)

export function splitSearchQuery(query: string): { words: string[]; types: EntityKey[] } {
  const words: string[] = []
  const types: EntityKey[] = []
  for (const raw of query.toLowerCase().split(/\s+/)) {
    if (raw.length < 2 || FILLER.has(raw)) continue
    const type = TYPE_WORDS.get(raw)
    if (type) {
      if (!types.includes(type)) types.push(type)
    } else {
      words.push(raw)
    }
  }
  return { words: words.slice(0, 5), types }
}
