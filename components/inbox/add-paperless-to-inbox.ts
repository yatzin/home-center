"use client"

import { createInboxItem, discardInboxItem } from "@/lib/actions/inbox"
import type { AssetType } from "@/app/generated/prisma/client"

/**
 * One Paperless document -> one inbox item, like addFileToInbox does for a file.
 * Resolves with the new item's id. On any failure the empty item is discarded and
 * the error is rethrown with the server's text (a fixed phrase, never token-related).
 */
export async function addPaperlessToInbox(
  documentId: number,
  asset?: { assetType: AssetType; assetId: string },
): Promise<string> {
  const itemId = (await createInboxItem(asset)).id
  try {
    const res = await fetch("/api/paperless/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, recordType: "INBOX", recordId: itemId }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Couldn't import from Paperless.")
    return itemId
  } catch (error) {
    await discardInboxItem(itemId).catch(() => {})
    throw error instanceof Error ? error : new Error("Couldn't import from Paperless.")
  }
}
