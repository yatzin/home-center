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
import { downloads, loadModelStatus, unloadEmbedder, type ModelStatus } from "@/lib/documents/embed/server"
import { deleteModelFiles, isInstalled } from "@/lib/documents/embed/files"
import { modelById } from "@/lib/documents/embed/models"

export type DocumentActionResult = { error: string } | { success: true; stats: string }

async function requireAdmin() {
  const session = await auth()
  if (!session) redirect("/login")
  if (session.user.role !== "ADMIN") redirect("/")
  return session
}

const schema = z.object({ indexingEnabled: z.boolean(), ocrEnabled: z.boolean(), semanticEnabled: z.boolean() })

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
  if (!parsed.data.semanticEnabled) await unloadEmbedder()
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

export async function getModelStatus(): Promise<ModelStatus> {
  await requireAdmin()
  return loadModelStatus()
}

export async function downloadEmbeddingModel(id: string): Promise<{ error: string } | { success: true }> {
  await requireAdmin()
  const m = modelById(id)
  if (!m || m.builtIn) return { error: "Unknown model." }
  if (await isInstalled(m)) return { success: true }
  const started = downloads().start(m)
  return "error" in started ? started : { success: true }
}

export async function switchEmbeddingModel(id: string): Promise<DocumentActionResult> {
  await requireAdmin()
  const m = modelById(id)
  if (!m) return { error: "Unknown model." }
  if (!(await isInstalled(m))) return { error: "Download the model first." }
  await prisma.documentSettings.upsert({
    where: { id: DOCUMENT_SETTINGS_ID },
    create: { id: DOCUMENT_SETTINGS_ID, embeddingModel: m.id },
    update: { embeddingModel: m.id },
  })
  await unloadEmbedder()
  // Reconcile switches the index to the new model and re-embeds in the background.
  void documentIndexer().reconcile()
  revalidatePath("/settings")
  return { success: true, stats: await documentIndexStats() }
}

export async function deleteEmbeddingModel(id: string): Promise<{ error: string } | { success: true }> {
  await requireAdmin()
  const m = modelById(id)
  if (!m) return { error: "Unknown model." }
  if (m.builtIn) return { error: "The built-in model can't be deleted." }
  if ((await loadDocumentSettings()).embeddingModel === m.id) return { error: "Switch to another model before deleting this one." }
  if (downloads().status().current?.modelId === m.id) return { error: "Wait for the download to finish." }
  await deleteModelFiles(m)
  return { success: true }
}
