"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Search, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { searchHref } from "@/lib/search/href"

// The header's search box. Semantic search is off unless switched on for this
// search; it isn't remembered between visits.
export function GlobalSearch({ className }: { className?: string }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const onSearchPage = pathname === "/search"
  const urlQ = onSearchPage ? (params.get("q") ?? "") : ""
  const urlSemantic = onSearchPage && params.get("semantic") === "1"
  // Remounting on a URL change (back/forward, the page's own links) resets the box to match.
  return (
    <SearchForm
      key={`${urlSemantic ? 1 : 0}:${urlQ}`}
      className={className}
      onSearchPage={onSearchPage}
      urlQ={urlQ}
      urlSemantic={urlSemantic}
    />
  )
}

function SearchForm({
  className, onSearchPage, urlQ, urlSemantic,
}: { className?: string; onSearchPage: boolean; urlQ: string; urlSemantic: boolean }) {
  const router = useRouter()
  const [q, setQ] = useState(urlQ)
  const [semantic, setSemantic] = useState(urlSemantic)
  const input = useRef<HTMLInputElement>(null)

  // "/" focuses the box, as on most sites, unless the user is already typing somewhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return
      e.preventDefault()
      input.current?.focus()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  function go(nextQ: string, nextSemantic: boolean) {
    const trimmed = nextQ.trim()
    if (!trimmed) return
    router.push(searchHref(trimmed, nextSemantic))
  }

  function toggleSemantic() {
    const next = !semantic
    setSemantic(next)
    // On the results page, flipping the switch re-runs the current search.
    if (onSearchPage && urlQ) go(urlQ, next)
  }

  return (
    <form
      role="search"
      className={cn(
        "flex h-9 w-full items-center gap-1 rounded-lg border border-input bg-background/70 pl-2.5 pr-1 shadow-xs transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
        className
      )}
      onSubmit={(e) => {
        e.preventDefault()
        go(q, semantic)
      }}
    >
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <input
        ref={input}
        type="search"
        name="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search everything…"
        aria-label="Search everything"
        className="h-full min-w-0 flex-1 bg-transparent px-1.5 text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
      />
      <button
        type="button"
        role="switch"
        aria-checked={semantic}
        onClick={toggleSemantic}
        title={semantic ? "Semantic search on: also finds documents by meaning" : "Semantic search off: keywords only"}
        className={cn(
          "inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors",
          semantic ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span className="hidden md:inline">Semantic</span>
      </button>
    </form>
  )
}
