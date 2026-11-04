"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { FileSearch, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useFormat } from "@/components/regional-provider"
import { paperlessIdFromLink } from "@/lib/paperless/badge"
import { usePaperless } from "./paperless-context"

type Result = { id: number; title: string; mimeType: string; created: string }
type Named = { id: number; name: string }

type Props = {
  recordType: string
  recordId: string
  /** Called after a successful import. */
  onImported: (attachmentId: string) => void
  /** Replaces the default button. */
  trigger?: (open: () => void) => ReactNode
  /** Replaces the import call (the Intake flow creates its item first). Resolves with the id passed to onImported; throw to show an error. */
  importDocument?: (documentId: number) => Promise<string>
  disabled?: boolean
}

// The open list of a native select is drawn by the browser; without explicit theme colours it can
// fall back to light-on-light (or dark-on-dark) in the other theme.
const OPTION_CLASS = "bg-background text-foreground"
const SELECT_CLASS = "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Couldn't reach Paperless.")
  return json as T
}

export function PaperlessPicker({ recordType, recordId, onImported, trigger, importDocument, disabled }: Props) {
  const { available } = usePaperless()
  const fmt = useFormat()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [query, setQuery] = useState("")
  const [tag, setTag] = useState("")
  const [docType, setDocType] = useState("")
  const [page, setPage] = useState(1)
  const [tags, setTags] = useState<Named[]>([])
  const [types, setTypes] = useState<Named[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [count, setCount] = useState(0)
  const [pageSize, setPageSize] = useState(0)
  // The search the current results belong to; loading while it lags behind the filters.
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState<number | null>(null)
  const [link, setLink] = useState("")
  const requestRef = useRef(0)
  const searchKey = `${query}|${tag}|${docType}|${page}`
  const loading = open && loadedKey !== searchKey

  // Debounce typing into the query.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      setQuery(text.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [text, open])

  // Tag and type lists load when the dialog opens.
  useEffect(() => {
    if (!open) return
    let live = true
    getJson<{ results: Named[] }>("/api/paperless/tags").then((r) => live && setTags(r.results)).catch(() => {})
    getJson<{ results: Named[] }>("/api/paperless/document-types").then((r) => live && setTypes(r.results)).catch(() => {})
    return () => { live = false }
  }, [open])

  // Search whenever a filter or the page changes.
  useEffect(() => {
    if (!open) return
    const id = ++requestRef.current
    const params = new URLSearchParams()
    if (query) params.set("query", query)
    if (tag) params.set("tag", tag)
    if (docType) params.set("documentType", docType)
    if (page > 1) params.set("page", String(page))
    getJson<{ count: number; results: Result[] }>(`/api/paperless/search?${params}`)
      .then((r) => {
        if (id !== requestRef.current) return
        setResults(r.results)
        setCount(r.count)
        // Paperless sets the page size; the first page's length is it whenever there is more than one page.
        if (page === 1 && r.results.length > 0) setPageSize(r.results.length)
        setError(null)
      })
      .catch((e) => {
        if (id !== requestRef.current) return
        setResults([])
        setCount(0)
        setError(e instanceof Error ? e.message : "Couldn't reach Paperless.")
      })
      .finally(() => {
        if (id === requestRef.current) setLoadedKey(searchKey)
      })
  }, [open, query, tag, docType, page, searchKey])

  if (!available) return null

  async function run(documentId: number) {
    setImporting(documentId)
    setError(null)
    try {
      let attachmentId: string
      if (importDocument) {
        attachmentId = await importDocument(documentId)
      } else {
        const res = await fetch("/api/paperless/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId, recordType, recordId }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Couldn't import from Paperless.")
        attachmentId = json.attachmentId
      }
      setOpen(false)
      setLink("")
      onImported(attachmentId)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't import from Paperless.")
    } finally {
      setImporting(null)
    }
  }

  const linkId = paperlessIdFromLink(link)
  const linkInvalid = link.trim() !== "" && linkId === null
  const hasNext = pageSize > 0 && (page - 1) * pageSize + results.length < count
  const busy = importing !== null
  const openDialog = () => {
    setError(null)
    setOpen(true)
  }

  return (
    <>
      {trigger ? trigger(openDialog) : (
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={openDialog}>
          <FileSearch className="h-3.5 w-3.5 mr-1.5" />
          Choose from Paperless
        </Button>
      )}
      <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v) }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choose from Paperless</DialogTitle>
            <DialogDescription>Pick a document to copy into HomeCenter. It stays linked to Paperless.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 sm:grid-cols-[1fr_10rem_10rem]">
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search documents" aria-label="Search Paperless" />
            <select className={SELECT_CLASS} value={tag} onChange={(e) => { setTag(e.target.value); setPage(1) }} aria-label="Tag">
              <option value="" className={OPTION_CLASS}>All tags</option>
              {tags.map((t) => <option key={t.id} value={t.id} className={OPTION_CLASS}>{t.name}</option>)}
            </select>
            <select className={SELECT_CLASS} value={docType} onChange={(e) => { setDocType(e.target.value); setPage(1) }} aria-label="Document type">
              <option value="" className={OPTION_CLASS}>All types</option>
              {types.map((t) => <option key={t.id} value={t.id} className={OPTION_CLASS}>{t.name}</option>)}
            </select>
          </div>

          <div className="max-h-[50vh] min-h-24 space-y-1 overflow-y-auto" aria-busy={loading}>
            {loading && results.length === 0 && <p className="text-sm text-muted-foreground">Searching…</p>}
            {!loading && results.length === 0 && !error && <p className="text-sm text-muted-foreground">No documents found.</p>}
            {results.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-md border px-2 py-1.5 text-sm">
                {/* eslint-disable-next-line @next/next/no-img-element -- proxied thumbnail */}
                <img src={`/api/paperless/thumb/${r.id}`} loading="lazy" alt="" className="h-14 w-10 shrink-0 rounded-sm border bg-muted object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.title || `Document ${r.id}`}</p>
                  {r.created && !Number.isNaN(new Date(r.created).getTime()) && (
                    <p className="text-xs text-muted-foreground">{fmt.date(r.created, { utc: true })}</p>
                  )}
                </div>
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(r.id)}>
                  {importing === r.id ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Importing…</> : "Import"}
                </Button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{count > 0 ? `${count} document${count === 1 ? "" : "s"}` : ""}</span>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" disabled={page <= 1 || loading || busy} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span>Page {page}</span>
              <Button type="button" size="sm" variant="outline" disabled={!hasNext || loading || busy} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="Or paste a Paperless link or document number"
                aria-label="Paperless link"
                aria-invalid={linkInvalid || undefined}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && linkId !== null && !busy) {
                    e.preventDefault()
                    void run(linkId)
                  }
                }}
              />
              <Button type="button" size="sm" disabled={linkId === null || busy} onClick={() => linkId !== null && void run(linkId)}>
                {busy && importing === linkId ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Importing…</> : "Import"}
              </Button>
            </div>
            {linkInvalid && <p className="text-xs text-destructive">That doesn&apos;t look like a Paperless document link.</p>}
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </DialogContent>
      </Dialog>
    </>
  )
}
