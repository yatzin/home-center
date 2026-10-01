import Link from "next/link"
import { SearchX, Sparkles } from "lucide-react"
import { globalSearch } from "@/lib/search/global-server"
import type { Section, SemanticState } from "@/lib/search/types"
import { AssetCard, DocumentCard, RecordCard } from "@/components/search/result-cards"
import { searchHref } from "@/lib/search/href"

export const metadata = { title: "Search" }

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ""

const GRID: Record<Section["layout"], string> = {
  assets: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4",
  records: "grid gap-3 md:grid-cols-2 2xl:grid-cols-3",
  documents: "grid gap-3 lg:grid-cols-2",
}

function SectionBlock({ section, terms, sub }: { section: Section; terms: string[]; sub?: boolean }) {
  return (
    <section id={section.key} className="scroll-mt-4 space-y-3">
      <div className="flex items-baseline gap-2">
        {sub ? (
          <h3 className="font-heading text-base font-semibold">{section.title}</h3>
        ) : (
          <h2 className="font-heading text-lg font-semibold">{section.title}</h2>
        )}
        <span className="text-sm text-muted-foreground">
          {section.items.length}
          {section.more ? "+" : ""}
        </span>
      </div>
      <div className={GRID[section.layout]}>
        {section.layout === "assets" && section.items.map((item) => <AssetCard key={item.id} item={item} terms={terms} />)}
        {section.layout === "records" && section.items.map((item) => <RecordCard key={`${item.kind}:${item.id}`} item={item} terms={terms} />)}
        {section.layout === "documents" && section.items.map((item) => <DocumentCard key={item.attachmentId} item={item} terms={terms} />)}
      </div>
      {section.more && (
        <p className="text-xs text-muted-foreground">Showing the first {section.items.length}. Add words to narrow the search.</p>
      )}
    </section>
  )
}

function SemanticNote({ state, q }: { state: SemanticState; q: string }) {
  const box = "flex items-start gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground"
  switch (state.state) {
    case "off":
      return (
        <p className={box}>
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Keyword results only.{" "}
            <Link href={searchHref(q, true)} className="font-medium text-foreground underline-offset-4 hover:underline">
              Turn on semantic search
            </Link>{" "}
            to also find records and documents related by meaning.
          </span>
        </p>
      )
    case "unavailable":
      return (
        <p className={box}>
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Semantic search isn&apos;t ready. Turn it on and install a model under{" "}
            <Link href="/settings" className="font-medium text-foreground underline-offset-4 hover:underline">Settings → Documents</Link>
            , then let indexing finish.
          </span>
        </p>
      )
    case "failed":
      return (
        <p className={box}>
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Semantic search failed this time, so only keyword results are shown.</span>
        </p>
      )
    case "ok":
      return state.sections.length ? null : (
        <p className={box}>
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Nothing else is close in meaning beyond the keyword matches above.</span>
        </p>
      )
  }
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const q = first(params.q).trim()
  const semantic = first(params.semantic) === "1"

  if (!q) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center text-muted-foreground">
        <h1 className="font-heading text-2xl font-semibold text-foreground">Search</h1>
        <p className="mt-2 text-sm">
          Use the search box at the top to look across properties, vehicles, equipment, people, records and the text of
          uploaded documents.
        </p>
      </div>
    )
  }

  const results = await globalSearch(q, { semantic })
  const semanticSections = results.semantic.state === "ok" ? results.semantic.sections : []
  const jump = [
    ...results.sections.map((s) => ({ key: s.key, title: s.title, count: `${s.items.length}${s.more ? "+" : ""}`, semantic: false })),
    ...(semanticSections.length
      ? [{ key: "semantic", title: "Related by meaning", count: String(semanticSections.reduce((n, s) => n + s.items.length, 0)), semantic: true }]
      : []),
  ]

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">
            Results for <span className="text-primary">&ldquo;{results.query}&rdquo;</span>
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {results.total} {results.total === 1 ? "match" : "matches"}
            {semantic ? " · keyword + semantic" : " · keyword"}
          </p>
        </div>
        {jump.length > 1 && (
          <nav aria-label="Result sections" className="flex flex-wrap gap-1.5">
            {jump.map((s) => (
              <a
                key={s.key}
                href={`#${s.key}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1 text-xs font-medium hover:bg-muted"
              >
                {s.semantic && <Sparkles className="h-3 w-3" />}
                {s.title}
                <span className="text-muted-foreground">{s.count}</span>
              </a>
            ))}
          </nav>
        )}
      </div>

      {results.sections.length === 0 && semanticSections.length === 0 && (
        <div className="flex flex-col items-center rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          <SearchX className="h-8 w-8" strokeWidth={1.5} />
          <p className="mt-3 font-medium text-foreground">Nothing matched &ldquo;{results.query}&rdquo;</p>
          <p className="mt-1 text-sm">Try fewer or different words{semantic ? "" : ", or turn on semantic search"}.</p>
        </div>
      )}

      {results.sections.map((s) => <SectionBlock key={s.key} section={s} terms={results.terms} />)}

      {semanticSections.length > 0 && (
        <div id="semantic" className="scroll-mt-4 space-y-6 rounded-2xl border border-primary/20 bg-primary/[0.03] p-4 sm:p-5">
          <div>
            <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
              <Sparkles className="h-4 w-4 text-primary" /> Related by meaning
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Close in meaning to &ldquo;{results.query}&rdquo; but not matched by its words. Best matches first.
            </p>
          </div>
          {semanticSections.map((s) => <SectionBlock key={s.key} section={s} terms={[]} sub />)}
        </div>
      )}
      <SemanticNote state={results.semantic} q={results.query} />
    </div>
  )
}
