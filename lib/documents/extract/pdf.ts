import { extractText, getDocumentProxy, renderPageAsImage } from "unpdf"
import { MAX_OCR_PAGES } from "../limits"
import { isBlankPage } from "../normalize"
import { ExtractError, type Extracted } from "../types"
import { ocrImage } from "./ocr"

// Text layer page by page. Pages with (almost) no text are probably scans:
// with OCR on, up to MAX_OCR_PAGES of them are rendered at 2x and read.

export async function extractPdf(data: Uint8Array, opts: { ocr: boolean }): Promise<Extracted> {
  let doc: Awaited<ReturnType<typeof getDocumentProxy>>
  try {
    doc = await getDocumentProxy(data)
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException") throw new ExtractError("Password-protected PDF")
    throw new ExtractError("Not a readable PDF")
  }
  try {
    const { text } = await extractText(doc, { mergePages: false })
    const pages = [...text]
    let textPages = 0
    let ocrPages = 0
    let ocrFailures = 0
    for (let i = 0; i < pages.length; i++) {
      if (!isBlankPage(pages[i])) {
        textPages++
        continue
      }
      if (!opts.ocr || ocrPages >= MAX_OCR_PAGES) continue
      try {
        const png = await renderPageAsImage(doc, i + 1, { canvasImport: () => import("@napi-rs/canvas"), scale: 2 })
        pages[i] = await ocrImage(Buffer.from(png))
        ocrPages++
      } catch {
        // Rendering or OCR failed for this page (e.g. no canvas binary for the
        // platform): keep it blank rather than lose the pages that have text.
        ocrFailures++
      }
    }
    // Nothing had text and OCR couldn't run at all: that's a failure, not an empty file.
    if (textPages === 0 && ocrPages === 0 && ocrFailures > 0) throw new ExtractError("Couldn't OCR this scanned PDF")
    const method = ocrPages === 0 ? "TEXT" : textPages === 0 ? "OCR" : "MIXED"
    return { kind: "text", method, pages }
  } finally {
    // This pdf.js build has no proxy.destroy(); the loading task frees the document.
    await Promise.resolve()
      .then(() => doc.loadingTask.destroy())
      .catch(() => {})
  }
}
