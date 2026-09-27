import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { loadLlmConfig } from "@/lib/llm/config"
import { DEFAULT_TIMEOUT_SECONDS } from "@/lib/llm/settings-schema"
import { MODEL_TEST_CATALOG } from "@/lib/llm/model-test/cases"
import { MODEL_TEST_TODAY, STAGES } from "@/lib/llm/model-test/types"
import { ModelTest } from "@/components/settings/model-test/model-test"

export default async function AssistantTestPage() {
  const session = await auth()
  if (!session) redirect("/login")
  if (session.user.role !== "ADMIN") redirect("/")

  const config = await loadLlmConfig()

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-2">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to Settings
        </Link>
        <h1 className="font-heading text-2xl font-semibold">Assistant model test</h1>
      </div>

      {!config.baseUrl ? (
        <p className="text-sm text-muted-foreground">
          No assistant server is set up yet.{" "}
          <Link href="/settings" className="underline hover:text-foreground">
            Set one up in Settings
          </Link>{" "}
          before running tests.
        </p>
      ) : (
        <ModelTest
          savedModel={config.model ?? ""}
          savedTemperature={config.temperature?.toString() ?? ""}
          savedExtraBody={config.extraBody ?? ""}
          serverHost={new URL(config.baseUrl).host}
          timeoutSeconds={config.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS}
          catalog={MODEL_TEST_CATALOG}
          stages={STAGES}
          today={MODEL_TEST_TODAY}
        />
      )}
    </div>
  )
}
