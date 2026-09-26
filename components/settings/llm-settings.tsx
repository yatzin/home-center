"use client"

import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from "@/components/ui/form"
import { testLlmConnection, updateLlmSettings } from "@/lib/actions/llm-settings"
import { LLM_PRESETS } from "@/lib/llm/settings-schema"

type Values = {
  enabled: boolean
  baseUrl: string
  apiKey: string
  model: string
  temperature: string
  maxTokens: string
  systemPrompt: string
}

export function LlmSettings({
  initial,
  hasStoredKey,
  keyUnreadable,
  ready,
}: {
  initial: Omit<Values, "apiKey">
  hasStoredKey: boolean
  keyUnreadable: boolean
  ready: boolean
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
                    onChange={(e) => field.onChange(e.target.checked)}
                  />
                </FormControl>
                <FormLabel className="!mt-0">Turn on the assistant</FormLabel>
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

              <FormField control={form.control} name="systemPrompt" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Extra instructions</FormLabel>
                  <FormControl><Textarea rows={3} maxLength={4000} placeholder="e.g. Keep answers short." {...field} /></FormControl>
                  <FormDescription className="text-xs">Added to the assistant&apos;s built-in instructions.</FormDescription>
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
