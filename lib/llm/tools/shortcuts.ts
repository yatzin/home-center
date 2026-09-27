import { z } from "zod/v4"
import { prisma } from "@/lib/prisma"
import { loadAssetIndex } from "@/lib/assets-server"
import { assetHref } from "@/lib/assets"
import { loadReport } from "@/lib/report-server"
import { loadCostRecords } from "@/lib/costs-server"
import { cents, sum } from "@/lib/costs"
import { scheduleDue } from "@/lib/maintenance-due"
import { loadVehicleMileage } from "@/lib/maintenance-due-server"
import {
  daysUntil, HEALTH_WINDOWS, immunizationDue, insuranceExpiring, isSupersededImmunization, refillDue,
} from "@/lib/health"
import type { AssetType, ServiceCategory } from "@/app/generated/prisma/client"
import { ENTITIES, type EntityKey, type Row } from "../ontology"
import { coerceValue, entityDef, inDayRange, requireDay, selectFor, ToolInputError } from "../query"
import { compact, serializeRow, toDay } from "../serialize"
import { aggregateRows, groupSpec, measureSpec } from "../aggregate"
import { assetRef, attachAssets, delegate } from "../execute"
import { buildTimeline, type TimelineEvent } from "../timeline"
import { rollUpToProperty } from "../cost-rollup"
import { splitSearchQuery } from "../search-terms"
import { resolveAssetId } from "../asset-ids"
import { defineTool } from "./registry"

// Curated tools for the questions people ask most. Narrow arguments so small
// models call them reliably, and each reuses the logic behind the matching page
// so answers agree with what the app shows.

const assetTypeField = ENTITIES.serviceRecord.fields.assetType
const toAssetType = (v: string) => coerceValue(assetTypeField, "assetType", v) as AssetType
const optionalDay = (v: string | undefined, name: string) => (v ? requireDay(v, name) : null)
/** Stored dates go to the model as YYYY-MM-DD even when the value has a non-midnight time. */
const dayOrNull = (d: Date | null | undefined) => (d ? toDay(d) : null)

const SEARCHABLE: EntityKey[] = [
  "property", "vehicle", "equipment", "person", "provider", "insurancePolicy", "healthCondition",
  "medication", "allergy", "immunization", "warranty", "maintenanceSchedule", "serviceRecord",
]

export const searchTool = defineTool({
  name: "search",
  description:
    "Find records by name anywhere in the household data — assets, people, providers, insurance, conditions, medications, allergies, vaccines, warranties, maintenance, service records. " +
    "Use it first to turn a name into an id and link. Every word must match (in any searchable field). " +
    "A type word lists that type: 'vehicles' lists vehicles, 'powertrain warranty' searches warranties.",
  schema: z.object({
    query: z.string().min(1).describe("Words to look for, e.g. 'civic' or 'furnace filter'."),
    entities: z.array(z.string()).optional().describe("Only search these entities."),
  }),
  label: (a) => `Searching for “${a.query}”…`,
  async run({ query, entities }, ctx) {
    const { words, types } = splitSearchQuery(query)
    if (!words.length && !types.length) throw new ToolInputError("Search needs at least one word of two or more characters.")
    const keys = types.length ? types : entities?.length ? entities.map((e) => entityDef(e).key) : SEARCHABLE
    const index = await loadAssetIndex()
    const found = await Promise.all(
      keys.map(async (key) => {
        const def = ENTITIES[key]
        const where = {
          AND: [
            ...words.map((w) => ({ OR: def.searchFields.map((f) => ({ [f]: { contains: w } })) })),
            ...(def.scope ? [def.scope(ctx)] : []),
          ],
        }
        // No name words means "list this type", so allow a fuller page.
        const rows = await delegate(key).findMany({ where, select: selectFor(key), take: words.length ? 10 : 25 })
        if (def.polymorphic) attachAssets(index, rows)
        return rows.map((r) => ({ entity: key, ...serializeRow(key, r) }))
      })
    )
    const rows = found.flat()
    return {
      query,
      total: rows.length,
      rows,
      // An empty search reads to weak models as "nothing exists"; say where else to look.
      ...(rows.length
        ? {}
        : { note: "No names matched. This does not mean there are none: for spending use cost_summary, to list a type use find_records." }),
    }
  },
})

const COST_GROUPS = {
  asset: "asset", year: "date:year", quarter: "date:quarter", month: "date:month", category: "category", vendor: "vendor",
} as const

