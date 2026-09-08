"use client"

import { Printer } from "lucide-react"

/// The only interactive thing on the report, and the only reason any of it is a
/// client component. Everything else is a document.
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
    >
      <Printer className="h-3.5 w-3.5" aria-hidden="true" />
      Print / Save as PDF
    </button>
  )
}
