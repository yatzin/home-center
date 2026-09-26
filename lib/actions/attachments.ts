"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { rm } from "fs/promises"
import { attachmentDir } from "@/lib/attachment-location"
import { resolveUploadPath } from "@/lib/upload-path"

export async function deleteAttachment(id: string) {
  const session = await auth()
  if (!session) redirect("/login")

  const attachment = await prisma.attachment.findUnique({ where: { id } })
  if (!attachment) return { error: "Not found" }

  await prisma.attachment.delete({ where: { id } })

  const dir = attachmentDir(attachment)
  if (dir) await rm(resolveUploadPath(...dir, attachment.filename), { force: true })

  revalidatePath("/records")
  revalidatePath("/warranties")
  return { success: true }
}
