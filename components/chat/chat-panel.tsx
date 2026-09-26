"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Maximize2, MessageSquare } from "lucide-react"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useChat } from "./chat-provider"
import { ChatThread } from "./chat-thread"

export function ChatPanel() {
  const chat = useChat()
  const pathname = usePathname()
  // The full page already shows the thread.
  if (pathname === "/chat") return null

  return (
    <Sheet open={chat.panelOpen} onOpenChange={chat.setPanelOpen}>
      <SheetTrigger className="relative inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-muted">
        <MessageSquare className="h-4 w-4" />
        {chat.busy && <span className="absolute right-1 top-1 h-2 w-2 animate-pulse rounded-full bg-primary" />}
        <span className="sr-only">Open assistant</span>
      </SheetTrigger>
      <SheetContent side="right" className="gap-0 p-4 data-[side=right]:w-full data-[side=right]:sm:max-w-[420px]">
        <div className="mb-2 flex items-center gap-2 pr-8">
          <SheetTitle className="font-heading text-base font-semibold">Assistant</SheetTitle>
          <Link
            href="/chat"
            onClick={() => chat.setPanelOpen(false)}
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Open full page
          </Link>
        </div>
        <ChatThread />
      </SheetContent>
    </Sheet>
  )
}
