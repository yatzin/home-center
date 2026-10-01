import { prisma } from "@/lib/prisma"

export const DOCUMENT_SETTINGS_ID = "singleton"

export type DocumentSettingsValue = {
  indexingEnabled: boolean
  ocrEnabled: boolean
  semanticEnabled: boolean
  embeddingModel: string
}

/** The singleton row, or the defaults when nobody has saved it yet. */
export async function loadDocumentSettings(): Promise<DocumentSettingsValue> {
  const row = await prisma.documentSettings.findUnique({ where: { id: DOCUMENT_SETTINGS_ID } })
  return {
    indexingEnabled: row?.indexingEnabled ?? true,
    ocrEnabled: row?.ocrEnabled ?? true,
    semanticEnabled: row?.semanticEnabled ?? true,
    embeddingModel: row?.embeddingModel ?? "bge-small-en-v1.5",
  }
}
