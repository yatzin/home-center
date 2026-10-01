import nodemailer, { type Transporter } from "nodemailer"
import { loadMailConfig, transportSignature, type MailConfig } from "./mail-config"
import { isEmailAddress } from "@/lib/email-address"

// SMTP rather than a hosted API: HomeCenter runs on somebody's own box, often
// without a public domain, and SMTP works against a household mail account or a
// LAN relay with no third-party signup.

/** Configured means we have somewhere to send to — or we're only pretending to. */
export function isMailConfigured(config: MailConfig) {
  return Boolean(config.host) || config.dryRun
}

// Rebuilding a transport per message would drop the connection pool, so it's
// memoised — but keyed on the config, since an admin can now change the server
// from the UI and the next send must use it.
let cached: { signature: string; transport: Transporter } | null = null

function transportFor(config: MailConfig): Transporter {
  const signature = transportSignature(config)
  if (cached?.signature === signature) return cached.transport

  const transport = config.dryRun
    ? nodemailer.createTransport({ jsonTransport: true })
    : nodemailer.createTransport({
        host: config.host ?? undefined,
        port: config.port,
        secure: config.secure,
        auth: config.username ? { user: config.username, pass: config.password ?? "" } : undefined,
      })

  cached = { signature, transport }
  return transport
}

export async function sendMail(
  message: { to: string; subject: string; text: string; html: string },
  config?: MailConfig
) {
  // Addresses are validated when saved; this catches any stored before that.
  if (!isEmailAddress(message.to)) throw new Error("Refusing to send to an invalid recipient address")
  const resolved = config ?? (await loadMailConfig())
  const info = await transportFor(resolved).sendMail({ from: resolved.from, ...message })
  if (resolved.dryRun) {
    console.log(`[mail:dry-run] to=${message.to} subject=${message.subject}`)
  }
  return info
}

/** Checks the server accepts the settings, without sending anything. */
export async function verifyMail(config?: MailConfig) {
  const resolved = config ?? (await loadMailConfig())
  if (!isMailConfigured(resolved)) return { ok: false as const, error: "No mail server configured." }
  if (resolved.passwordUnreadable) {
    return { ok: false as const, error: "The saved password can't be decrypted — re-enter it." }
  }
  try {
    await transportFor(resolved).verify()
    return { ok: true as const }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Drops the memoised transport. Called after settings change, and by tests. */
export function resetMailTransport() {
  cached = null
}
