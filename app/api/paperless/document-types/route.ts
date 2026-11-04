import { NextRequest, NextResponse } from "next/server"
import { paperlessRoute } from "@/lib/paperless/config"
import { paperlessErrorResponse } from "@/lib/paperless/http"

export async function GET(request: NextRequest) {
  const { denied, client } = await paperlessRoute()
  if (denied) return denied

  const name = (request.nextUrl.searchParams.get("name") ?? "").trim().slice(0, 100).trim()
  try {
    const results = await client.documentTypes({ name: name || undefined })
    return NextResponse.json({ results }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    return paperlessErrorResponse(error)
  }
}
