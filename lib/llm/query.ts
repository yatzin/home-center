import { ENTITIES, ENTITY_KEYS, type EntityDef, type EntityKey, type FieldDef, type FieldType, type Row } from "./ontology"

// Compiles tool arguments into Prisma query fragments through the ontology.
// Pure: no Prisma import. Every name the model sends is checked against the
// ontology, and every rejection says what would have been valid so the model
// can correct itself within its rounds.

export class ToolInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ToolInputError"
  }
}

export const OPS = ["eq", "ne", "contains", "in", "gt", "gte", "lt", "lte", "isNull"] as const
export type Op = (typeof OPS)[number]
export type Filter = { field: string; op: Op; value?: unknown }
export type ToolContext = { userId: string; now: Date }

export const DEFAULT_LIMIT = 25
export const MAX_LIMIT = 100
export const CHILD_LIMIT = 50

const OPS_BY_TYPE: Record<FieldType, Op[]> = {
  string: ["eq", "ne", "contains", "in", "isNull"],
  int: ["eq", "ne", "gt", "gte", "lt", "lte", "isNull"],
  number: ["eq", "ne", "gt", "gte", "lt", "lte", "isNull"],
  money: ["eq", "ne", "gt", "gte", "lt", "lte", "isNull"],
  date: ["eq", "ne", "gt", "gte", "lt", "lte", "isNull"],
  boolean: ["eq"],
  enum: ["eq", "ne", "in"],
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "")

export function entityDef(raw: string): { key: EntityKey; def: EntityDef } {
  const n = norm(String(raw))
  const key = ENTITY_KEYS.find((k) => norm(k) === n || norm(ENTITIES[k].plural) === n)
  if (!key) throw new ToolInputError(`Unknown entity "${raw}". Valid entities: ${ENTITY_KEYS.join(", ")}.`)
  return { key, def: ENTITIES[key] }
}

function fieldDef(entity: EntityKey, name: string): FieldDef {
  const f = ENTITIES[entity].fields[name]
  if (!f) {
    throw new ToolInputError(`Unknown field "${name}" on ${entity}. Valid fields: ${Object.keys(ENTITIES[entity].fields).join(", ")}.`)
  }
  return f
}

function relationNames(entity: EntityKey) {
  return Object.keys(ENTITIES[entity].relations).join(", ") || "none"
}

export function requireDay(value: unknown, name: string): Date {
  const m = typeof value === "string" ? /^(\d{4}-\d{2}-\d{2})(?:T.*)?$/.exec(value.trim()) : null
  if (m) {
    const d = new Date(`${m[1]}T00:00:00.000Z`)
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === m[1]) return d
  }
  throw new ToolInputError(`${name} needs a date as YYYY-MM-DD (got ${JSON.stringify(value)}).`)
}

