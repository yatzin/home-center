"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

export async function markNotificationRead(id: string) {
  const session = await auth()
  if (!session) redirect("/login")
  await prisma.notification.update({ where: { id, userId: session.user.id }, data: { isRead: true } })
  revalidatePath("/notifications")
}

export async function markAllNotificationsRead() {
  const session = await auth()
  if (!session) redirect("/login")
  await prisma.notification.updateMany({ where: { userId: session.user.id, isRead: false }, data: { isRead: true } })
  revalidatePath("/notifications")
}
