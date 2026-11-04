import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({ loadConfig: vi.fn(), runCheck: vi.fn() }))
vi.mock("./config", () => ({ loadPaperlessConfig: h.loadConfig }))
vi.mock("./sync-server", () => ({ runPaperlessCheck: h.runCheck }))

import { startPaperlessScheduler } from "./scheduler-server"

const g = globalThis as unknown as { __hcPaperlessScheduler?: boolean }
const config = (over: Record<string, unknown> = {}) => ({
  enabled: true, baseUrl: "https://paperless.example", token: "fake-token-123",
  schedule: "DAILY", time: "03:30", weekday: 0, lastCheckedAt: null, ...over,
})

async function bootTick() {
  startPaperlessScheduler()
  await vi.advanceTimersByTimeAsync(20_000)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 4, 12, 0))
  vi.clearAllMocks()
  delete g.__hcPaperlessScheduler
  vi.spyOn(console, "log").mockImplementation(() => {})
  h.runCheck.mockResolvedValue({})
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe("startPaperlessScheduler", () => {
  it("runs a SCHEDULE check when due", async () => {
    h.loadConfig.mockResolvedValue(config())
    await bootTick()
    expect(h.runCheck).toHaveBeenCalledWith("SCHEDULE")
  })

  it("not due after a check since the last slot (failed runs included)", async () => {
    h.loadConfig.mockResolvedValue(config({ lastCheckedAt: new Date(2026, 10, 4, 4, 0) }))
    await bootTick()
    expect(h.runCheck).not.toHaveBeenCalled()
  })

  it.each([
    ["OFF", { schedule: "OFF" }],
    ["disabled", { enabled: false }],
    ["no token", { token: null }],
    ["no URL", { baseUrl: null }],
  ])("%s: does nothing", async (_n, over) => {
    h.loadConfig.mockResolvedValue(config(over))
    await bootTick()
    expect(h.runCheck).not.toHaveBeenCalled()
  })

  it("a throwing tick is caught and logs only the error name", async () => {
    h.loadConfig.mockResolvedValue(config())
    h.runCheck.mockRejectedValue(new Error("boom fake-token-123"))
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    await bootTick()
    expect(JSON.stringify(spy.mock.calls)).not.toContain("fake-token-123")
    expect(spy).toHaveBeenCalled()
  })

  it("starts once and ticks every 15 minutes", async () => {
    h.loadConfig.mockResolvedValue(config({ schedule: "OFF" }))
    startPaperlessScheduler()
    startPaperlessScheduler()
    await vi.advanceTimersByTimeAsync(20_000 + 15 * 60_000)
    expect(h.loadConfig).toHaveBeenCalledTimes(2)
  })
})
