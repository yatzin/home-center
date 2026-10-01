export type ExtractMethod = "TEXT" | "OCR" | "MIXED"

export type Extracted =
  | { kind: "unsupported" }
  | { kind: "text"; method: ExtractMethod; pages: string[] }

/**
 * A failure whose message is a fixed phrase, safe to store in
 * AttachmentText.error and show in Settings — never parser output, which can
 * carry document text.
 */
export class ExtractError extends Error {
  override name = "ExtractError"
}
