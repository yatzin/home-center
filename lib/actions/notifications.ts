"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

async function userId() {
  const session = await auth()
  if (!session) redirect("/login")
  return session.user.id
}

export async function markNotificationRead(id: string) {
  await prisma.notification.update({ where: { id, userId: await userId() }, data: { isRead: true } })
  revalidatePath("/notifications")
}

export async function markAllNotificationsRead() {
  await prisma.notification.updateMany({ where: { userId: await userId(), isRead: false }, data: { isRead: true } })
  revalidatePath("/notifications")
}

/** Hides it from the list and the bell. Dismissing also counts as reading it. */
export async function dismissNotification(id: string) {
  await prisma.notification.update({
    where: { id, userId: await userId() },
    data: { isRead: true, dismissedAt: new Date() },
  })
  revalidatePath("/", "layout")
}

/** Brings a dismissed notification back into the list. */
export async function restoreNotification(id: string) {
  await prisma.notification.update({ where: { id, userId: await userId() }, data: { dismissedAt: null } })
  revalidatePath("/", "layout")
}
