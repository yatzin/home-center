import { z } from "zod/v4"
import { ENTITY_KEYS } from "../ontology"
import { entityDef, OPS } from "../query"
import { aggregateRecords, findRecords, getRecord } from "../execute"
import { defineTool, FALLBACK_LABEL } from "./registry"

// The long tail: any entity, any declared field, through the ontology. The
// system prompt carries the data model these refer to.

const entity = z.string().describe(`Entity name. One of: ${ENTITY_KEYS.join(", ")}.`)

const filter = z.object({
  field: z.string().describe("A field, or relation.field one hop away, e.g. person.name, asset.name, property.name."),
  op: z.enum(OPS),
  value: z.unknown().optional().describe("Dates as YYYY-MM-DD. An array for 'in'. true/false for isNull."),
})

const plural = (raw: string) => {
  try {
    return entityDef(raw).def.plural
  } catch {
    return null
  }
}

export const findRecordsTool = defineTool({
  name: "find_records",
  description:
    "List rows of any entity with filters, sorting and related rows. Use for questions the shortcut tools don't cover. " +
    'Example: {"entity":"allergy","filters":[{"field":"substance","op":"contains","value":"penicillin"}],"include":["person"]}. ' +
    'Service records for one asset: {"entity":"serviceRecord","filters":[{"field":"asset.name","op":"contains","value":"Civic"}]}.',
  schema: z.object({
    entity,
    filters: z.array(filter).max(10).optional(),
    include: z.array(z.string()).max(6).optional().describe("Relation names to include, e.g. person, medications, serviceRecords."),
    fields: z.array(z.string()).max(30).optional().describe("Only these fields (id, name and links are always included)."),
    sort: z.object({ field: z.string(), dir: z.enum(["asc", "desc"]).optional() }).optional(),
    limit: z.coerce.number().int().optional().describe("Default 25, max 100."),
  }),
  label: (a) => {
    const p = plural(a.entity)
    return p ? `Looking up ${p}…` : FALLBACK_LABEL
  },
  run: (a, ctx) => findRecords(a, ctx),
})

export const getRecordTool = defineTool({
  name: "get_record",
  description: "Fetch one row by id with related rows, e.g. an equipment item with its serviceRecords and warranties, or a person with medications.",
  schema: z.object({
    entity,
    id: z.string().min(1),
    include: z.array(z.string()).max(8).optional(),
  }),
  label: (a) => {
    const p = plural(a.entity)
    return p ? `Opening ${p}…` : FALLBACK_LABEL
  },
  run: (a, ctx) => getRecord(a, ctx),
})

export const aggregateTool = defineTool({
  name: "aggregate",
  description:
    "Count, sum, average, min or max across rows, grouped by up to two fields, relations or date buckets (field:year, field:quarter, field:month). " +
    'Example — warranty count by asset: {"entity":"warranty","measure":{"op":"count"},"groupBy":["asset"]}. ' +
    "For spending prefer cost_summary.",
  schema: z.object({
    entity,
    measure: z.object({
      op: z.enum(["count", "sum", "avg", "min", "max"]),
      field: z.string().optional().describe("Numeric field; not needed for count."),
    }),
    groupBy: z.array(z.string()).max(2).optional(),
    filters: z.array(filter).max(10).optional(),
  }),
  label: (a) => {
    const p = plural(a.entity)
    return p ? `Totalling ${p}…` : FALLBACK_LABEL
  },
  run: (a, ctx) => aggregateRecords(a, ctx),
})