export function coerceValue(field: FieldDef, name: string, value: unknown): unknown {
  switch (field.type) {
    case "string":
      if (typeof value === "string" || typeof value === "number") return String(value)
      break
    case "int": {
      const n = typeof value === "string" ? Number(value.replace(/,/g, "")) : Number(value)
      if (value !== "" && value !== null && Number.isInteger(n)) return n
      break
    }
    case "number":
    case "money": {
      const n = typeof value === "string" ? Number(value.replace(/[$,\s]/g, "")) : Number(value)
      if (value !== "" && value !== null && Number.isFinite(n)) return n
      break
    }
    case "boolean":
      if (typeof value === "boolean") return value
      if (value === "true" || value === "false") return value === "true"
      break
    case "date":
      return requireDay(value, name)
    case "enum": {
      const v = String(value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_")
      if (field.values!.includes(v)) return v
      throw new ToolInputError(`${name} must be one of ${field.values!.join(", ")} (got ${JSON.stringify(value)}).`)
    }
  }
  throw new ToolInputError(`${name} expects a ${field.type} (got ${JSON.stringify(value)}).`)
}

function condition(field: FieldDef, name: string, op: Op, value: unknown): unknown {
  const allowed = OPS_BY_TYPE[field.type]
  if (!allowed.includes(op)) {
    throw new ToolInputError(`Operator "${op}" can't be used on ${name} (${field.type}). Allowed: ${allowed.join(", ")}.`)
  }
  switch (op) {
    case "isNull":
      return value === false || value === "false" ? { not: null } : null
    case "in":
      if (!Array.isArray(value) || value.length === 0) throw new ToolInputError(`"in" on ${name} needs a non-empty array.`)
      return { in: value.map((v) => coerceValue(field, name, v)) }
    case "eq":
      return { equals: coerceValue(field, name, value) }
    case "ne":
      return { not: coerceValue(field, name, value) }
    default:
      return { [op]: coerceValue(field, name, value) }
  }
}

export function compileWhere(
  entity: EntityKey,
  filters: Filter[] | undefined,
  ctx: ToolContext
): { where: Row; assetName: { op: Op; value: unknown } | null } {
  const def = ENTITIES[entity]
  const and: Row[] = []
  let assetName: { op: Op; value: unknown } | null = null

  for (const f of filters ?? []) {
    const [head, tail, ...rest] = String(f.field).split(".")
    if (rest.length) throw new ToolInputError(`Filters can follow one relation at most ("${f.field}").`)

    if (!tail) {
      and.push({ [head]: condition(fieldDef(entity, head), head, f.op, f.value) })
      continue
    }

    const rel = def.relations[head]
    if (!rel) throw new ToolInputError(`Unknown relation "${head}" on ${entity}. Relations: ${relationNames(entity)}.`)

    if (rel.kind === "asset") {
      if (tail !== "name") throw new ToolInputError(`Only asset.name can be filtered; use the assetType field for the kind of asset.`)
      if (!["eq", "contains", "in"].includes(f.op)) throw new ToolInputError(`asset.name supports eq, contains or in.`)
      assetName = { op: f.op, value: f.value }
      continue
    }
    if (rel.kind === "assetChildren") {
      throw new ToolInputError(`Can't filter ${entity} by ${head}; query ${rel.entity} with an asset.name filter instead.`)
    }

    const cond = { [tail]: condition(fieldDef(rel.entity, tail), `${head}.${tail}`, f.op, f.value) }
    and.push({ [head]: rel.kind === "many" ? { some: cond } : { is: cond } })
  }

  // Scope goes last and is ANDed, so nothing the model sends can widen it.
  if (def.scope) and.push(def.scope(ctx))
  return { where: and.length ? { AND: and } : {}, assetName }
}

export function compileSort(entity: EntityKey, sort?: { field: string; dir?: "asc" | "desc" }): Row {
  const def = ENTITIES[entity]
  if (!sort) return { [def.defaultSort.field]: def.defaultSort.dir }
  fieldDef(entity, sort.field)
  return { [sort.field]: sort.dir === "desc" ? "desc" : "asc" }
}

export function compileLimit(limit: unknown): number {
  const n = Math.floor(Number(limit))
  if (limit === undefined || limit === null || !Number.isFinite(n)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, n))
}

export function selectFor(entity: EntityKey, fields?: string[]): Row {
  const def = ENTITIES[entity]
  const chosen = fields?.length ? fields : Object.keys(def.fields)
  for (const f of chosen) fieldDef(entity, f)
  return Object.fromEntries(["id", def.nameField, ...def.keys, ...chosen].map((k) => [k, true]))
}

export function compileInclude(
  entity: EntityKey,
  include: string[] = [],
  fields?: string[]
): { select: Row; children: { relation: string; entity: EntityKey }[] } {
  const def = ENTITIES[entity]
  const select = selectFor(entity, fields)
  const children: { relation: string; entity: EntityKey }[] = []

  for (const name of include) {
    const rel = def.relations[name]
    if (!rel) throw new ToolInputError(`Unknown relation "${name}". Relations on ${entity}: ${relationNames(entity)}.`)
    if (rel.kind === "asset") continue // always attached for polymorphic rows
    if (rel.kind === "assetChildren") {
      children.push({ relation: name, entity: rel.entity })
      continue
    }
    select[name] =
      rel.kind === "one"
        ? { select: selectFor(rel.entity) }
        : { select: selectFor(rel.entity), orderBy: compileSort(rel.entity), take: CHILD_LIMIT }
  }
  return { select, children }
}
