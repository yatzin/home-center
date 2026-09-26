// The only file types an upload may be stored as. The stored extension and the
// served MIME type both come from this table, never from what the client sent,
// so a file named "x.html" cannot land on disk as HTML.
export const UPLOAD_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
}

export function extensionForFilename(name: string): string | null {
  const dot = name.lastIndexOf(".")
  if (dot < 0) return null
  const ext = name.slice(dot).toLowerCase()
  return ext in UPLOAD_TYPES ? ext : null
}

export function mimeForFilename(name: string): string | null {
  const ext = extensionForFilename(name)
  return ext ? UPLOAD_TYPES[ext] : null
}
