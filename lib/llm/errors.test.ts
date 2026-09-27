import { describe, expect, it } from "vitest"
import { agentErrorMessage, explainHttpError, explainNetworkError, LlmError } from "./errors"

describe("explainHttpError", () => {
  it("translates the statuses people hit", () => {
    expect(explainHttpError(401, "")).toMatch(/API key/)
    expect(explainHttpError(403, "")).toMatch(/API key/)
    expect(explainHttpError(404, "")).toMatch(/base URL and model/)
    expect(explainHttpError(429, "")).toMatch(/rate limit/)
    expect(explainHttpError(503, "")).toMatch(/provider had an error/)
  })
  it("spots models without tool support", () => {
    expect(explainHttpError(400, '{"error":"llama2 does not support tools"}')).toMatch(/doesn't support tool calling/)
  })
  it("falls back to the status and a short body", () => {
    expect(explainHttpError(418, "x".repeat(500))).toBe(`The LLM provider returned 418: ${"x".repeat(200)}`)
  })
})

describe("explainNetworkError", () => {
  it("names unreachable hosts", () => {
    const err = Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } })
    expect(explainNetworkError(err, "localhost:11434")).toBe("Couldn't reach the LLM server at localhost:11434.")
  })
  it("recognises timeouts", () => {
    const err = new DOMException("timed out", "TimeoutError")
    expect(explainNetworkError(err, "h")).toMatch(/took too long/)
  })
})

describe("agentErrorMessage", () => {
  it("passes LlmError messages through", () => {
    expect(agentErrorMessage(new LlmError("Bad key"), false)).toBe("Bad key")
  })
  it("reports the wall-clock cap", () => {
    expect(agentErrorMessage(new Error("aborted"), true)).toBe("That took longer than the time limit — the model may be busy or still loading. Try again, or raise the limit in Settings.")
  })
  it("hides anything else", () => {
    expect(agentErrorMessage(new Error("SQLITE_BUSY secret"), false)).toBe("Something went wrong answering that.")
  })
})
