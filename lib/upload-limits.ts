// Upload size limits, checked from the request headers before the body is read.
// request.formData() buffers the whole body in memory, so the size has to be
// known first or one oversized request could exhaust the server.

export const DEFAULT_MAX_UPLOAD_BYTES = 26_214_400 // 25 MiB

// Room for the multipart boundaries, part headers and the small text fields
// that travel with the file.
export const MULTIPART_SLACK = 64 * 1024

export function maxUploadBytes(raw: string | undefined = process.env.MAX_UPLOAD_BYTES): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX_UPLOAD_BYTES
}

/** Why the body must not be read, or null when its declared size is acceptable. */
export function oversizedBody(headers: Headers, maxBytes: number): { status: 411 | 413; error: string } | null {
  const raw = headers.get("content-length")
  const length = raw === null || raw.trim() === "" ? NaN : Number(raw)
  // Node stops reading at the declared length, so a declared length is a real
  // bound; a body without one (chunked) could be any size.
  if (!Number.isInteger(length) || length < 0) return { status: 411, error: "Upload size unknown." }
  if (length > maxBytes + MULTIPART_SLACK) {
    return { status: 413, error: `File exceeds maximum size of ${Math.round(maxBytes / 1024 / 1024)} MB.` }
  }
  return null
}
