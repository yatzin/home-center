import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { paperlessRoute } from "@/lib/paperless/config"
import { importPaperlessDocument } from "@/lib/paperless/import-server"
import { paperlessErrorResponse } from "@/lib/paperless/http"
import { RECORD_TYPES } from "@/lib/attachments/create-server"

const body = z.object({
  documentId: z.number().int().positive(),
  recordType: z.enum(RECORD_TYPES),
  recordId: z.string().min(1),
})

export async function POST(request: NextRequest) {
  const route = await paperlessRoute()
  if (route.denied) return route.denied
  const { client, session } = route

  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 })

  try {
    const { attachmentId } = await importPaperlessDocument({ client, ...parsed.data, userId: session.user.id })
    return NextResponse.json({ attachmentId })
  } catch (error) {
    return paperlessErrorResponse(error)
  }
}
