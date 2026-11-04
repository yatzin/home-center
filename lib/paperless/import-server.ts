import { mkdir, rm, rmdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { attachmentDir } from "@/lib/attachment-location"
import { resolveUploadPath } from "@/lib/upload-path"
import { maxUploadBytes } from "@/lib/upload-limits"
import { extensionForFilename, mimeForFilename } from "@/lib/upload-types"
import { EXTRACTOR_VERSION, MAX_TEXT_CHARS } from "@/lib/documents/limits"
import { enqueueDocument, reindexMovedDocuments } from "@/lib/documents/indexer-server"
import { loadDocumentSettings } from "@/lib/documents/settings"
import { processInboxItem } from "@/lib/capture-server"
import { attachmentRecordFields, resolveAttachmentRecord } from "@/lib/attachments/create-server"
import type { AttachmentRecordType } from "@/app/generated/prisma/client"
import { PaperlessError, type PaperlessClient, type PaperlessErrorKind } from "./client"
import { hashText, newestVersion } from "./diff"

export type PaperlessImportErrorCode = "TYPE_NOT_ALLOWED" | "TOO_LARGE" | "ALREADY_IMPORTED" | "RECORD_NOT_FOUND" | "UPSTREAM"

const MESSAGES: Record<PaperlessImportErrorCode, string> = {
  TYPE_NOT_ALLOWED: "This file type cannot be imported.",
  TOO_LARGE: "This file is too large to import.",
  ALREADY_IMPORTED: "This document is already attached to this record.",
  RECORD_NOT_FOUND: "Record not found.",
  UPSTREAM: "Paperless-ngx could not be reached.",
}

export const UPSTREAM_MESSAGES: Record<PaperlessErrorKind, string> = {
  unreachable: "Paperless-ngx could not be reached.",
  unauthorized: "Paperless-ngx rejected the access token. Ask an administrator to check the token in settings.",
  not_found: "That document was not found in Paperless-ngx.",
  bad_response: "Paperless-ngx returned an unexpected response.",
  too_large: MESSAGES.TOO_LARGE,
}

/** Fixed user-facing messages only: never the token and never raw upstream text. */
export class PaperlessImportError extends Error {
  code: PaperlessImportErrorCode
  constructor(code: PaperlessImportErrorCode, message?: string) {
    super(message ?? MESSAGES[code])
    this.name = "PaperlessImportError"
    this.code = code
  }
  toJSON() {
    return { name: this.name, code: this.code, message: this.message }
  }
}

function upstream(error: unknown): PaperlessImportError | unknown {
  if (error instanceof PaperlessError) {
    if (error.kind === "too_large") return new PaperlessImportError("TOO_LARGE")
    return new PaperlessImportError("UPSTREAM", UPSTREAM_MESSAGES[error.kind])
  }
  return error
}

export async function importPaperlessDocument(args: {
  client: PaperlessClient
  documentId: number
  recordType: AttachmentRecordType
  recordId: string
  userId: string
}): Promise<{ attachmentId: string }> {
  const { client, documentId, recordType, recordId, userId } = args

  const resolved = await resolveAttachmentRecord(recordType, recordId)
  if (!resolved.found) throw new PaperlessImportError("RECORD_NOT_FOUND")

  const fields = attachmentRecordFields(recordType, recordId, resolved.assetType)
  const here = Object.fromEntries(Object.entries(fields).filter(([k, v]) => v !== null && k !== "assetType"))
  const alreadyThere = async (paperlessId: number) =>
    !!(await prisma.attachment.findFirst({ where: { paperlessId, ...here }, select: { id: true } }))

  if (await alreadyThere(documentId)) throw new PaperlessImportError("ALREADY_IMPORTED")

  let bytes: Buffer
  let doc
  let versionId: number | undefined
  let checksum: string | null = null
  try {
    doc = await client.getDocument(documentId)
    if (doc.deletedAt) throw new PaperlessError("not_found")
    // The pointer is the root document; a version id resolves to its root.
    if (doc.rootId !== doc.id) {
      if (await alreadyThere(doc.rootId)) throw new PaperlessImportError("ALREADY_IMPORTED")
      doc = await client.getDocument(doc.rootId)
    }
    // A trashed document counts as missing.
    if (doc.deletedAt) throw new PaperlessError("not_found")

    const ext = extensionForFilename(doc.originalFileName)
    const mime = mimeForFilename(doc.originalFileName)
    if (!ext || !mime) throw new PaperlessImportError("TYPE_NOT_ALLOWED")

    const newest = newestVersion(doc.versions)
    versionId = newest?.id
    checksum = newest?.checksum ?? null
    ;({ bytes } = await client.downloadOriginal(doc.rootId, maxUploadBytes(), versionId))
  } catch (error) {
    throw upstream(error)
  }

  const ext = extensionForFilename(doc.originalFileName)!
  const dir = attachmentDir(fields)
  if (!dir) throw new PaperlessImportError("RECORD_NOT_FOUND")
  const dirPath = resolveUploadPath(...dir)
  const filename = `${randomUUID()}${ext}`
  const filePath = path.join(dirPath, filename)
  const content = doc.content
  const hasText = content.trim().length > 0
  let attachmentId: string
  let createdDir: string | undefined
  try {
    createdDir = await mkdir(dirPath, { recursive: true })
    await writeFile(filePath, bytes)
    const attachment = await prisma.attachment.create({
      data: {
        ...fields,
        filename,
        originalName: doc.originalFileName,
        mimeType: mimeForFilename(doc.originalFileName)!,
        sizeBytes: bytes.length,
        uploadedById: userId,
        source: "PAPERLESS",
        paperlessId: doc.rootId,
        paperlessVersionId: versionId ?? null,
        paperlessChecksum: checksum,
        paperlessTextHash: hashText(content),
        paperlessLinkStatus: "OK",
        paperlessSyncedAt: new Date(),
        text: {
          create: hasText
            ? {
                status: "DONE",
                method: "TEXT",
                text: content.slice(0, MAX_TEXT_CHARS),
                truncated: content.length > MAX_TEXT_CHARS,
                pageCount: doc.pageCount,
                charCount: Math.min(content.length, MAX_TEXT_CHARS),
                extractorVersion: EXTRACTOR_VERSION,
                extractedAt: new Date(),
              }
            : {},
        },
      },
      select: { id: true },
    })
    attachmentId = attachment.id
  } catch (error) {
    await rm(filePath, { force: true }).catch(() => {})
    // Only a directory this import created, and only while empty.
    if (createdDir) await rmdir(dirPath).catch(() => {})
    throw error
  }

  // The row exists now; the indexer's queue and reconcile pick up anything that fails here.
  try {
    if (hasText) await reindexMovedDocuments([attachmentId])
    else enqueueDocument(attachmentId)
    // The indexer's "processed" hook settles an Intake item only after it extracts a file,
    // and reindexMovedDocuments never fires it, so text already present is settled here.
    // Empty content goes through the queue (hook fires), unless indexing is off.
    if (recordType === "INBOX" && (hasText || !(await loadDocumentSettings()).indexingEnabled)) await processInboxItem(recordId)
  } catch (error) {
    console.error("[paperless] post-import indexing failed:", error instanceof Error ? error.name : "unknown")
  }
  return { attachmentId }
}
