// register() runs once per server instance, before the server starts handling
// requests, so it only kicks the scheduler off — the first check is scheduled,
// not awaited, or boot would block on it.
export async function register() {
  // Also evaluated for the edge runtime, which has neither Prisma nor timers
  // that outlive a request.
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  // Finish a restore the apply step swapped in (secrets, sign-outs, notice) before anything
  // else touches the data. The scheduler below also marks interrupted backup runs, so this
  // has to come first.
  try {
    const { finalizeRestore } = await import("@/lib/backup/restore-server")
    await finalizeRestore()
  } catch (e) {
    console.error("[restore] finalize failed:", e)
  }

  // WAL lets reads carry on while the schedulers and indexer write. It's stored in the
  // file, so this only changes something on a new or freshly restored database.
  try {
    const { prisma } = await import("@/lib/prisma")
    await prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL")
  } catch (e) {
    console.error("[db] couldn't switch to WAL:", e)
  }

  const { startNotificationScheduler } = await import("@/lib/notifications/scheduler")
  startNotificationScheduler()

  const { listenForEntityChanges } = await import("@/lib/search/entities/sync-server")
  listenForEntityChanges()

  const { startDocumentIndexer } = await import("@/lib/documents/indexer-server")
  startDocumentIndexer()

  const { startBackupScheduler } = await import("@/lib/backup/scheduler-server")
  startBackupScheduler()

  const { startPaperlessScheduler } = await import("@/lib/paperless/scheduler-server")
  startPaperlessScheduler()
}
