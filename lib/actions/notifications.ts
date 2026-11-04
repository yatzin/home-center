"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { ignoreGone } from "@/lib/gone"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

async function userId() {
  const session = await auth()
  if (!session) redirect("/login")
  return session.user.id
}

/** Hides it from the list and the bell, and stops it being emailed, pushed or raised again. */
export async function dismissNotification(id: string) {
  const uid = await userId()
  await ignoreGone(() => prisma.notification.update({
    where: { id, userId: uid },
    data: { dismissedAt: new Date() },
  }))
  revalidatePath("/", "layout")
}

/** Brings a dismissed notification back into the list. */
export async function restoreNotification(id: string) {
  const uid = await userId()
  await ignoreGone(() => prisma.notification.update({ where: { id, userId: uid }, data: { dismissedAt: null } }))
  revalidatePath("/", "layout")
}
