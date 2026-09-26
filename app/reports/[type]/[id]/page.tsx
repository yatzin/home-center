import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import { AssetReport } from "@/components/report/asset-report"
import { PrintButton } from "@/components/report/print-button"
import { assetHref } from "@/lib/assets"
import { loadReport, parseAssetSegment } from "@/lib/report-server"

// Deliberately outside the (app) route group. That layout is a fixed-height
// shell with a sidebar and `overflow-hidden`, which is right for an application
// and wrong for a document that has to flow onto as many pages as it needs.
// Access is unchanged: proxy.ts gates every route that is not explicitly public.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string; id: string }>
}): Promise<Metadata> {
  const { type, id } = await params
  const assetType = parseAssetSegment(type)
  if (!assetType) return { title: "Report" }
  const data = await loadReport(assetType, id)
  // The document title is what the browser puts on the printed page and offers
  // as the PDF's filename, so it is worth getting right.
  return { title: data ? `${data.asset.name} — ${assetType === "PERSON" ? "Medical Summary" : "Asset Report"}` : "Report" }
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ type: string; id: string }>
}) {
  const { type, id } = await params
  const assetType = parseAssetSegment(type)
  if (!assetType) notFound()

  const data = await loadReport(assetType, id)
  if (!data) notFound()

  return (
    <div className="min-h-svh bg-muted/40 py-8 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-5 flex w-full max-w-[8.5in] items-center justify-between gap-4 px-10">
        <Link
          href={assetHref(assetType, id)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to {data.asset.name}
        </Link>
        <PrintButton />
      </div>

      <AssetReport data={data} />
    </div>
  )
}
