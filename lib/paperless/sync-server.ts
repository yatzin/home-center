import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { attachmentDir } from "@/lib/attachment-location"
import { resolveUploadPath } from "@/lib/upload-path"
import { maxUploadBytes } from "@/lib/upload-limits"
import { extensionForFilename, mimeForFilename } from "@/lib/upload-types"
import { EXTRACTOR_VERSION, MAX_TEXT_CHARS } from "@/lib/documents/limits"
import { enqueueDocument, reindexMovedDocuments } from "@/lib/documents/indexer-server"
import { createPaperlessClient, PaperlessError, type PaperlessClient, type PaperlessDoc, type PaperlessErrorKind } from "./client"
import { loadPaperlessConfig, PAPERLESS_SETTINGS_ID } from "./config"
import { planSync, type SyncAction } from "./diff"

export type PaperlessCheckResult = {
  examined: number
  updated: number
  textRefreshed: number
  /** Became MISSING in this run; rows already MISSING are not counted again. */
  broken: number
  restored: number
  /** Left untouched this run: file type no longer allowed, too large, or a local failure. */
  skipped: number
}

type OutageKind = Extract<PaperlessErrorKind, "unreachable" | "unauthorized" | "bad_response">

/** Fixed, token-free phrases shown in settings. */
const OUTAGE_MESSAGES: Record<OutageKind, string> = {
  unreachable: "Paperless-ngx could not be reached.",
  unauthorized: "Paperless-ngx rejected the API token.",
  bad_response: "Paperless-ngx sent an unexpected response.",
}

const RUN_FAILED = "The Paperless check failed."
const NOTHING_CHECKED = "No document could be checked."

/** Ends the whole run: nothing more is changed and nothing is marked missing. */
class Outage extends Error {
  kind: OutageKind | "failed"
  constructor(kind: OutageKind | "failed") {
    super(kind === "failed" ? RUN_FAILED : OUTAGE_MESSAGES[kind])
    this.name = "PaperlessOutage"
    this.kind = kind
  }
}

function asOutage(error: unknown): Outage | null {
  if (error instanceof PaperlessError && error.kind in OUTAGE_MESSAGES) return new Outage(error.kind as OutageKind)
  return null
}

const zeros = (): PaperlessCheckResult => ({ examined: 0, updated: 0, textRefreshed: 0, broken: 0, restored: 0, skipped: 0 })

const nameOf = (error: unknown) => (error instanceof Error ? error.name : "unknown")

const LOCATION = {
  recordType: true, serviceRecordId: true, warrantyId: true, maintenanceScheduleId: true, healthConditionId: true,
  insurancePolicyId: true, observationId: true, medicationId: true, allergyId: true, immunizationId: true,
  assetId: true, inboxItemId: true, roomId: true,
} as const

async function loadRows() {
  return prisma.attachment.findMany({
    where: { source: "PAPERLESS", paperlessId: { not: null } },
    select: {
      id: true, filename: true, paperlessId: true, paperlessVersionId: true, paperlessChecksum: true,
      paperlessTextHash: true, paperlessLinkStatus: true, ...LOCATION,
    },
    orderBy: { id: "asc" },
  })
}
type Row = Awaited<ReturnType<typeof loadRows>>[number] & { paperlessId: number }

/** The AttachmentText fields for Paperless content, as an import writes them; empty content waits for extraction. */
function textFields(doc: PaperlessDoc, now: Date) {
  const content = doc.content
  if (!content.trim()) {
    return {
      hasText: false,
      data: {
        status: "PENDING" as const, method: null, text: null, truncated: false, pageCount: null, charCount: null,
        attempts: 0, error: null, extractorVersion: 0, extractedAt: null,
      },
    }
  }
  return {
    hasText: true,
    data: {
      status: "DONE" as const,
      method: "TEXT" as const,
      text: content.slice(0, MAX_TEXT_CHARS),
      truncated: content.length > MAX_TEXT_CHARS,
      pageCount: doc.pageCount,
      charCount: Math.min(content.length, MAX_TEXT_CHARS),
      extractorVersion: EXTRACTOR_VERSION,
      extractedAt: now,
      attempts: 0,
      error: null,
    },
  }
}

