import type { ReportData } from "@/lib/report-server"
import type { Row } from "./ontology"
import { inDayRange } from "./query"
import { compact, toDay } from "./serialize"

// One chronological history for an asset or person, built from the same data
// the printable report uses.

export type TimelineEvent = { date: string; kind: string; title: string } & Row

export function buildTimeline(report: ReportData, range: { from?: Date | null; to?: Date | null } = {}): TimelineEvent[] {
  const events: (TimelineEvent & { at: number })[] = []
  const add = (when: Date | null | undefined, kind: string, title: string, extra: Row = {}) => {
    if (!when) return
    if (!inDayRange(new Date(when), range)) return
    const at = new Date(when).getTime()
    events.push({ at, date: toDay(new Date(when)), kind, title, ...compact(extra) })
  }

  for (const s of report.services) {
    add(s.date, "service", s.title, { vendor: s.vendor, cost: s.cost, category: s.category, meter: s.mileageAtService })
  }
  for (const w of report.warranties) {
    add(w.purchaseDate, "warranty_start", w.productName)
    add(w.expirationDate, "warranty_expires", w.productName)
  }
  for (const m of report.schedules) add(m.lastCompletedDate, "maintenance_completed", m.title)

  const person = report.health?.person
  if (person) {
    for (const c of person.conditions) {
      add(c.diagnosedDate, "condition_diagnosed", c.name)
      add(c.resolvedDate, "condition_resolved", c.name)
    }
    for (const i of person.immunizations) add(i.dateGiven, "immunization", i.vaccine, { dose: i.dose })
    for (const m of person.medications) {
      add(m.startDate, "medication_started", m.name, { dosage: m.dosage })
      add(m.endDate, "medication_ended", m.name)
    }
  }

  return events
    .sort((a, b) => a.at - b.at)
    .map((e) => {
      const { at, ...rest } = e
      void at
      return rest
    })
}
