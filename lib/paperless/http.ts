import { NextResponse } from "next/server"
import { PaperlessError } from "./client"
import { PaperlessImportError, UPSTREAM_MESSAGES, type PaperlessImportErrorCode } from "./import-server"

const STATUS: Record<PaperlessImportErrorCode, number> = {
  ALREADY_IMPORTED: 409,
  RECORD_NOT_FOUND: 404,
  TYPE_NOT_ALLOWED: 400,
  TOO_LARGE: 400,
  UPSTREAM: 502,
}

/** Fixed messages only: never the token and never raw upstream text. Unknown errors rethrow. */
export function paperlessErrorResponse(error: unknown): NextResponse {
  if (error instanceof PaperlessImportError) {
    return NextResponse.json({ error: error.message }, { status: STATUS[error.code] })
  }
  if (error instanceof PaperlessError) {
    return NextResponse.json({ error: UPSTREAM_MESSAGES[error.kind] }, { status: 502 })
  }
  throw error
}