async function afterTextChange(id: string, hasText: boolean) {
  try {
    if (hasText) await reindexMovedDocuments([id])
    else enqueueDocument(id)
  } catch (error) {
    console.error("[paperless] reindex after sync failed:", nameOf(error))
  }
}

type Outcome = "updated" | "textRefreshed" | "broken" | "restored" | "skipped" | "unchanged"

async function replaceFile(
  client: PaperlessClient,
  row: Row,
  doc: PaperlessDoc,
  action: Extract<SyncAction, { kind: "REPLACE_FILE" }>,
  now: Date,
): Promise<Outcome> {
  const ext = extensionForFilename(doc.originalFileName)
  const mime = mimeForFilename(doc.originalFileName)
  if (!ext || !mime) return "skipped"
  const dir = attachmentDir(row)
  if (!dir) return "skipped"

  let bytes: Buffer
  try {
    ;({ bytes } = await client.downloadOriginal(row.paperlessId, maxUploadBytes(), action.versionId))
  } catch (error) {
    const outage = asOutage(error)
    if (outage) throw outage
    // too_large, or the version vanished between requests: keep our copy as it is.
    if (error instanceof PaperlessError) return "skipped"
    throw error
  }

  const dirPath = resolveUploadPath(...dir)
  const filename = `${randomUUID()}${ext}`
  const newPath = path.join(dirPath, filename)
  const oldPath = resolveUploadPath(...dir, row.filename)
  const text = textFields(doc, now)
  try {
    await mkdir(dirPath, { recursive: true })
    await writeFile(newPath, bytes)
    await prisma.attachment.update({
      where: { id: row.id },
      data: {
        filename,
        mimeType: mime,
        sizeBytes: bytes.length,
        paperlessVersionId: action.versionId,
        paperlessChecksum: action.checksum,
        paperlessTextHash: action.textHash,
        paperlessLinkStatus: "OK",
        paperlessSyncedAt: now,
        paperlessUpdatedAt: now,
        text: { upsert: { create: text.data, update: text.data } },
      },
    })
  } catch (error) {
    await rm(newPath, { force: true }).catch(() => {})
    console.error("[paperless] replacing a synced file failed:", nameOf(error))
    return "skipped"
  }
  await rm(oldPath, { force: true }).catch((error) =>
    console.error("[paperless] removing the replaced file failed:", nameOf(error)))
  await afterTextChange(row.id, text.hasText)
  return "updated"
}

async function syncRow(client: PaperlessClient, row: Row, batchDoc: PaperlessDoc | undefined, now: Date): Promise<Outcome> {
  let doc = batchDoc
  let action = planSync(row, doc)
  if (action.kind === "CONFIRM_MISSING") {
    try {
      doc = await client.getDocument(row.paperlessId)
    } catch (error) {
      const outage = asOutage(error)
      if (outage) throw outage
      // Only a confirmed 404 may mark a row missing; anything else stops the run.
      if (!(error instanceof PaperlessError && error.kind === "not_found")) {
        console.error("[paperless] confirming a missing document failed:", nameOf(error))
        throw new Outage("failed")
      }
      doc = undefined
    }
    action = planSync(row, doc)
  }

  switch (action.kind) {
    case "CONFIRM_MISSING":
      // Already reported broken on an earlier run: only note that it was looked at.
      if (row.paperlessLinkStatus === "MISSING") {
        await prisma.attachment.update({ where: { id: row.id }, data: { paperlessSyncedAt: now } })
        return "unchanged"
      }
      await prisma.attachment.update({ where: { id: row.id }, data: { paperlessLinkStatus: "MISSING", paperlessSyncedAt: now } })
      return "broken"
    case "REPLACE_FILE":
      return replaceFile(client, row, doc!, action, now)
    case "REFRESH_TEXT": {
      const text = textFields(doc!, now)
      await prisma.attachment.update({
        where: { id: row.id },
        data: {
          paperlessTextHash: action.textHash,
          paperlessSyncedAt: now,
          text: { upsert: { create: text.data, update: text.data } },
        },
      })
      await afterTextChange(row.id, text.hasText)
      return "textRefreshed"
    }
    case "RESTORE_LINK":
      await prisma.attachment.update({ where: { id: row.id }, data: { paperlessLinkStatus: "OK", paperlessSyncedAt: now } })
      return "restored"
    case "UNCHANGED":
      await prisma.attachment.update({ where: { id: row.id }, data: { paperlessSyncedAt: now } })
      return "unchanged"
  }
}

