import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { FileViewer } from "@/components/attachments/file-viewer"
import { parseViewerSrc } from "@/lib/file-viewer"

// Where files open inside the installed app (components/attachments/file-link.tsx).
// Outside the (app) route group so the file gets the whole screen, like app/reports.
// Access is unchanged: proxy.ts gates every route that is not explicitly public, and
// the file itself is still served by the auth-checked /api/files route.

export const metadata: Metadata = { title: "File" }

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default async function ViewPage({ searchParams }: { searchParams: Promise<{ src?: string | string[]; name?: string | string[] }> }) {
  const params = await searchParams
  const src = parseViewerSrc(first(params.src))
  if (!src) notFound()
  const fallbackName = src.path.slice(src.path.lastIndexOf("/") + 1)
  const name = (first(params.name) ?? "").trim().slice(0, 200) || fallbackName
  return <FileViewer src={src.path} name={name} page={src.page} />
}
