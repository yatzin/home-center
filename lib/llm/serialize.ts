import { ENTITIES, type EntityKey, type Row } from "./ontology"

// Shapes database rows for the model: short dates, no nulls, a link on every
// row that has a page, and a hard size budget so a broad query can't blow a
// small model's context window.

export const RESULT_CHAR_BUDGET = 12_000

export function toDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function serializeValue(v: unknown): unknown {
  if (!(v instanceof Date)) return v
  const iso = v.toISOString()
  return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso.replace(/\.\d{3}Z$/, "Z")
}

export function compact(row: Row): Row {
  const out: Row = {}
  for (const [k, v] of Object.entries(row)) if (v !== null && v !== undefined) out[k] = serializeValue(v)
  return out
}

export function serializeRow(entity: EntityKey, row: Row): Row {
  const def = ENTITIES[entity]
  const out: Row = {}
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) continue
    const rel = def.relations[k]
    if (!rel || rel.kind === "asset") {
      out[k] = rel ? v : serializeValue(v)
      continue
    }
    out[k] = Array.isArray(v) ? v.map((r) => serializeRow(rel.entity, r as Row)) : serializeRow(rel.entity, v as Row)
  }
  const href = def.href?.(row)
  if (href) out.href = href
  return out
}

export function toToolContent(result: unknown, budget: number = RESULT_CHAR_BUDGET): string {
  let json = JSON.stringify(result) ?? "null"
  if (json.length <= budget) return json

  const r = result as Row & { rows?: unknown[] }
  if (Array.isArray(r?.rows) && r.rows.length > 1) {
    const all = r.rows
    let rows = all
    while (rows.length > 1 && json.length > budget) {
      rows = rows.slice(0, Math.floor(rows.length * 0.75))
      json = JSON.stringify({
        ...r,
        rows,
        truncated: true,
        note: `Showing ${rows.length} of ${all.length} rows — narrow the filters or ask for fewer fields.`,
      })
    }
    if (json.length <= budget) return json
  }
  return `${json.slice(0, budget)}…[truncated: result too large — narrow the request]`
}
