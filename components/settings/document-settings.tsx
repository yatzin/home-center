"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  clearExtractedText, rebuildDocumentIndex, reextractDocuments, retryFailedDocuments, updateDocumentSettings,
  type DocumentActionResult,
} from "@/lib/actions/document-settings"

type Values = { indexingEnabled: boolean; ocrEnabled: boolean }

export function DocumentSettings({ initial, stats: initialStats }: { initial: Values; stats: string }) {
  const [values, setValues] = useState(initial)
  const [stats, setStats] = useState(initialStats)
  const [pending, start] = useTransition()

  function run(action: () => Promise<DocumentActionResult>, done: string) {
    start(async () => {
      const r = await action()
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      setStats(r.stats)
      toast.success(done)
    })
  }

  function save(next: Values) {
    const previous = values
    setValues(next)
    start(async () => {
      const r = await updateDocumentSettings(next)
      if ("error" in r) {
        setValues(previous)
        toast.error(r.error)
        return
      }
      setStats(r.stats)
    })
  }

  const on = values.indexingEnabled

  return (
    <Card className="py-5">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2">
          Documents
          {on ? <Badge variant="secondary">On</Badge> : <Badge variant="outline">Off</Badge>}
        </CardTitle>
        <CardDescription>
          Reads the text of uploaded files so the assistant can search them. Everything stays on this server.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 space-y-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={on}
            disabled={pending}
            onChange={(e) => save({ ...values, indexingEnabled: e.target.checked })}
          />
          Index uploaded documents
        </label>

        <div className="space-y-1">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={values.ocrEnabled}
              disabled={pending || !on}
              onChange={(e) => save({ ...values, ocrEnabled: e.target.checked })}
            />
            Read text from photos and scanned PDFs (OCR)
          </label>
          <p className="ml-6 text-xs text-muted-foreground">Uses noticeable CPU while indexing new uploads.</p>
        </div>

        <p className="text-sm text-muted-foreground">{stats}</p>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pending || !on} onClick={() => run(retryFailedDocuments, "Retrying failed files.")}>
            Retry failed
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={pending || !on} onClick={() => run(rebuildDocumentIndex, "Rebuilding the search index.")}>
            Rebuild index
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || !on}
            onClick={() => {
              if (confirm("Read every uploaded file again? This can take a while and uses CPU.")) run(reextractDocuments, "Re-reading all files.")
            }}
          >
            Re-extract all
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || on}
            onClick={() => {
              if (confirm("Delete all extracted text and the search index? The files themselves are kept.")) run(clearExtractedText, "Extracted text cleared.")
            }}
          >
            Clear extracted text
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
