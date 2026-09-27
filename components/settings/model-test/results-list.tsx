"use client"

import { useState, type ReactNode } from "react"
import { CheckCircle2, ChevronDown, Circle, Loader2, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { Stage } from "@/lib/llm/model-test/types"
import { formatSeconds } from "./summary"
import type { CaseRunState, ModelTestCatalogEntry } from "./types"
import type { StageInfo } from "./use-model-test"

// Renders the fixed set of selected cases (× repeat) as pending rows, filling
// in real status as `results` events arrive. The list never has to know
// whether a run is in progress — it just reflects whatever is in `results`.

const SLOW_MS = 30_000

type Row = CaseRunState & { case: ModelTestCatalogEntry }
type FilterValue = "all" | "failed" | Stage

export function ResultsList({
  catalog,
  stages,
  repeat,
  results,
}: {
  /** Only the currently-selected cases, in catalog order. */
  catalog: ModelTestCatalogEntry[]
  stages: StageInfo[]
  repeat: number
  results: Record<string, CaseRunState>
}) {
  const [filter, setFilter] = useState<FilterValue>("all")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (!catalog.length) {
    return <p className="text-sm text-muted-foreground">No tests selected — check at least one group below.</p>
  }

  const rowsByStage = new Map<Stage, Row[]>()
  for (const c of catalog) {
    const rows: Row[] = []
    for (let rep = 0; rep < repeat; rep++) {
      const key = `${c.id}#${rep}`
      const state: CaseRunState = results[key] ?? { key, id: c.id, rep, status: "pending" }
      rows.push({ ...state, case: c })
    }
    rowsByStage.set(c.stage, [...(rowsByStage.get(c.stage) ?? []), ...rows])
  }

  const matchesFilter = (r: Row) => (filter === "all" ? true : filter === "failed" ? r.status === "fail" : r.case.stage === filter)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          All
        </FilterChip>
        <FilterChip active={filter === "failed"} onClick={() => setFilter("failed")}>
          Failed only
        </FilterChip>
        {stages.map((s) => (
          <FilterChip key={s.id} active={filter === s.id} onClick={() => setFilter(s.id)}>
            {s.label}
          </FilterChip>
        ))}
      </div>

      {stages.map((stage) => {
        const all = rowsByStage.get(stage.id) ?? []
        const rows = all.filter(matchesFilter)
        if (!rows.length) return null
        const passed = all.filter((r) => r.status === "pass").length
        return (
          <section key={stage.id} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <div>
                <h3 className="text-sm font-semibold">{stage.label}</h3>
                <p className="text-xs text-muted-foreground">{stage.description}</p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {passed}/{all.length} passed
              </span>
            </div>
            <div className="divide-y divide-border rounded-lg border border-border/60">
              {rows.map((row) => (
                <ResultRow key={row.key} row={row} repeat={repeat} expanded={expanded.has(row.key)} onToggle={() => toggle(row.key)} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}

function StatusIcon({ status }: { status: CaseRunState["status"] }) {
  if (status === "pass") return <CheckCircle2 className="size-4 shrink-0 text-green-600 dark:text-green-400" />
  if (status === "fail") return <XCircle className="size-4 shrink-0 text-destructive" />
  if (status === "running") return <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
  return <Circle className="size-4 shrink-0 text-muted-foreground/40" />
}

function ResultRow({ row, repeat, expanded, onToggle }: { row: Row; repeat: number; expanded: boolean; onToggle: () => void }) {
  const slow = typeof row.ms === "number" && row.ms > SLOW_MS
  const canExpand = row.status === "pass" || row.status === "fail"

  return (
    <div>
      <button
        type="button"
        onClick={canExpand ? onToggle : undefined}
        disabled={!canExpand}
        className={cn(
          "flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors",
          canExpand ? "hover:bg-muted/60" : "cursor-default"
        )}
      >
        <StatusIcon status={row.status} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium">
              {row.case.title}
              {repeat > 1 && <span className="font-normal text-muted-foreground"> — Run {row.rep + 1}</span>}
            </span>
            <Badge variant="outline" className="text-[0.65rem]">
              {row.case.category}
            </Badge>
          </div>
          {row.reason && (
            <p className={cn("mt-0.5 text-xs", row.status === "fail" ? "text-destructive" : "text-muted-foreground")}>{row.reason}</p>
          )}
        </div>
        {typeof row.ms === "number" && (
          <span
            className={cn(
              "shrink-0 pt-0.5 text-xs tabular-nums",
              slow ? "font-semibold text-amber-600 dark:text-amber-400" : "text-muted-foreground"
            )}
          >
            {formatSeconds(row.ms)}
          </span>
        )}
        {canExpand && (
          <ChevronDown className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
        )}
      </button>
      {expanded && canExpand && (
        <div className="space-y-2.5 border-t border-border/60 bg-muted/30 px-3 py-2.5 text-xs">
          <div>
            <p className="font-medium text-muted-foreground">Question</p>
            <p className="whitespace-pre-wrap">{row.case.question}</p>
          </div>
          {!!row.toolCalls?.length && (
            <div>
              <p className="font-medium text-muted-foreground">Tool calls</p>
              <div className="space-y-0.5 font-mono">
                {row.toolCalls.map((t, i) => (
                  <p key={i} className="whitespace-pre-wrap break-all">
                    {t.name}({JSON.stringify(t.args)})
                  </p>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="font-medium text-muted-foreground">Reply</p>
            <p className="whitespace-pre-wrap">{row.answer || "(empty)"}</p>
          </div>
          <p className="text-muted-foreground">
            {row.rounds ?? 0} round{row.rounds === 1 ? "" : "s"}
          </p>
        </div>
      )}
    </div>
  )
}
