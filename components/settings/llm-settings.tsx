"use client"

import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import Link from "next/link"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from "@/components/ui/form"
import { testLlmConnection, updateLlmSettings } from "@/lib/actions/llm-settings"
import { DEFAULT_TIMEOUT_SECONDS, DEFAULT_TOOL_ROUNDS, TOOL_ROUNDS_RANGE, LLM_PRESETS } from "@/lib/llm/settings-schema"

type Values = {
  enabled: boolean
  hidden: boolean
  baseUrl: string
  apiKey: string
  model: string
  temperature: string
  maxTokens: string
  systemPrompt: string
  timeoutSeconds: string
  maxToolRounds: string
  extraBody: string
  documentsEnabled: boolean
  healthDocumentsEnabled: boolean
}

export function LlmSettings({
  initial,
  hasStoredKey,
  keyUnreadable,
  ready,
  indexingEnabled,
}: {
  initial: Omit<Values, "apiKey">
  hasStoredKey: boolean
  keyUnreadable: boolean
  ready: boolean
  /** Document switches only matter while indexing is on (Settings → Documents). */
  indexingEnabled: boolean
}) {
  const form = useForm<Values>({ defaultValues: { ...initial, apiKey: "" } })
  const [clearApiKey, setClearApiKey] = useState(false)
  const [testing, startTest] = useTransition()

  async function onSubmit(values: Values) {
    const result = await updateLlmSettings({ ...values, clearApiKey })
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    toast.success("Assistant settings saved.")
    form.setValue("apiKey", "")
    setClearApiKey(false)
  }

  function runTest() {
    startTest(async () => {
      const result = await testLlmConnection({ ...form.getValues(), clearApiKey })
      if ("error" in result) {
        toast.error(result.error, { duration: 15000 })
        return
      }
      if (result.toolCalling) toast.success(`Connected to ${result.model} — tool calling works.`)
      else
        toast.warning(
          `Connected to ${result.model}, but it didn't call the test tool. It may not support tool calling, which the assistant needs.`,
          { duration: 15000 }
        )
    })
  }

  return (
    <Card className="py-5">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2">
          Assistant
          {ready ? <Badge variant="secondary">On</Badge> : <Badge variant="outline">Off</Badge>}
        </CardTitle>
        <CardDescription>
          Lets everyone ask questions about HomeCenter&apos;s data in chat. Works with any OpenAI-compatible server —
          OpenAI, Ollama, LM Studio, OpenRouter. Questions and the records needed to answer them are sent to this
          server, including health records; use a local model if that matters to you.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        {keyUnreadable && (
          <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            The saved API key can&apos;t be decrypted — this happens if <code className="text-xs">AUTH_SECRET</code>{" "}
            changed. Enter it again.
          </p>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="enabled" render={({ field }) => (
              <FormItem className="flex items-center gap-2 space-y-0">
                <FormControl>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={field.value}
                    onChange={(e) => {
                      field.onChange(e.target.checked)
                      // Hidden only applies while off — mirror the server, which
                      // clears it the moment the assistant is turned on.
                      if (e.target.checked) form.setValue("hidden", false)
                    }}
                  />
                </FormControl>
                <FormLabel className="!mt-0">Turn on the assistant</FormLabel>
              </FormItem>
            )} />

            <FormField control={form.control} name="hidden" render={({ field }) => (
              <FormItem className="flex items-center gap-2 space-y-0">
                <FormControl>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={field.value}
                    disabled={form.watch("enabled")}
                    onChange={(e) => field.onChange(e.target.checked)}
                  />
                </FormControl>
                <FormLabel className="!mt-0 font-normal text-muted-foreground">
                  Hide the assistant from the nav menu and the top-right button
                </FormLabel>
              </FormItem>
            )} />

            <FormField control={form.control} name="documentsEnabled" render={({ field }) => (
              <FormItem className="space-y-1">
                <div className="flex items-center gap-2">
                  <FormControl>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={field.value}
                      disabled={!indexingEnabled}
                      onChange={(e) => field.onChange(e.target.checked)}
                    />
                  </FormControl>
                  <FormLabel className="!mt-0">Let the assistant read uploaded documents</FormLabel>
                </div>
                <FormDescription className="text-xs">
                  {indexingEnabled
                    ? "Document text is sent to the configured LLM server when it's relevant to a question."
                    : "Turn on document indexing first (Documents, above)."}
                </FormDescription>
              </FormItem>
            )} />

            <FormField control={form.control} name="healthDocumentsEnabled" render={({ field }) => (
              <FormItem className="space-y-1">
                <div className="flex items-center gap-2">
                  <FormControl>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={field.value}
                      disabled={!indexingEnabled || !form.watch("documentsEnabled")}
                      onChange={(e) => field.onChange(e.target.checked)}
                    />
                  </FormControl>
                  <FormLabel className="!mt-0 font-normal">Include health record documents</FormLabel>
                </div>
                <FormDescription className="text-xs">
                  Files attached to conditions, observations, medications, allergies and immunizations. With a cloud
                  provider, their text leaves this server.
                </FormDescription>
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="baseUrl" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Base URL</FormLabel>
                  <FormControl><Input placeholder="https://api.openai.com/v1" {...field} /></FormControl>
                  <FormDescription className="text-xs">
                    Fill from:{" "}
                    {LLM_PRESETS.map((p, i) => (
                      <span key={p.id}>
                        {i > 0 && " · "}
                        <button
                          type="button"
                          className="underline hover:text-foreground"
                          onClick={() => form.setValue("baseUrl", p.baseUrl, { shouldDirty: true })}
                        >
                          {p.label}
                        </button>
                      </span>
                    ))}
                    . In Docker, use the host&apos;s address instead of localhost.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="model" render={({ field }) => (
                <FormItem>
                  <FormLabel>Model</FormLabel>
                  <FormControl><Input placeholder="gpt-4o-mini" {...field} /></FormControl>
                  <FormDescription className="text-xs">Must support tool (function) calling.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="apiKey" render={({ field }) => (
                <FormItem>
                  <FormLabel>API key</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      placeholder={hasStoredKey ? "•••••••• (unchanged)" : "Not needed for local servers"}
                      disabled={clearApiKey}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Stored encrypted, and only sent to the server it was saved for — a saved key is dropped when the base URL moves to another server.
                    {hasStoredKey && (
                      <button type="button" className="ml-1 underline hover:text-foreground" onClick={() => setClearApiKey((c) => !c)}>
                        {clearApiKey ? "Keep saved key" : "Remove saved key"}
                      </button>
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="temperature" render={({ field }) => (
                <FormItem>
                  <FormLabel>Temperature</FormLabel>
                  <FormControl><Input type="number" step="0.1" min={0} max={2} placeholder="Provider default" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="maxTokens" render={({ field }) => (
                <FormItem>
                  <FormLabel>Max tokens</FormLabel>
                  <FormControl><Input type="number" min={1} max={32000} placeholder="Provider default" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="timeoutSeconds" render={({ field }) => (
                <FormItem>
                  <FormLabel>Time limit per question (seconds)</FormLabel>
                  <FormControl><Input type="number" min={30} max={900} placeholder={String(DEFAULT_TIMEOUT_SECONDS)} {...field} /></FormControl>
                  <FormDescription className="text-xs">
                    Raise it for slow local models. Once a reply starts, it also stops if the server then sends nothing for 60 seconds.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="maxToolRounds" render={({ field }) => (
                <FormItem>
                  <FormLabel>Lookup rounds per question</FormLabel>
                  <FormControl>
                    <Input type="number" min={TOOL_ROUNDS_RANGE.min} max={TOOL_ROUNDS_RANGE.max} placeholder={String(DEFAULT_TOOL_ROUNDS)} {...field} />
                  </FormControl>
                  <FormDescription className="text-xs">
                    How many times the assistant may go back for more data before it must answer. More helps follow-up and
                    multi-step questions; simple questions stop early either way.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="systemPrompt" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Extra instructions</FormLabel>
                  <FormControl><Textarea rows={3} maxLength={4000} placeholder="e.g. Keep answers short." {...field} /></FormControl>
                  <FormDescription className="text-xs">Added to the assistant&apos;s built-in instructions.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="extraBody" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Extra request JSON</FormLabel>
                  <FormControl>
                    <Textarea rows={3} maxLength={2000} className="font-mono text-xs" placeholder='{"chat_template_kwargs": {"enable_thinking": true}}' {...field} />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Optional fields sent with every request, for settings your server supports — for example turning on a
                    model&apos;s thinking (llama.cpp, vLLM) or <code className="text-xs">reasoning_effort</code> (OpenAI). Leave blank if unsure.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving…" : "Save"}
              </Button>
              <Button type="button" variant="outline" disabled={testing} onClick={runTest}>
                {testing ? "Testing…" : "Test connection"}
              </Button>
              <Link href="/settings/assistant-test" className={buttonVariants({ variant: "ghost" })}>
                Run model tests →
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              The test uses what&apos;s typed above, so you can try settings before saving.
            </p>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
