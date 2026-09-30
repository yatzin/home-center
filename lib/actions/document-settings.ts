"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { DOCUMENT_SETTINGS_ID, loadDocumentSettings } from "@/lib/documents/settings"
import {
  clearAllText, documentIndexer, documentIndexStats, rebuildIndex, reextractAll, requeueEmptyForOcr, retryFailed,
} from "@/lib/documents/indexer-server"

export type DocumentActionResult = { error: string } | { success: true; stats: string }

async function requireAdmin() {
  const session = await auth()
  if (!session) redirect("/login")
  if (session.user.role !== "ADMIN") redirect("/")
  return session
}

const schema = z.object({ indexingEnabled: z.boolean(), ocrEnabled: z.boolean() })

export async function updateDocumentSettings(data: z.infer<typeof schema>): Promise<DocumentActionResult> {
  await requireAdmin()
  const parsed = schema.safeParse(data)
  if (!parsed.success) return { error: "Invalid input." }
  const before = await loadDocumentSettings()
  await prisma.documentSettings.upsert({
    where: { id: DOCUMENT_SETTINGS_ID },
    create: { id: DOCUMENT_SETTINGS_ID, ...parsed.data },
    update: parsed.data,
  })
  if (parsed.data.ocrEnabled && !before.ocrEnabled) await requeueEmptyForOcr()
  // Switching on (or OCR on) starts work straight away instead of at the next timer.
  if (parsed.data.indexingEnabled) void documentIndexer().reconcile()
  revalidatePath("/settings")
  return { success: true, stats: await documentIndexStats() }
}

async function withStats(work: () => Promise<void>): Promise<DocumentActionResult> {
  await requireAdmin()
  await work()
  return { success: true, stats: await documentIndexStats() }
}

export async function retryFailedDocuments(): Promise<DocumentActionResult> {
  return withStats(retryFailed)
}

export async function rebuildDocumentIndex(): Promise<DocumentActionResult> {
  return withStats(rebuildIndex)
}

export async function reextractDocuments(): Promise<DocumentActionResult> {
  return withStats(reextractAll)
}

export async function clearExtractedText(): Promise<DocumentActionResult> {
  await requireAdmin()
  if ((await loadDocumentSettings()).indexingEnabled) return { error: "Turn indexing off before clearing extracted text." }
  await clearAllText()
  return { success: true, stats: await documentIndexStats() }
}
