"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { DEFAULT_PANEL_WIDTH, clampPanelWidth, readPanelPrefs, writePanelPrefs } from "@/lib/llm/panel-prefs"
import { useChatThread } from "./use-chat-thread"

// One live thread for the whole app shell, so the docked panel and the /chat
// page show the same conversation — even mid-answer — while you navigate.

type ChatContextValue = ReturnType<typeof useChatThread> & {
  available: boolean
  isAdmin: boolean
  model: string | null
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
  panelWidth: number
  setPanelWidth: (width: number, persist?: boolean) => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

function storage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** Wide enough for the page and the panel side by side (Tailwind's md). */
export function isWide() {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches
}

export function ChatProvider({
  userId,
  available,
  isAdmin,
  model,
  children,
}: {
  userId: string
  available: boolean
  isAdmin: boolean
  model: string | null
  children: React.ReactNode
}) {
  const thread = useChatThread(userId)
  const [panelOpen, setOpen] = useState(false)
  const [panelWidth, setWidth] = useState(DEFAULT_PANEL_WIDTH)

  // localStorage only exists in the browser, so the saved layout loads after mount.
  useEffect(() => {
    const prefs = readPanelPrefs(storage())
    // On a phone the panel covers the screen; don't reopen it over the page on every load.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is browser-only; reading it during render would break hydration
    setOpen(prefs.open && isWide())
    setWidth(prefs.width)
  }, [])

  const setPanelOpen = useCallback(
    (open: boolean) => {
      setOpen(open)
      writePanelPrefs(storage(), { open, width: panelWidth })
    },
    [panelWidth]
  )

  /** Called on every drag move; persist once the drag ends. */
  const setPanelWidth = useCallback(
    (width: number, persist = false) => {
      const next = clampPanelWidth(width)
      setWidth(next)
      if (persist) writePanelPrefs(storage(), { open: panelOpen, width: next })
    },
    [panelOpen]
  )

  return (
    <ChatContext.Provider value={{ ...thread, available, isAdmin, model, panelOpen, setPanelOpen, panelWidth, setPanelWidth }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  const value = useContext(ChatContext)
  if (!value) throw new Error("useChat must be used inside ChatProvider")
  return value
}
