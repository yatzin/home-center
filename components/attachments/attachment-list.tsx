"use client"

import { useRef, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Paperclip, Trash2, Upload, FileText, Image } from "lucide-react"
import { toast } from "sonner"
import { deleteAttachment } from "@/lib/actions/attachments"
import type { Attachment } from "@/app/generated/prisma/client"

interface Props {
  recordId: string
  recordType: "SERVICE" | "WARRANTY" | "MAINTENANCE"
  attachments: Attachment[]
}

function fileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return Image
  return FileText
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function AttachmentList({ recordId, recordType, attachments: initial }: Props) {
  const [attachments, setAttachments] = useState(initial)
  const [uploading, setUploading] = useState(false)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("recordId", recordId)
      formData.append("recordType", recordType)
      const res = await fetch("/api/uploads", { method: "POST", body: formData })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? "Upload failed"); return }
      setAttachments((prev) => [...prev, json.attachment])
      toast.success(`"${file.name}" uploaded.`)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function handleDelete(id: string, originalName: string) {
    if (!confirm(`Remove "${originalName}"?`)) return
    startTransition(async () => {
      await deleteAttachment(id, recordId, recordType)
      setAttachments((prev) => prev.filter((a) => a.id !== id))
      toast.success("Attachment removed.")
    })
  }

  const subdir = recordType.toLowerCase()

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Paperclip className="h-3.5 w-3.5" />
          Attachments {attachments.length > 0 && <Badge variant="secondary" className="h-4 px-1.5 text-xs">{attachments.length}</Badge>}
        </div>
        <label>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            {uploading ? "Uploading…" : "Attach file"}
          </Button>
        </label>
      </div>

      {attachments.length > 0 && (
        <ul className="space-y-1">
          {attachments.map((a) => {
            const Icon = fileIcon(a.mimeType)
            const href = `/api/files/${subdir}/${recordId}/${a.filename}`
            return (
              <li key={a.id} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 truncate hover:underline"
                >
                  {a.originalName}
                </a>
                <span className="text-xs text-muted-foreground shrink-0">{formatBytes(a.sizeBytes)}</span>
                <button
                  type="button"
                  onClick={() => handleDelete(a.id, a.originalName)}
                  disabled={isPending}
                  className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