function summarize(r: PaperlessCheckResult): string {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
  return `Checked ${n(r.examined, "document", "documents")}: ${n(r.updated, "file", "files")} updated, ${r.textRefreshed} text refreshed, ${r.broken} broken${r.restored > 0 ? `, ${r.restored} restored` : ""}${r.skipped > 0 ? `, ${r.skipped} skipped` : ""}.`
}

function writeStatus(data: { lastCheckedAt: Date; lastCheckError: string | null; lastCheckSummary?: string }) {
  return prisma.paperlessSettings.upsert({
    where: { id: PAPERLESS_SETTINGS_ID },
    create: { id: PAPERLESS_SETTINGS_ID, ...data },
    update: data,
  })
}

// Per-process guard, shared by every loaded copy of this module.
const g = globalThis as unknown as { __hcPaperlessCheckRunning?: boolean }

export function isPaperlessCheckRunning(): boolean {
  return Boolean(g.__hcPaperlessCheckRunning)
}

/**
 * Compares every Paperless-backed attachment with Paperless and brings our copy
 * up to date. An outage, a rejected token or a malformed response ends the run
 * without marking anything missing. `access` does not apply here.
 */
export async function runPaperlessCheck(
  trigger: "SCHEDULE" | "MANUAL",
  deps: { client?: PaperlessClient; now?: Date } = {},
): Promise<PaperlessCheckResult> {
  if (g.__hcPaperlessCheckRunning) return zeros()
  g.__hcPaperlessCheckRunning = true
  try {
    let client = deps.client
    if (!client) {
      const cfg = await loadPaperlessConfig()
      if (!cfg.enabled || !cfg.baseUrl || !cfg.token) return zeros()
      client = createPaperlessClient({ baseUrl: cfg.baseUrl, token: cfg.token, timeoutMs: 60_000 })
    }
    const now = deps.now ?? new Date()
    const result = zeros()

    try {
      const rows = (await loadRows()) as Row[]
      const ids = [...new Set(rows.map((r) => r.paperlessId))]
      let remote: PaperlessDoc[] = []
      try {
        if (ids.length) remote = await client.getDocuments(ids)
      } catch (error) {
        // A list request has no business failing with not_found or too_large.
        throw asOutage(error) ?? (error instanceof PaperlessError ? new Outage("bad_response") : error)
      }
      const byId = new Map(remote.map((d) => [d.id, d]))

      for (const row of rows) {
        result.examined++
        let outcome: Outcome
        try {
          outcome = await syncRow(client, row, byId.get(row.paperlessId), now)
        } catch (error) {
          if (error instanceof Outage) throw error
          console.error("[paperless] sync of one attachment failed:", nameOf(error))
          outcome = "skipped"
        }
        if (outcome !== "unchanged") result[outcome]++
      }
    } catch (error) {
      if (!(error instanceof Outage)) {
        // Still counts as an attempt, so the schedule waits for the next slot.
        await writeStatus({ lastCheckedAt: now, lastCheckError: RUN_FAILED }).catch(() => {})
        throw error
      }
      console.error(`[paperless] ${trigger.toLowerCase()} check stopped: ${error.kind}`)
      await writeStatus({ lastCheckedAt: now, lastCheckError: error.message })
      return result
    }

    // Every row failing locally is a broken run, not a quiet success.
    const nothingChecked = result.examined > 0 && result.skipped === result.examined
    await writeStatus({ lastCheckedAt: now, lastCheckError: nothingChecked ? NOTHING_CHECKED : null, lastCheckSummary: summarize(result) })
    return result
  } finally {
    g.__hcPaperlessCheckRunning = false
  }
}
