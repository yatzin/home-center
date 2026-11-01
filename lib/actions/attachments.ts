"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { attachmentDir } from "@/lib/attachment-location"
import { removeUploadDir } from "@/lib/upload-fs"
import { reindexMovedDocuments, searchIndex } from "@/lib/documents/indexer-server"
import { cleanAttachmentName } from "@/lib/attachment-name"

/** Changes the name shown for a file. The stored file is untouched; the search index picks up the new name. */
export async function renameAttachment(id: string, newName: string): Promise<{ error: string } | { success: true; name: string }> {
  const session = await auth()
  if (!session) redirect("/login")

  const attachment = await prisma.attachment.findUnique({ where: { id }, select: { id: true, originalName: true } })
  if (!attachment) return { error: "Not found" }
  const cleaned = cleanAttachmentName(newName, attachment.originalName)
  if ("error" in cleaned) return cleaned
  if (cleaned.name !== attachment.originalName) {
    await prisma.attachment.update({ where: { id }, data: { originalName: cleaned.name } })
    // Best effort, like delete: reconcile() covers a miss.
    await reindexMovedDocuments([id]).catch(() => {})
    revalidatePath("/records")
    revalidatePath("/warranties")
    revalidatePath("/insurance")
    revalidatePath("/assets", "layout")
  }
  return { success: true, name: cleaned.name }
}

export async function deleteAttachment(id: string) {
  const session = await auth()
  if (!session) redirect("/login")

  const attachment = await prisma.attachment.findUnique({ where: { id } })
  if (!attachment) return { error: "Not found" }

  await prisma.attachment.delete({ where: { id } })

  const dir = attachmentDir(attachment)
  if (dir) await removeUploadDir(...dir, attachment.filename)
  // Best effort: reconcile() removes anything left behind.
  await searchIndex().then((index) => index.remove([id])).catch(() => {})

  revalidatePath("/records")
  revalidatePath("/warranties")
  revalidatePath("/insurance")
  revalidatePath("/assets", "layout")
  return { success: true }
}
