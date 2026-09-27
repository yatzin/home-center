import { MAX_MESSAGE_CHARS, MAX_TOTAL_CHARS } from "./request-schema"
import type { HistoryMessage } from "./types"

// The chat thread lives only in this tab's sessionStorage — never on the
// server. Storage can be missing or throw (private mode, blocked site data), so
// every access is guarded and a failure just means an empty or unsaved thread.

type ThreadStorage = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null

export const SEND_LIMIT = 20

/**
 * A message as the page keeps it. `discarded` is a first answer that was
 * thrown out by the link check; it is shown struck through and never sent.
 */
export type ThreadMessage = HistoryMessage & { discarded?: string }

export function threadKey(userId: string) {
  return `hc.chat.${userId}`
}

function isMessage(m: unknown): m is ThreadMessage {
  const v = m as ThreadMessage | null
  return !!v && (v.role === "user" || v.role === "assistant") && typeof v.content === "string" && v.content.length > 0
}

export function loadThread(storage: ThreadStorage, userId: string): ThreadMessage[] {
  try {
    const raw = storage?.getItem(threadKey(userId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(isMessage)
      .map((m) => ({ role: m.role, content: m.content, ...(typeof m.discarded === "string" && m.discarded ? { discarded: m.discarded } : {}) }))
  } catch {
    return []
  }
}

export function saveThread(storage: ThreadStorage, userId: string, messages: ThreadMessage[]) {
  try {
    storage?.setItem(threadKey(userId), JSON.stringify(messages))
  } catch {
    // quota or blocked — the thread still works for this page view
  }
}

export function clearThread(storage: ThreadStorage, userId: string) {
  try {
    storage?.removeItem(threadKey(userId))
  } catch {
    // nothing to do
  }
}

const startOnUser = (ms: HistoryMessage[]) => {
  const i = ms.findIndex((m) => m.role === "user")
  return i < 0 ? [] : ms.slice(i)
}

/**
 * What to send, within the server's limits: the recent tail, alternating roles
 * (adjacent same-role messages — e.g. a retried question — are merged), each
 * message and the total capped, starting on a user turn.
 */
export function requestMessages(thread: ThreadMessage[]): HistoryMessage[] {
  const merged: HistoryMessage[] = []
  for (const m of startOnUser(thread.slice(-SEND_LIMIT))) {
    const content = m.content.slice(0, MAX_MESSAGE_CHARS)
    const prev = merged.at(-1)
    // Merged text keeps its end: the newest words matter most.
    if (prev?.role === m.role) prev.content = `${prev.content}\n\n${content}`.slice(-MAX_MESSAGE_CHARS)
    else merged.push({ role: m.role, content })
  }
  let total = merged.reduce((n, m) => n + m.content.length, 0)
  while (merged.length > 1 && total > MAX_TOTAL_CHARS) total -= merged.shift()!.content.length
  return startOnUser(merged)
}

/** A turn that started before "New chat" must not write into the new thread. */
export function shouldPersist(startedGeneration: number, currentGeneration: number) {
  return startedGeneration === currentGeneration
}
