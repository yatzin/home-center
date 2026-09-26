import { MAX_MESSAGE_CHARS } from "./request-schema"
import type { HistoryMessage } from "./types"

// The chat thread lives only in this tab's sessionStorage — never on the
// server. Storage can be missing or throw (private mode, blocked site data), so
// every access is guarded and a failure just means an empty or unsaved thread.

type ThreadStorage = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null

export const SEND_LIMIT = 20

export function threadKey(userId: string) {
  return `hc.chat.${userId}`
}

function isMessage(m: unknown): m is HistoryMessage {
  const v = m as HistoryMessage | null
  return !!v && (v.role === "user" || v.role === "assistant") && typeof v.content === "string" && v.content.length > 0
}

export function loadThread(storage: ThreadStorage, userId: string): HistoryMessage[] {
  try {
    const raw = storage?.getItem(threadKey(userId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isMessage).map((m) => ({ role: m.role, content: m.content }))
  } catch {
    return []
  }
}

export function saveThread(storage: ThreadStorage, userId: string, messages: HistoryMessage[]) {
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

/** What to send: the recent tail, starting on a user turn, each message within the server's cap. */
export function requestMessages(thread: HistoryMessage[]): HistoryMessage[] {
  let tail = thread.slice(-SEND_LIMIT)
  while (tail.length && tail[0].role !== "user") tail = tail.slice(1)
  return tail.map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }))
}

/** A turn that started before "New chat" must not write into the new thread. */
export function shouldPersist(startedGeneration: number, currentGeneration: number) {
  return startedGeneration === currentGeneration
}