export const costSummaryTool = defineTool({
  name: "cost_summary",
  description:
    "Total spending from service records (repairs, maintenance, medical visits), grouped by asset, year, quarter, month, category or vendor. " +
    "Use it for 'how much did we spend', comparisons between assets or people, and year-over-year questions. People are assets (assetType PERSON). " +
    "A property's spending includes the equipment installed there.",
  schema: z.object({
    groupBy: z.array(z.enum(["asset", "year", "quarter", "month", "category", "vendor"])).min(1).max(2),
    assetType: z.string().optional().describe("PROPERTY, VEHICLE, EQUIPMENT or PERSON."),
    assetIds: z.array(z.string()).max(20).optional().describe("Only these assets or people (ids from search)."),
    from: z.string().optional().describe("YYYY-MM-DD, inclusive."),
    to: z.string().optional().describe("YYYY-MM-DD, inclusive."),
    category: z.string().optional().describe("A service category, e.g. REPAIR, ROUTINE, OFFICE_VISIT."),
  }),
  label: () => "Adding up costs…",
  async run(a) {
    const assetType = a.assetType ? toAssetType(a.assetType) : undefined
    const from = optionalDay(a.from, "from")
    const to = optionalDay(a.to, "to")
    const category = a.category
      ? (coerceValue(ENTITIES.serviceRecord.fields.category, "category", a.category) as ServiceCategory)
      : null

    const [records, index, installed] = await Promise.all([
      loadCostRecords(),
      loadAssetIndex(),
      prisma.equipment.findMany({ where: { propertyId: { not: null } }, select: { id: true, propertyId: true } }),
    ])
    const assetIds = a.assetIds?.map((id) => resolveAssetId(index.names, id, assetType ? [assetType] : undefined))
    // Equipment spending counts toward its property whenever properties are what's being asked about.
    const wanted = assetIds?.length ? new Set(assetIds) : null
    const rolled = rollUpToProperty(
      records,
      new Map(installed.map((e) => [e.id, e.propertyId!])),
      (propertyId) => (wanted ? wanted.has(propertyId) : assetType === "PROPERTY")
    )
    const rows: Row[] = rolled
      .filter(
        (r) =>
          (!assetType || r.assetType === assetType) &&
          inDayRange(r.date, { from, to }) &&
          (!category || r.category === category) &&
          (!assetIds?.length || assetIds.includes(r.assetId))
      )
      .map((r) => ({ ...r }))
    attachAssets(index, rows)

    return {
      currency: "USD",
      ...(rows.some((r) => r.viaEquipmentId) ? { note: "Property totals include spending on equipment at the property." } : {}),
      ...aggregateRows(
        rows,
        measureSpec("serviceRecord", { op: "sum", field: "cost" }),
        a.groupBy.map((g) => groupSpec("serviceRecord", COST_GROUPS[g]))
      ),
    }
  },
})

export const assetHistoryTool = defineTool({
  name: "asset_history",
  description:
    "Full chronological history of one property, vehicle, equipment item or person: service records with costs, warranty start/expiry, maintenance completed, " +
    "and for people conditions, medications and immunizations. Get the id from search first.",
  schema: z.object({
    assetType: z.string().describe("PROPERTY, VEHICLE, EQUIPMENT or PERSON."),
    assetId: z.string().min(1),
    from: z.string().optional().describe("YYYY-MM-DD, inclusive."),
    to: z.string().optional().describe("YYYY-MM-DD, inclusive."),
  }),
  label: () => "Reading the history…",
  async run(a) {
    const type = toAssetType(a.assetType)
    const report = await loadReport(type, a.assetId)
    if (!report) throw new ToolInputError(`No ${type.toLowerCase()} with id "${a.assetId}". Use search to find the id.`)
    const range = { from: optionalDay(a.from, "from"), to: optionalDay(a.to, "to") }

    // A property's history and spending include the equipment installed there.
    const equipment = type === "PROPERTY"
      ? await prisma.equipment.findMany({ where: { propertyId: a.assetId }, select: { id: true, name: true } })
      : []
    const equipmentName = new Map(equipment.map((e) => [e.id, e.name]))
    const equipmentServices = equipment.length
      ? await prisma.serviceRecord.findMany({ where: { assetType: "EQUIPMENT", assetId: { in: [...equipmentName.keys()] } } })
      : []
    const equipmentEvents: TimelineEvent[] = equipmentServices
      .filter((s) => inDayRange(s.date, range))
      .map((s) => ({
        date: toDay(s.date),
        kind: "service",
        title: s.title,
        ...compact({ equipment: equipmentName.get(s.assetId), vendor: s.vendor, cost: s.cost, category: s.category }),
      }))

    return {
      asset: compact({ type, id: a.assetId, name: report.asset.name, subtitle: report.asset.subtitle, href: assetHref(type, a.assetId) }),
      totalCost: cents(sum(report.costRows) + equipmentServices.reduce((total, s) => total + (s.cost ?? 0), 0)),
      ...(equipment.length ? { note: "Includes service on equipment at this property." } : {}),
      rows: [...buildTimeline(report, range), ...equipmentEvents].sort((x, y) => x.date.localeCompare(y.date)),
    }
  },
})

