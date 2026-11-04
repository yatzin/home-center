"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { savePaperlessSettings, testPaperlessConnection, runPaperlessCheckNow } from "@/lib/actions/paperless-settings"
import { formFromView, toSaveInput, toTestInput, type PaperlessFormState } from "@/lib/paperless/settings-form"
import { useFormat } from "@/components/regional-provider"
import { WEEKDAYS } from "./data/format"

export function PaperlessSettings({
  initial,
  hasStoredToken,
  tokenUnreadable,
  lastCheckedAt,
  lastCheckSummary,
  lastCheckError,
}: {
  initial: Parameters<typeof formFromView>[0]
  hasStoredToken: boolean
  tokenUnreadable: boolean
  /** ISO string. */
  lastCheckedAt: string | null
  lastCheckSummary: string | null
  lastCheckError: string | null
}) {
  const fmt = useFormat()
  const [form, setForm] = useState<PaperlessFormState>(() => formFromView(initial))
  const [stored, setStored] = useState(hasStoredToken)
  const [saving, startSave] = useTransition()
  const [testing, startTest] = useTransition()
  const [checking, startCheck] = useTransition()
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [checkResult, setCheckResult] = useState<{ ok: boolean; text: string } | null>(null)

  const set = <K extends keyof PaperlessFormState>(k: K, v: PaperlessFormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  function save(e: React.FormEvent) {
    e.preventDefault()
    startSave(async () => {
      const typed = form.apiToken.trim().length > 0
      const r = await savePaperlessSettings(toSaveInput(form))
      if ("error" in r) return void toast.error(r.error)
      toast.success("Paperless settings saved.")
      if (form.clearToken) setStored(false)
      else if (typed) setStored(true)
      setForm((f) => ({ ...f, apiToken: "", clearToken: false }))
    })
  }

  function test() {
    setTestResult(null)
    startTest(async () => {
      const r = await testPaperlessConnection(toTestInput(form))
      if ("error" in r) setTestResult({ ok: false, text: r.error })
      else setTestResult({ ok: true, text: `Reachable. Paperless-ngx version ${r.version}.` })
    })
  }

  function checkNow() {
    setCheckResult(null)
    startCheck(async () => {
      const r = await runPaperlessCheckNow()
      if ("error" in r) setCheckResult({ ok: false, text: r.error })
      else setCheckResult({ ok: true, text: r.summary || "Check finished." })
    })
  }

  const select = "h-9 rounded-md border bg-background px-2 text-sm"
  const tokenState = form.clearToken ? "The stored token will be removed when you save." : stored ? "A token is stored." : "No token stored."

  return (
    <Card className="py-5">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2">
          Paperless-ngx
          {form.enabled ? <Badge variant="secondary">On</Badge> : <Badge variant="outline">Off</Badge>}
        </CardTitle>
        <CardDescription>Import documents from a Paperless-ngx server.</CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        {tokenUnreadable && (
          <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            The saved token can&apos;t be decrypted. This happens if <code className="text-xs">AUTH_SECRET</code> changed. Enter it again.
          </p>
        )}
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={form.enabled}
                onChange={(e) => set("enabled", e.target.checked)}
              />
              <span>Turn on Paperless import</span>
            </label>
            <p className="ml-6 text-xs text-muted-foreground">
              Importing copies the chosen documents (the file and its text) into HomeCenter and keeps a link back to Paperless.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pl-url">Paperless URL</Label>
            <Input id="pl-url" placeholder="https://paperless.example.com" value={form.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pl-token">API token</Label>
            <Input
              id="pl-token"
              type="password"
              autoComplete="new-password"
              placeholder={stored ? "•••••••• (unchanged)" : ""}
              disabled={form.clearToken}
              value={form.apiToken}
              onChange={(e) => set("apiToken", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {tokenState} The token is stored encrypted and never shown again. Leave this empty to keep the stored one.
              {stored && (
                <button type="button" className="ml-1 underline hover:text-foreground" onClick={() => set("clearToken", !form.clearToken)}>
                  {form.clearToken ? "Keep stored token" : "Clear stored token"}
                </button>
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pl-access">Who can import from Paperless</Label>
            <select id="pl-access" className={select} value={form.access} onChange={(e) => set("access", e.target.value as PaperlessFormState["access"])}>
              <option value="EVERYONE">Everyone signed in</option>
              <option value="ADMIN">Admins only</option>
            </select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="pl-schedule">Check for changes</Label>
              <select id="pl-schedule" className={select} value={form.schedule} onChange={(e) => set("schedule", e.target.value as PaperlessFormState["schedule"])}>
                <option value="OFF">Off</option>
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
              </select>
            </div>
            {form.schedule === "WEEKLY" && (
              <div className="space-y-1.5">
                <Label htmlFor="pl-day">Day</Label>
                <select id="pl-day" className={select} value={form.weekday} onChange={(e) => set("weekday", e.target.value)}>
                  {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="pl-time">Time</Label>
              <Input id="pl-time" type="time" value={form.time} onChange={(e) => set("time", e.target.value)} disabled={form.schedule === "OFF"} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Scheduled checks run at this time, server time.</p>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            <Button type="button" variant="outline" disabled={testing} onClick={test}>{testing ? "Testing…" : "Test connection"}</Button>
          </div>
          <p className="text-xs text-muted-foreground">The test uses what&apos;s typed above, so you can try settings before saving.</p>
          {testResult && (
            <p role="status" className={`text-sm ${testResult.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>{testResult.text}</p>
          )}
        </form>

        <div className="mt-6 space-y-2 border-t pt-5">
          <h3 className="font-heading text-base font-semibold">Last check</h3>
          <p className="text-sm">
            {lastCheckedAt ? `Checked ${fmt.dateTime(new Date(lastCheckedAt))}.` : "Not checked yet."}
          </p>
          {lastCheckSummary && <p className="text-sm text-muted-foreground">{lastCheckSummary}</p>}
          {lastCheckError && <p className="text-sm text-destructive">{lastCheckError}</p>}
          <div className="flex items-center gap-2 pt-1">
            <Button type="button" variant="outline" disabled={checking} onClick={checkNow}>{checking ? "Checking…" : "Check now"}</Button>
            <span className="text-xs text-muted-foreground">Uses the saved settings.</span>
          </div>
          {checkResult && (
            <p role="status" className={`text-sm ${checkResult.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>{checkResult.text}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
