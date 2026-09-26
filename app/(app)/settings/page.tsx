import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { UserManagement } from "@/components/settings/user-management"
import { EmailPreferences } from "@/components/settings/email-preferences"
import { MailSettings } from "@/components/settings/mail-settings"
import { LlmSettings } from "@/components/settings/llm-settings"
import { loadMailConfig, SETTINGS_ID } from "@/lib/notifications/mail-config"
import { isMailConfigured } from "@/lib/notifications/mailer"
import { loadLlmConfig } from "@/lib/llm/config"
import { isLlmReady } from "@/lib/llm/settings-schema"

export default async function SettingsPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const isAdmin = session.user.role === "ADMIN"

  // Every account reaches Settings now: email cadence is a personal preference,
  // so gating the whole page on ADMIN would leave ordinary users unable to turn
  // their own mail off. User and server management stay admin-only.
  const [me, users, mail, storedMail, llm] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { emailDigest: true, email: true },
    }),
    isAdmin ? prisma.user.findMany({ orderBy: { createdAt: "asc" } }) : Promise.resolve([]),
    loadMailConfig(),
    isAdmin
      ? prisma.mailSettings.findUnique({ where: { id: SETTINGS_ID } })
      : Promise.resolve(null),
    isAdmin ? loadLlmConfig() : Promise.resolve(null),
  ])
  // A signed-in session whose user row is gone — the demo seeder wipes users,
  // so a cookie from before it survives the account it points at. Redirecting
  // to /login would bounce straight back here: proxy.ts sends anyone holding a
  // valid session away from /login, so the two would ping-pong and Settings
  // would look like it "goes to the dashboard". Say what's wrong instead.
  if (!me) {
    return (
      <div className="space-y-4 max-w-3xl">
        <h1 className="font-heading text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          The account you&apos;re signed in as no longer exists. Sign out from the menu in the top
          right, then sign in again.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <h1 className="font-heading text-2xl font-semibold">Settings</h1>

      <EmailPreferences
        digest={me.emailDigest}
        email={me.email}
        mailConfigured={isMailConfigured(mail)}
      />

      {isAdmin && (
        <MailSettings
          // Seeded from the resolved config so the form shows what is actually
          // in effect, whether that came from Settings or the environment. The
          // password is never sent — only whether one is stored.
          initial={{
            host: mail.host ?? "",
            port: String(mail.port),
            username: mail.username ?? "",
            secure: storedMail?.secure == null ? "auto" : String(storedMail.secure),
            fromAddress: mail.from,
            digestHour: String(mail.digestHour),
          }}
          sources={mail.sources}
          hasStoredPassword={Boolean(storedMail?.passwordEnc)}
          passwordUnreadable={mail.passwordUnreadable}
          configured={isMailConfigured(mail)}
          dryRun={mail.dryRun}
        />
      )}

      {isAdmin && llm && (
        <LlmSettings
          // The key itself is never sent — only whether one is stored.
          initial={{
            enabled: llm.enabled,
            baseUrl: llm.baseUrl ?? "",
            model: llm.model ?? "",
            temperature: llm.temperature?.toString() ?? "",
            maxTokens: llm.maxTokens?.toString() ?? "",
            systemPrompt: llm.systemPrompt ?? "",
          }}
          hasStoredKey={llm.hasStoredKey}
          keyUnreadable={llm.keyUnreadable}
          ready={isLlmReady(llm)}
        />
      )}

      {isAdmin && <UserManagement users={users} currentUserId={session.user.id} />}
    </div>
  )
}
