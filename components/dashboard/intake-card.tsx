import Link from "next/link"
import { AlertTriangle, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { InboxDropZone } from "@/components/inbox/inbox-drop-zone"
import { IntakeTip } from "@/components/dashboard/intake-tip"
import { getFormat } from "@/lib/regional-server"
import type { Formatter } from "@/lib/regional"
import { inboxHeadline, inboxReadiness, readFields } from "@/lib/inbox-form"
import { CHIP } from "./intake-chip"
import { intakeSummary } from "@/lib/intake-ui"
import type { InboxListItem } from "@/lib/inbox-server"

export function headlineOf(item: InboxListItem, householdNames: string[], fmt: Formatter) {
  const first = item.attachments[0]
  const fileName = first ? (item.attachments.length > 1 ? `${first.originalName} +${item.attachments.length - 1}` : first.originalName) : "Uploading…"
  const fields = readFields(item, householdNames)
  return inboxHeadline(
    {
      total: item.parsedTotal != null ? fmt.money(item.parsedTotal) : null,
      vendor: fields.vendor.state === "found" ? item.parsedVendor : null,
      date: item.parsedDate ? fmt.date(item.parsedDate, { utc: true }) : null,
    },
    fileName
  )
}

/** Dashboard card: what's waiting in Intake, and a place to drop more. */
export async function IntakeCard({ items, householdNames }: { items: InboxListItem[]; householdNames: string[] }) {
  const fmt = await getFormat()
  const { count, newest } = intakeSummary(items)
  return (
    <Card className="py-5">
      <CardHeader className="px-5 pb-1">
        <CardTitle className="flex items-center justify-between text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
          Intake
          <Link
            href="/intake"
            className="rounded-md px-2 py-1 text-xs font-medium normal-case tracking-normal text-muted-foreground transition-colors duration-150 hover:bg-primary/10 hover:text-primary"
          >
            View all →
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-5">
        {count === 0 ? (
          <p className="text-sm text-muted-foreground">Drop receipts, invoices and manuals here.</p>
        ) : (
          <div>
            <p className="px-2 text-sm font-medium">{count} to review</p>
            <ul className="mt-1 space-y-0.5">
              {newest.map((item) => {
                const readiness = inboxReadiness(item, householdNames)
                const chip = CHIP[readiness]
                return (
                  <li key={item.id}>
                    <Link
                      href="/intake"
                      className="flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors duration-150 hover:bg-muted/60"
                    >
                      <span className="min-w-0 flex-1 truncate">{headlineOf(item, householdNames, fmt)}</span>
                      <Badge className={`h-5 shrink-0 px-1.5 text-[11px] ${chip.className}`}>
                        {readiness === "reading" && <Loader2 className="animate-spin" />}
                        {readiness === "failed" && <AlertTriangle />}
                        {chip.label}
                      </Badge>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
        <InboxDropZone variant="compact" />
        <IntakeTip />
      </CardContent>
    </Card>
  )
}
