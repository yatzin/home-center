import { prisma } from "@/lib/prisma"
import type { NotificationType } from "@/app/generated/prisma/client"

export interface NotificationPayload {
  userId: string
  type: NotificationType
  title: string
  message: string
  relatedEntityId?: string
  relatedEntityType?: string
  cycleKey?: string
  stage?: string
}

export interface NotificationChannel {
  send(payload: NotificationPayload): Promise<void>
}

export class InAppChannel implements NotificationChannel {
  async send(payload: NotificationPayload) {
    await prisma.notification.create({ data: payload })
  }
}

// Email deliberately isn't a channel. This interface is per-notification, so an
// email channel would send one message per due item; a check that finds six
// would send six. Email is a digest instead — see ./digest.ts, which reads what
// InAppChannel wrote and sends one message covering all of it.

export class NotificationService {
  constructor(private channels: NotificationChannel[]) {}

  async send(payload: NotificationPayload) {
    await Promise.all(this.channels.map((ch) => ch.send(payload)))
  }
}

export const notificationService = new NotificationService([new InAppChannel()])
