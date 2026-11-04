import { isDue } from "@/lib/backup/schedule"
import { loadPaperlessConfig } from "./config"
import { runPaperlessCheck } from "./sync-server"

const TICK_MS = 15 * 60_000
const BOOT_DELAY_MS = 20_000

async function tick(now = new Date()) {
  const cfg = await loadPaperlessConfig()
  if (!cfg.enabled || !cfg.baseUrl || !cfg.token || cfg.schedule === "OFF") return
  // A failed run also sets lastCheckedAt, so it waits for the next slot.
  if (!isDue({ schedule: cfg.schedule, time: cfg.time, weekday: cfg.weekday }, cfg.lastCheckedAt, now)) return
  await runPaperlessCheck("SCHEDULE")
}

// Same per-process guard as the backup scheduler: every loaded copy of this module shares it.
const g = globalThis as unknown as { __hcPaperlessScheduler?: boolean }

export function startPaperlessScheduler() {
  if (g.__hcPaperlessScheduler) return
  g.__hcPaperlessScheduler = true
  const run = () =>
    void tick().catch((e) => console.error("[paperless] scheduler tick failed:", e instanceof Error ? e.name : "unknown"))
  setTimeout(run, BOOT_DELAY_MS).unref()
  setInterval(run, TICK_MS).unref()
  console.log("[paperless] scheduler started — checks every 15 minutes")
}
