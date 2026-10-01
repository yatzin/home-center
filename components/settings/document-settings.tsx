"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  clearExtractedText, deleteEmbeddingModel, downloadEmbeddingModel, getModelStatus, rebuildDocumentIndex, reextractDocuments,
  retryFailedDocuments, switchEmbeddingModel, updateDocumentSettings, type DocumentActionResult,
} from "@/lib/actions/document-settings"
// Types only: embed/server reaches Prisma and must never be bundled for the browser.
import type { ModelRow, ModelStatus } from "@/lib/documents/embed/server"

type Values = { indexingEnabled: boolean; ocrEnabled: boolean; semanticEnabled: boolean }

export function DocumentSettings({
  initial,
  stats: initialStats,
  models: initialModels,
}: {
  initial: Values
  stats: string
  models: ModelStatus
}) {
  const [values, setValues] = useState(initial)
  const [stats, setStats] = useState(initialStats)
  const [pending, start] = useTransition()
  const [models, setModels] = useState(initialModels)

  const downloading = models.download?.modelId ?? null
  useEffect(() => {
    if (!downloading) return
    const t = setInterval(async () => {
      const next = await getModelStatus()
      setModels(next)
      if (!next.download && next.lastDownload?.error) toast.error(`${next.lastDownload.modelId}: ${next.lastDownload.error}`)
    }, 1000)
    return () => clearInterval(t)
  }, [downloading])


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

  const refreshModels = async () => setModels(await getModelStatus())

  function download(m: ModelRow) {
    start(async () => {
      const r = await downloadEmbeddingModel(m.id)
      if ("error" in r) toast.error(r.error)
      await refreshModels()
    })
  }

  function switchTo(m: ModelRow) {
    if (!confirm(`Switch to ${m.label}? Every document is re-processed in the background. Keyword search keeps working meanwhile.`)) return
    run(() => switchEmbeddingModel(m.id), `Switching to ${m.label}.`)
    void refreshModels()
  }

  function remove(m: ModelRow) {
    if (!confirm(`Delete ${m.label} (${m.sizeMb} MB)? You can download it again later.`)) return
    start(async () => {
      const r = await deleteEmbeddingModel(m.id)
      if ("error" in r) toast.error(r.error)
      else toast.success(`${m.label} deleted.`)
      await refreshModels()
    })
  }

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

        <div className="space-y-3 border-t pt-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={values.semanticEnabled}
              disabled={pending || !on}
              onChange={(e) => save({ ...values, semanticEnabled: e.target.checked })}
            />
            Find documents by meaning, not just exact words
          </label>
          <p className="ml-6 text-xs text-muted-foreground">
            Runs a small AI model on this server. Nothing leaves it. The model loads when needed and unloads when idle.
          </p>
          <div className="divide-y rounded-md border text-sm">
            {models.models.map((m) => {
              const isDownloading = models.download?.modelId === m.id
              const pct = isDownloading && models.download ? Math.floor((models.download.received / models.download.total) * 100) : 0
              return (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {m.label} <span className="font-normal text-muted-foreground">· {m.sizeMb} MB</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{m.purpose}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.active ? (
                      <Badge variant="secondary">In use</Badge>
                    ) : isDownloading ? (
                      <span className="text-xs text-muted-foreground">Downloading… {pct}%</span>
                    ) : m.installed ? (
                      <>
                        <Button type="button" variant="outline" size="sm" disabled={pending || !on} onClick={() => switchTo(m)}>
                          Use
                        </Button>
                        {!m.builtIn && (
                          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => remove(m)}>
                            Delete
                          </Button>
                        )}
                      </>
                    ) : (
                      <Button type="button" variant="outline" size="sm" disabled={pending || Boolean(models.download)} onClick={() => download(m)}>
                        Download
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
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
