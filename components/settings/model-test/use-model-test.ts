"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createNdjsonReader } from "@/lib/llm/ndjson"
import type { ModelTestEvent, Stage } from "@/lib/llm/model-test/types"
import { buildHistoryEntry, clearHistory, formatTemperature, loadHistory, saveHistoryEntry, shortJson } from "./summary"
import type { CaseRunState, CaseStatus, HistoryEntry, ModelTestCatalogEntry, WarmupState } from "./types"

export type StageInfo = { id: Stage; label: string; description: string }

type LiveSummary = {
  total: number
  completed: number
  passed: number
  failed: number
  elapsedMs: number
  avgMs: number
}

type StartMeta = { model: string; temperature: number | null; extraBody: string | null }

export function useModelTest(args: {
  savedModel: string
  savedTemperature: string
  savedExtraBody: string
  catalog: ModelTestCatalogEntry[]
  stages: StageInfo[]
}) {
  const { savedModel, savedTemperature, savedExtraBody, catalog, stages } = args

  // --- settings form (this test only; never persisted) -------------------
  const [model, setModel] = useState(savedModel)
  const [temperature, setTemperature] = useState(savedTemperature)
  const [extraBody, setExtraBody] = useState(savedExtraBody)

  const resetToSaved = useCallback(() => {
    setModel(savedModel)
    setTemperature(savedTemperature)
    setExtraBody(savedExtraBody)
  }, [savedModel, savedTemperature, savedExtraBody])

  const applyPreset = useCallback((value: string) => setExtraBody(value), [])

  // --- which tests ---------------------------------------------------------
  const [selectedStages, setSelectedStages] = useState<Set<Stage>>(() => new Set(stages.map((s) => s.id)))
  const [repeat, setRepeat] = useState(1)

  const toggleStage = useCallback((id: Stage) => {
    setSelectedStages((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectedCatalog = useMemo(() => catalog.filter((c) => selectedStages.has(c.stage)), [catalog, selectedStages])

  // --- run state -------------------------------------------------------
  const [results, setResults] = useState<Record<string, CaseRunState>>({})
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warmup, setWarmup] = useState<WarmupState | null>(null)
  const [startLine, setStartLine] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState<number | null>(null)
  const [lastFailedIds, setLastFailedIds] = useState<string[]>([])

  const resultsRef = useRef<Record<string, CaseRunState>>({})
  const abortRef = useRef<AbortController | null>(null)
  const startMetaRef = useRef<StartMeta | null>(null)

  const setResult = useCallback((key: string, patch: CaseRunState) => {
    resultsRef.current = { ...resultsRef.current, [key]: patch }
    setResults(resultsRef.current)
  }, [])

  // Ticks the elapsed-time display while a run is in flight. The setState
  // call happens inside the interval's callback, not the effect body itself.
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [running])

  // Load saved history once we're in the browser.
  const [history, setHistory] = useState<HistoryEntry[]>([])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage only exists client-side; reading it during render would break hydration
    setHistory(loadHistory())
  }, [])

  const buildPending = useCallback(
    (ids: string[]): Record<string, CaseRunState> => {
      const map: Record<string, CaseRunState> = {}
      for (const id of ids) {
        for (let rep = 0; rep < repeat; rep++) {
          const key = `${id}#${rep}`
          map[key] = { key, id, rep, status: "pending" }
        }
      }
      return map
    },
    [repeat]
  )

  const finalizeRun = useCallback(
    (stoppedEarly: boolean) => {
      const finished = Object.values(resultsRef.current).filter((r) => r.status === "pass" || r.status === "fail")
      if (!finished.length) return
      const meta = startMetaRef.current
      // Scoped to the cases actually in this run (a "re-run failed" pass only
      // covers a subset), not to whatever is currently checked on screen.
      const ranIds = new Set(Object.values(resultsRef.current).map((r) => r.id))
      const entry = buildHistoryEntry({
        model: meta?.model ?? (model || savedModel),
        temperature: meta?.temperature ?? temperature,
        extraBody: meta?.extraBody ?? (extraBody || null),
        results: resultsRef.current,
        catalog,
        repeat,
        selectedIds: ranIds,
        stages,
        stoppedEarly,
      })
      setHistory(saveHistoryEntry(entry))
      setLastFailedIds([...new Set(Object.values(resultsRef.current).filter((r) => r.status === "fail").map((r) => r.id))])
    },
    [catalog, extraBody, model, repeat, savedModel, stages, temperature]
  )

  const handleEvent = useCallback((event: ModelTestEvent) => {
    if (event.type === "start") {
      startMetaRef.current = { model: event.model, temperature: event.temperature, extraBody: event.extraBody }
      setWarmup({ status: "pending" })
      const tempLabel = formatTemperature(event.temperature)
      const extraLabel = event.extraBody ? shortJson(event.extraBody, 80) : "no extra JSON"
      setStartLine(`Testing: ${event.model} · temp ${tempLabel} · ${extraLabel}`)
    } else if (event.type === "warmup") {
      setWarmup({ status: event.ok ? "ok" : "warn", ms: event.ms, error: event.error })
    } else if (event.type === "running") {
      setResult(event.key, { key: event.key, id: event.id, rep: event.rep, status: "running" })
    } else if (event.type === "result") {
      const status: CaseStatus = event.pass ? "pass" : "fail"
      setResult(event.key, {
        key: event.key,
        id: event.id,
        rep: event.rep,
        status,
        reason: event.reason,
        ms: event.ms,
        answer: event.answer,
        toolCalls: event.toolCalls,
        rounds: event.rounds,
        error: event.error,
      })
    } else if (event.type === "error") {
      setError(event.message)
    }
    // "done" carries only aggregate counts already reflected in the result
    // events; the run's finish is handled in run()'s finally block so it
    // covers the stopped-early and network-failure paths too.
  }, [setResult])

  const run = useCallback(
    (caseIdsOverride?: string[]) => {
      const ids = caseIdsOverride ?? selectedCatalog.map((c) => c.id)
      if (!ids.length) {
        setError("No tests selected.")
        return
      }
      // A fresh "Run all tests" replaces the board entirely; "Re-run failed"
      // only resets the cases being retried, so passed rows stay visible.
      const pendingForIds = buildPending(ids)
      resultsRef.current = caseIdsOverride ? { ...resultsRef.current, ...pendingForIds } : pendingForIds
      setResults(resultsRef.current)
      setError(null)
      setWarmup(null)
      setStartLine(null)
      setLastFailedIds([])
      startMetaRef.current = null
      const startedAtMs = Date.now()
      setStartedAt(startedAtMs)
      setNow(startedAtMs)
      setRunning(true)

      const controller = new AbortController()
      abortRef.current = controller

      const allSelected = ids.length === catalog.length && !caseIdsOverride
      const body = {
        model,
        temperature,
        extraBody,
        caseIds: allSelected ? undefined : ids,
        repeat,
      }

      void (async () => {
        try {
          const res = await fetch("/api/assistant-test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
          })
          if (!res.ok || !res.body) {
            const parsed = (await res.json().catch(() => null)) as { error?: string } | null
            throw new Error(parsed?.error ?? `Request failed (${res.status}).`)
          }
          const reader = createNdjsonReader<ModelTestEvent>(handleEvent)
          const stream = res.body.pipeThrough(new TextDecoderStream()).getReader()
          for (;;) {
            const { value, done } = await stream.read()
            if (done) break
            reader.feed(value)
          }
          reader.flush()
          finalizeRun(false)
        } catch (e) {
          if (controller.signal.aborted) {
            finalizeRun(true)
          } else {
            setError(e instanceof Error ? e.message : "The test run failed.")
          }
        } finally {
          if (abortRef.current === controller) abortRef.current = null
          setRunning(false)
        }
      })()
    },
    [buildPending, catalog.length, extraBody, finalizeRun, handleEvent, model, repeat, selectedCatalog, temperature]
  )

  const stop = useCallback(() => abortRef.current?.abort(), [])

  const rerunFailed = useCallback(() => {
    if (lastFailedIds.length) run(lastFailedIds)
  }, [lastFailedIds, run])

  const useHistorySettings = useCallback((entry: HistoryEntry) => {
    setModel(entry.model)
    setTemperature(entry.temperature)
    setExtraBody(entry.extraBody)
  }, [])

  const clearHistoryEntries = useCallback(() => {
    clearHistory()
    setHistory([])
  }, [])

  const liveSummary: LiveSummary = useMemo(() => {
    const all = Object.values(results)
    const total = all.length
    const passed = all.filter((r) => r.status === "pass").length
    const failed = all.filter((r) => r.status === "fail").length
    const completed = passed + failed
    const withMs = all.filter((r): r is CaseRunState & { ms: number } => typeof r.ms === "number")
    const avgMs = withMs.length ? withMs.reduce((sum, r) => sum + r.ms, 0) / withMs.length : 0
    const elapsedMs = startedAt && now ? now - startedAt : 0
    return { total, completed, passed, failed, elapsedMs, avgMs }
  }, [results, startedAt, now])

  return {
    // settings form
    model,
    setModel,
    temperature,
    setTemperature,
    extraBody,
    setExtraBody,
    applyPreset,
    resetToSaved,

    // which tests
    stages,
    selectedStages,
    toggleStage,
    repeat,
    setRepeat,
    selectedCatalog,

    // run
    running,
    run,
    stop,
    rerunFailed,
    canRerunFailed: lastFailedIds.length > 0 && !running,

    // live
    results,
    catalog,
    liveSummary,
    warmup,
    startLine,
    error,

    // history
    history,
    useHistorySettings,
    clearHistory: clearHistoryEntries,
  }
}
