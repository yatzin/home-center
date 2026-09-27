"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { ArrowUp, Loader2, RotateCcw, Square, SquarePen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useChat } from "./chat-provider"
import { Markdown } from "./markdown"

const EXAMPLES = [
  "How much did we spend on each vehicle last year?",
  "What maintenance is overdue or due soon?",
  "Which medications need a refill soon?",
  "When was the furnace last serviced?",
]

function Bubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">{content}</p>
      </div>
    )
  }
  return (
    <div className="max-w-full">
      <Markdown>{content}</Markdown>
    </div>
  )
}

function Unavailable({ isAdmin, className }: { isAdmin: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground", className)}>
      {isAdmin ? (
        <p>
          The assistant isn&apos;t set up yet.{" "}
          <Link href="/settings" className="text-primary underline">
            Configure it in Settings
          </Link>
          .
        </p>
      ) : (
        <p>The assistant isn&apos;t set up yet. Ask an administrator to configure it.</p>
      )}
    </div>
  )
}

export function ChatThread({ className }: { className?: string }) {
  const chat = useChat()
  const [input, setInput] = useState("")
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" })
  }, [chat.messages, chat.draft, chat.statusLabel, chat.error])

  if (!chat.available) return <Unavailable isAdmin={chat.isAdmin} className={className} />

  function submit(text: string = input) {
    if (!text.trim() || chat.busy) return
    chat.send(text)
    setInput("")
  }

  const empty = chat.messages.length === 0 && chat.draft === null && !chat.error

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex-1 space-y-4 overflow-y-auto px-1 py-2" aria-live="polite">
        {empty && (
          <div className="space-y-2 pt-4">
            <p className="text-sm text-muted-foreground">Ask about your home, vehicles, equipment, health records or spending. For example:</p>
            <div className="flex flex-col items-start gap-2">
              {EXAMPLES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => submit(q)}
                  className="rounded-lg border px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {chat.messages.map((m, i) => (
          <Bubble key={i} role={m.role} content={m.content} />
        ))}
        {chat.draft ? <Bubble role="assistant" content={chat.draft} /> : null}
        {chat.busy && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {chat.statusLabel ?? "Thinking…"}
          </p>
        )}
        {chat.error && (
          <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <p>{chat.error}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={chat.retry}>
              <RotateCcw className="h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        )}
        {/* A reload mid-turn leaves the question unanswered, with no error to retry from. */}
        {!chat.busy && !chat.error && chat.messages.at(-1)?.role === "user" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>No answer yet.</span>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={chat.retry}>
              <RotateCcw className="h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="border-t pt-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Ask a question…"
          rows={2}
          maxLength={8000}
          className="resize-none"
          aria-label="Message"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={chat.reset} disabled={chat.messages.length === 0 && !chat.busy && !chat.error}>
            <SquarePen className="h-3.5 w-3.5" />
            New chat
          </Button>
          {chat.busy ? (
            <Button type="button" size="sm" variant="outline" onClick={chat.stop}>
              <Square className="h-3.5 w-3.5" />
              Stop
            </Button>
          ) : (
            <Button type="submit" size="sm" disabled={!input.trim()}>
              <ArrowUp className="h-3.5 w-3.5" />
              Send
            </Button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Answers are generated from your HomeCenter data by {chat.model ?? "the configured model"} and can be wrong.
        </p>
      </form>
    </div>
  )
}
