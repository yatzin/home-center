import { prisma } from "@/lib/prisma"
import type { NotificationType } from "@/app/generated/prisma/client"

export interface NotificationPayload {
  userId: string
  type: NotificationType
  title: string
  message: string
  relatedEntityId?: string
  relatedEntityType?: string
}

export interface NotificationChannel {
  send(payload: NotificationPayload): Promise<void>
}

export class InAppChannel implements NotificationChannel {
  async send(payload: NotificationPayload) {
    await prisma.notification.create({ data: payload })
  }
}

// Stub — wire up nodemailer or similar here when ready
export class EmailChannel implements NotificationChannel {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async send(_payload: NotificationPayload) {
    // TODO: implement email delivery
  }
}

export class NotificationService {
  constructor(private channels: NotificationChannel[]) {}

  async send(payload: NotificationPayload) {
    await Promise.all(this.channels.map((ch) => ch.send(payload)))
  }
}

export const notificationService = new NotificationService([
  new InAppChannel(),
  // new EmailChannel(),  // uncomment to enable email
])
