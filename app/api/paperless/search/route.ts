import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { paperlessRoute } from "@/lib/paperless/config"
import { paperlessErrorResponse } from "@/lib/paperless/http"

const positiveInt = z.coerce.number().int().positive()
const query = z.object({
  query: z.string().max(500).optional(),
  tag: positiveInt.optional(),
  documentType: positiveInt.optional(),
  page: positiveInt.optional(),
})

export async function GET(request: NextRequest) {
  const { denied, client } = await paperlessRoute()
  if (denied) return denied

  const sp = request.nextUrl.searchParams
  const parsed = query.safeParse({
    query: sp.get("query") || undefined,
    tag: sp.get("tag") || undefined,
    documentType: sp.get("documentType") || undefined,
    page: sp.get("page") || undefined,
  })
  if (!parsed.success) return NextResponse.json({ error: "Invalid search" }, { status: 400 })

  try {
    const { count, results } = await client.search(parsed.data)
    return NextResponse.json({ count, results })
  } catch (error) {
    return paperlessErrorResponse(error)
  }
}
