// Providers answer failures with a status and a terse body. These turn the ones
// people actually hit into something they can act on, like explain() does for
// mail settings.

export class LlmError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = "LlmError"
  }
}

export function explainHttpError(status: number, body: string): string {
  if (status === 400 && /tool|function/i.test(body)) {
    return "This model doesn't support tool calling — pick another in Settings."
  }
  if (status === 401 || status === 403) return "The provider rejected the API key — check it in Settings."
  if (status === 404) return "Model or URL not found — check the base URL and model name in Settings."
  if (status === 429) return "The provider's rate limit was hit — try again shortly."
  if (status >= 500) return "The LLM provider had an error — try again."
  return `The LLM provider returned ${status}: ${body.slice(0, 200)}`
}

export function explainNetworkError(error: unknown, host: string): string {
  const e = error as { name?: string; message?: string; cause?: { code?: string } } | null
  if (e?.name === "TimeoutError") return "The LLM server took too long to respond — try a narrower question."
  const code = e?.cause?.code ?? ""
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|EHOSTUNREACH|UND_ERR/.test(code) || e?.message === "fetch failed") {
    return `Couldn't reach the LLM server at ${host}.`
  }
  return `Couldn't reach the LLM server at ${host}: ${e?.message ?? String(error)}`
}

/** The one line the user sees when a chat turn fails. */
export function agentErrorMessage(error: unknown, timedOut: boolean): string {
  if (error instanceof LlmError) return error.message
  if (timedOut) return "That took longer than the time limit — the model may be busy or still loading. Try again, or raise the limit in Settings."
  return "Something went wrong answering that."
}
