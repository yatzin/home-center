import { prisma } from "@/lib/prisma"
import { attachmentDir } from "@/lib/attachment-location"
import { resolveUploadPath } from "@/lib/upload-path"
import { extensionForFilename } from "@/lib/upload-types"
import { loadDocumentSettings } from "./settings"
import { EXTRACTOR_VERSION, MAX_ATTEMPTS } from "./limits"
import type { IndexerStore } from "./indexer"

// updateMany everywhere: an attachment deleted while its file was being read
// must turn the save into a no-op, not an exception.

const CLEARED = { method: null, text: null, pageCount: null, charCount: null, truncated: false } as const

export const prismaIndexerStore: IndexerStore = {
  settings: loadDocumentSettings,

  async loadJob(id) {
    const row = await prisma.attachmentText.findUnique({ where: { attachmentId: id }, include: { attachment: true } })
    if (!row) return null
    const a = row.attachment
    const dir = attachmentDir(a)
    let filePath: string | null = null
    if (dir) {
      try {
        filePath = resolveUploadPath(...dir, a.filename)
      } catch {
        filePath = null
      }
    }
    return {
      attachmentId: id,
      filePath,
      ext: extensionForFilename(a.filename),
      originalName: a.originalName,
      recordType: a.recordType,
      attempts: row.attempts,
    }
  },

  async claim(id) {
    await prisma.attachmentText.updateMany({ where: { attachmentId: id }, data: { attempts: { increment: 1 } } })
  },

  async save(id, r) {
    const base = { status: r.status, extractorVersion: EXTRACTOR_VERSION, extractedAt: new Date() }
    const where = { attachmentId: id }
    if (r.status === "DONE") {
      await prisma.attachmentText.updateMany({
        where,
        data: { ...base, method: r.method, text: r.text, pageCount: r.pageCount, charCount: r.text.length, truncated: r.truncated, error: null, attempts: 0 },
      })
    } else if (r.status === "FAILED") {
      // claim() already counted this attempt.
      await prisma.attachmentText.updateMany({ where, data: { ...base, ...CLEARED, error: r.error } })
    } else {
      await prisma.attachmentText.updateMany({ where, data: { ...base, ...CLEARED, error: null, attempts: 0 } })
    }
  },

  async ensureRows() {
    const missing = await prisma.attachment.findMany({ where: { text: { is: null } }, select: { id: true } })
    if (!missing.length) return
    try {
      await prisma.attachmentText.createMany({ data: missing.map((m) => ({ attachmentId: m.id })) })
    } catch {
      // An upload created one of these rows at the same moment; the next pass gets the rest.
    }
  },

  async attachmentIds() {
    const rows = await prisma.attachment.findMany({ select: { id: true } })
    return new Set(rows.map((r) => r.id))
  },

  async doneIds() {
    const rows = await prisma.attachmentText.findMany({ where: { status: "DONE" }, select: { attachmentId: true } })
    return rows.map((r) => r.attachmentId)
  },

  async dueIds() {
    const rows = await prisma.attachmentText.findMany({
      where: {
        // attempts counts tries that never succeeded — including ones where the
        // process died mid-file — so a poison file stops being picked up.
        attempts: { lt: MAX_ATTEMPTS },
        OR: [{ status: "PENDING" }, { status: "FAILED" }, { extractorVersion: { lt: EXTRACTOR_VERSION } }],
      },
      select: { attachmentId: true },
    })
    return rows.map((r) => r.attachmentId)
  },

  async loadText(id) {
    const row = await prisma.attachmentText.findUnique({
      where: { attachmentId: id },
      select: { text: true, attachment: { select: { originalName: true, recordType: true } } },
    })
    return row?.text ? { text: row.text, originalName: row.attachment.originalName, recordType: row.attachment.recordType } : null
  },
}
