import { NextRequest, NextResponse } from "next/server"
import { paperlessRoute } from "@/lib/paperless/config"
import { paperlessErrorResponse } from "@/lib/paperless/http"

const IMAGE_TYPES = new Set(["image/webp", "image/png", "image/jpeg"])

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied, client } = await paperlessRoute()
  if (denied) return denied

  const raw = (await params).id
  const id = /^\d+$/.test(raw) ? Number(raw) : NaN
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

  try {
    const { bytes, contentType } = await client.thumb(id)
    // Never echo upstream's type: only an image type we know is served.
    const type = contentType.split(";")[0].trim().toLowerCase()
    if (!IMAGE_TYPES.has(type)) {
      return NextResponse.json({ error: "Paperless-ngx returned an unexpected response." }, { status: 502 })
    }
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": type,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
      },
    })
  } catch (error) {
    return paperlessErrorResponse(error)
  }
}
