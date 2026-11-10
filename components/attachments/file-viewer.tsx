"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Download, FileQuestion } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PdfPages } from "@/components/attachments/pdf-pages"
import { fileKind } from "@/lib/file-viewer"

/**
 * A full-screen file page with a Back button, for the installed app. Images show as they
 * are; PDFs are drawn page by page (pdf.js) because phones' own PDF frames show one page;
 * anything else offers a download.
 */
export function FileViewer({ src, name, page }: { src: string; name: string; page: number | null }) {
  const router = useRouter()
  const [imageFailed, setImageFailed] = useState(false)
  const kind = fileKind(src)

  function back() {
    // Opened with no history behind it (a shared link): go home rather than do nothing.
    if (window.history.length > 1) router.back()
    else router.push("/")
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-muted/40" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <header className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-card px-2 py-1.5">
        <Button type="button" variant="ghost" size="icon" onClick={back} aria-label="Back">
          <ArrowLeft />
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium" title={name}>{name}</h1>
        <Button variant="ghost" size="icon" aria-label={`Download ${name}`} render={<a href={src} download={name} />}>
          <Download />
        </Button>
      </header>

      <main className="min-h-0 flex-1 overflow-auto">
        {kind === "pdf" ? (
          <PdfPages src={src} page={page} />
        ) : kind === "image" && !imageFailed ? (
          <div className="flex min-h-full items-center justify-center p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- served from a private, auth-gated route */}
            <img src={src} alt={name} onError={() => setImageFailed(true)} className="max-h-full max-w-full object-contain" />
          </div>
        ) : (
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-6 py-16 text-center">
            <FileQuestion className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              {kind === "image" ? "This picture can't be shown here." : "This kind of file can't be previewed here."}
            </p>
            <Button render={<a href={src} download={name} />}>
              <Download /> Download
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}
