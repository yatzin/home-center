"use client"

import { createContext, useContext, useState } from "react"
import { useChatThread } from "./use-chat-thread"

// One live thread for the whole app shell, so the header panel and the /chat
// page show the same conversation — even mid-answer — while you navigate.

type ChatContextValue = ReturnType<typeof useChatThread> & {
  available: boolean
  isAdmin: boolean
  model: string | null
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

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
  const [panelOpen, setPanelOpen] = useState(false)
  return (
    <ChatContext.Provider value={{ ...thread, available, isAdmin, model, panelOpen, setPanelOpen }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  const value = useContext(ChatContext)
  if (!value) throw new Error("useChat must be used inside ChatProvider")
  return value
}
