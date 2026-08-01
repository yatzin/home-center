"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { rm } from "fs/promises"
import path from "path"

export async function deleteAttachment(
  id: string,
  recordId: string,
  recordType: "SERVICE" | "WARRANTY" | "MAINTENANCE"
) {
  const session = await auth()
  if (!session) redirect("/login")

  const attachment = await prisma.attachment.findUnique({ where: { id } })
  if (!attachment) return { error: "Not found" }

  const uploadDir = process.env.UPLOAD_DIR ?? "./uploads"
  const filePath = path.join(uploadDir, recordType.toLowerCase(), recordId, attachment.filename)
  await rm(filePath, { force: true })

  await prisma.attachment.delete({ where: { id } })

  revalidatePath("/records")
  revalidatePath("/warranties")
  return { success: true }
}
