import { checkAndNotify } from "./checker"
import { nudgeIntake } from "./intake-nudge-server"
import { sendPendingDigests } from "./digest"
import { pruneOldNotifications } from "./retention"
import { sendPendingPush } from "./push"
import { loadNotificationConfig } from "./notification-settings"
import { loadMailConfig } from "./mail-config"
import { isMailConfigured } from "./mailer"
import { loadFeatures, visibleNotificationsWhere } from "@/lib/features-server"
import { prisma } from "@/lib/prisma"

// Notifications used to be created by a fire-and-forget call on the dashboard,
// which meant they only appeared when somebody happened to look — no visit, no
// reminder, however overdue. This runs the check on a timer instead, so it
// happens whether or not anyone is watching.
//
// HomeCenter ships as a single container against a single SQLite file, so an
// interval in the server process is the whole scheduler: there is exactly one
// long-lived process, and nothing external to configure. Run several replicas
// and each would run its own pass; the dedup check in checkAndNotify keeps that
// from duplicating notifications, but this is not a distributed lock.

// Long enough to stay clear of the server's own startup work.
const BOOT_DELAY_MS = 15_000

// The timer is shared through globalThis: the settings action that changes the
// interval can run in a different loaded copy of this module than the one
// instrumentation started, and it has to reach the same timer.
const g = globalThis as unknown as { __hcNotifyStarted?: boolean; __hcNotifyTimer?: ReturnType<typeof setInterval>; __hcNotifyRunning?: boolean }

// Guarantees runs never overlap. Two passes at once would both read "no
// existing notification" before either wrote one, and both would then write.
// On globalThis for the same reason as the timer: any loaded copy may start a pass.

/** One line explaining why a pass sent nothing: what is waiting, and which channels are on. */
async function describeIdlePass(): Promise<string> {
  try {
    const [{ push }, mail, visible] = await Promise.all([
      loadNotificationConfig(),
      loadMailConfig(),
      loadFeatures().then(visibleNotificationsWhere),
    ])
    const openWhere = { dismissedAt: null, user: { receivesNotifications: true }, ...visible }
    const [open, awaitingPush, awaitingEmail] = await Promise.all([
      prisma.notification.count({ where: openWhere }),
      prisma.notification.count({ where: { ...openWhere, pushedAt: null } }),
      prisma.notification.count({ where: { ...openWhere, emailedAt: null, user: { receivesNotifications: true, emailDigest: { not: "OFF" } } } }),
    ])
    const pushState = !push.enabled ? "push off" : push.unreadable ? "push secret unreadable" : `push on, ${awaitingPush} awaiting`
    const mailState = !isMailConfigured(mail) ? "email not configured" : mail.passwordUnreadable ? "email password unreadable" : `email on, ${awaitingEmail} awaiting (daily and weekly wait for their send time)`
    return `no new due items; ${open} open in the bell; ${pushState}; ${mailState}. Items are raised again only by the repeat setting.`
  } catch (error) {
    return `couldn't summarise (${error instanceof Error ? error.message : "error"})`
  }
}

async function runOnce(trigger: string) {
  if (g.__hcNotifyRunning) {
    console.warn(`[notifications] ${trigger} skipped — previous run still in progress`)
    return
  }
  g.__hcNotifyRunning = true
  const startedAt = Date.now()
  try {
    const created = (await checkAndNotify()) + (await nudgeIntake())
    // Runs every pass, not just when something was created: a digest the user
    // wasn't due for last time may be due now, and a failed send needs a retry.
    const emailed = await sendPendingDigests()
    const pushed = await sendPendingPush()
    const pruned = await pruneOldNotifications()
    const took = `${Date.now() - startedAt}ms`
    if (created > 0 || emailed > 0 || pushed > 0 || pruned > 0) {
      console.log(
        `[notifications] ${trigger}: created ${created}, emailed ${emailed}, pushed ${pushed}, deleted ${pruned} older than a year in ${took}`
      )
    } else {
      // A pass that does nothing looks the same as a scheduler that never ran.
      // With debug logging on (Settings → Notifications), say what was waiting
      // and why it wasn't sent. Off by default: it is one line per pass.
      if ((await loadNotificationConfig()).debug) console.log(`[notifications] ${trigger}: nothing sent in ${took} — ${await describeIdlePass()}`)
    }
  } catch (error) {
    // Logged rather than swallowed: a checker that silently stops notifying
    // looks exactly like having nothing due.
    console.error(`[notifications] ${trigger} failed:`, error)
  } finally {
    g.__hcNotifyRunning = false
  }
}

/**
 * Starts, restarts or stops the timer to match the interval in effect. Called at
 * boot and again whenever an admin saves a new interval, so no restart is needed.
 */
export async function applyNotificationInterval() {
  if (g.__hcNotifyTimer) clearInterval(g.__hcNotifyTimer)
  g.__hcNotifyTimer = undefined

  const { interval } = await loadNotificationConfig()
  if (interval.minutes === 0) {
    console.log("[notifications] scheduler off (interval is 0)")
    return 0
  }

  // unref so a pending timer never keeps the process alive on shutdown.
  g.__hcNotifyTimer = setInterval(() => void runOnce("scheduled check"), interval.minutes * 60_000)
  g.__hcNotifyTimer.unref()
  console.log(`[notifications] scheduler running — every ${interval.minutes} minute(s)`)
  return interval.minutes
}

export function startNotificationScheduler() {
  // register() can fire more than once in dev as the server reloads.
  if (g.__hcNotifyStarted) return
  g.__hcNotifyStarted = true

  void applyNotificationInterval()
    .then((minutes) => {
      // Catches anything that came due while the container was down. Skipped when
      // the interval is 0, which turns the checks off entirely.
      if (minutes > 0) setTimeout(() => void runOnce("boot check"), BOOT_DELAY_MS).unref()
    })
    .catch((e) => console.error("[notifications] couldn't start the scheduler:", e))
}
