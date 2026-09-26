import { ChatThread } from "@/components/chat/chat-thread"

// Auth is enforced by the (app) layout; availability is handled inside ChatThread.
export default function ChatPage() {
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4">
      <h1 className="font-heading text-2xl font-semibold">Assistant</h1>
      <ChatThread />
    </div>
  )
}