export const maintenanceStatusTool = defineTool({
  name: "maintenance_status",
  description:
    "Maintenance and checkup schedules with their due state (overdue, due_soon, ok), including mileage/hour-based due for vehicles. " +
    "Use for 'what's due', 'what's overdue', 'when is the next oil change'.",
  schema: z.object({
    status: z.enum(["overdue", "due_soon", "all"]).optional().describe("Default all."),
    assetType: z.string().optional(),
    assetId: z.string().optional(),
    withinDays: z.coerce.number().int().min(0).max(3650).optional().describe("Only items overdue or due within this many days."),
  }),
  label: () => "Checking maintenance…",
  async run(a, ctx) {
    const assetType = a.assetType ? toAssetType(a.assetType) : undefined
    const index = await loadAssetIndex()
    const assetId = a.assetId ? resolveAssetId(index.names, a.assetId, assetType ? [assetType] : undefined) : undefined
    const [schedules, mileage] = await Promise.all([
      prisma.maintenanceSchedule.findMany({
        where: { isActive: true, ...(assetType ? { assetType } : {}), ...(assetId ? { assetId } : {}) },
        orderBy: { nextDueDate: "asc" },
      }),
      loadVehicleMileage(),
    ])
    const status = a.status ?? "all"
    const rows = schedules
      .map((s) => {
        const due = scheduleDue(s, mileage, ctx.now)
        return { s, due, state: due.overdue ? "overdue" : due.dueSoon ? "due_soon" : "ok" }
      })
      .filter(({ state }) => status === "all" || state === status)
      .filter(
        ({ due, state }) =>
          a.withinDays == null ||
          state === "overdue" ||
          // Mileage-only schedules have no daysLeft; their due_soon state is the best "within" signal.
          (due.daysLeft == null ? state === "due_soon" : due.daysLeft <= a.withinDays)
      )
      .map(({ s, due, state }) =>
        compact({
          id: s.id,
          title: s.title,
          state,
          asset: assetRef(index, s.assetType, s.assetId),
          nextDueDate: dayOrNull(s.nextDueDate),
          nextDueMeter: s.nextDueMileage,
          daysLeft: due.daysLeft,
          meterLeft: due.milesLeft,
          meterUnit: due.meterUnit,
          lastCompletedDate: dayOrNull(s.lastCompletedDate),
          intervalDays: s.intervalDays,
          intervalMeter: s.intervalMiles,
          href: assetHref(s.assetType, s.assetId),
        })
      )
    return { asOf: toDay(ctx.now), total: rows.length, rows }
  },
})

const personRef = (p: { id: string; name: string }) => ({ id: p.id, name: p.name, href: assetHref("PERSON", p.id) })

export const healthAlertsTool = defineTool({
  name: "health_alerts",
  description:
    `Health items needing attention: medication refills due within ${HEALTH_WINDOWS.refillDays} days, immunizations due within ${HEALTH_WINDOWS.immunizationDays} days, ` +
    `insurance expiring within ${HEALTH_WINDOWS.insuranceDays} days. Optionally for one person.`,
  schema: z.object({ personId: z.string().optional() }),
  label: () => "Checking health reminders…",
  async run(a, ctx) {
    const personId = a.personId ? resolveAssetId((await loadAssetIndex()).names, a.personId, ["PERSON"]) : undefined
    const byPerson = personId ? { personId } : {}
    const person = { select: { id: true, name: true } } as const
    const [meds, imms, policies] = await Promise.all([
      prisma.medication.findMany({ where: { ...byPerson, nextRefillDate: { not: null } }, include: { person } }),
      prisma.immunization.findMany({ where: byPerson, include: { person } }),
      prisma.insurancePolicy.findMany({
        where: { endDate: { not: null }, ...(personId ? { members: { some: { id: personId } } } : {}) },
        include: { members: person },
      }),
    ])
    return {
      asOf: toDay(ctx.now),
      refillsDue: meds
        .filter((m) => refillDue(m, ctx.now))
        .map((m) => compact({ id: m.id, medication: m.name, dosage: m.dosage, pharmacy: m.pharmacy, nextRefillDate: dayOrNull(m.nextRefillDate), daysUntil: daysUntil(m.nextRefillDate!, ctx.now), person: personRef(m.person) })),
      immunizationsDue: imms
        .filter((i) => immunizationDue(i, ctx.now) && !isSupersededImmunization(i, imms))
        .map((i) => compact({ id: i.id, vaccine: i.vaccine, nextDueDate: dayOrNull(i.nextDueDate), daysUntil: daysUntil(i.nextDueDate!, ctx.now), person: personRef(i.person) })),
      insuranceExpiring: policies
        .filter((p) => insuranceExpiring(p, ctx.now))
        .map((p) => compact({ id: p.id, carrier: p.carrier, planName: p.planName, kind: p.kind, endDate: dayOrNull(p.endDate), daysUntil: daysUntil(p.endDate!, ctx.now), members: p.members.map(personRef), href: "/insurance" })),
    }
  },
})
