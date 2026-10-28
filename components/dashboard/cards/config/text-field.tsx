"use client"

// The settings dialog's multi-line text field (ConfigField kind "text"): a
// textarea with a live character count. With `tokens` (the Text card), it also
// warns about unknown {tokens} (without blocking Save), previews the text with
// made-up values (a value that links is underlined there, but not a link),
// and lists the live values by group, each a button that inserts its token at
// the caret, with where it links. The token list comes from TEXT_TOKENS.

import { useId, useRef } from "react"
import { Link2, TriangleAlert } from "lucide-react"
import type { ControllerFieldState, ControllerRenderProps } from "react-hook-form"
import { FormDescription, FormItem, FormLabel, FormMessage, useFormField } from "@/components/ui/form"
import { Textarea } from "@/components/ui/textarea"
import type { ConfigField } from "@/lib/dashboard/card-types"
import type { ConfigFormContext, ConfigFormValues } from "@/lib/dashboard/config-form"
import {
  TEXT_TOKEN_GROUPS,
  TEXT_TOKENS,
  parseTokens,
  renderSegments,
  sampleLinks,
  sampleValues,
  tokenAvailable,
  tokenNote,
} from "@/lib/dashboard/text-template"
import { cn } from "@/lib/utils"

type TextField = Extract<ConfigField, { kind: "text" }>

type Props = {
  field: TextField
  ctx: ConfigFormContext
  input: ControllerRenderProps<ConfigFormValues, string>
  fieldState: ControllerFieldState
}

export function TextFieldControl(props: Props) {
  return (
    <FormItem>
      <TextFieldBody {...props} />
    </FormItem>
  )
}

/** Inside the FormItem, so the label, textarea and message share its ids. */
function TextFieldBody({ field, ctx, input, fieldState }: Props) {
  const id = useId()
  const { formItemId, formMessageId } = useFormField()
  const area = useRef<HTMLTextAreaElement | null>(null)
  const value = input.value ?? ""
  const over = value.length > field.maxLength
  const unknown = field.tokens ? parseTokens(value).unknown : []

  /** Puts `{name}` at the caret (replacing a selection), then puts the caret after it. */
  const insert = (name: string) => {
    const el = area.current
    const token = `{${name}}`
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const next = value.slice(0, start) + token + value.slice(end)
    if (next.length > field.maxLength) return
    input.onChange(next)
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }

  // The count, any error and any unknown-token warning describe the textarea.
  const describedBy = [`${id}-count`, fieldState.invalid && formMessageId, unknown.length > 0 && `${id}-unknown`].filter(Boolean).join(" ")
  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <FormLabel>{field.label}</FormLabel>
        <span id={`${id}-count`} className={cn("text-xs tabular-nums text-muted-foreground", over && "font-medium text-destructive")}>
          {value.length}/{field.maxLength}
          <span className="sr-only"> characters</span>
        </span>
      </div>
      <Textarea
        {...input}
        id={formItemId}
        ref={(el) => {
          input.ref(el)
          area.current = el
        }}
        rows={field.rows}
        maxLength={field.maxLength}
        spellCheck
        aria-invalid={fieldState.invalid}
        aria-describedby={describedBy}
        className="min-h-24 resize-y"
      />
      {field.help && <FormDescription className="text-xs">{field.help}</FormDescription>}
      <FormMessage role="alert" className="text-xs" />
      {field.tokens && (
        <>
          <div aria-live="polite">
            {unknown.length > 0 && (
              <p id={`${id}-unknown`} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                <span>
                  Not a known value: {unknown.map((u) => `{${u}}`).join(", ")}. It will show as typed.
                </span>
              </p>
            )}
          </div>
          {!fieldState.invalid && value.trim() !== "" && (
            <div className="rounded-md bg-muted/60 px-2.5 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Preview, with sample values</p>
              <p className="mt-0.5 line-clamp-4 text-sm break-words whitespace-pre-wrap">
                {renderSegments(value, sampleValues(ctx.features), sampleLinks()).map((seg, i) =>
                  "href" in seg ? (
                    <span key={i} className="underline decoration-current/30 decoration-1 underline-offset-[0.2em]">
                      {seg.text}
                    </span>
                  ) : (
                    seg.text
                  ),
                )}
              </p>
            </div>
          )}
          <TokenHelp features={ctx.features} onInsert={insert} />
        </>
      )}
    </>
  )
}

function TokenHelp({ features, onInsert }: { features: ConfigFormContext["features"]; onInsert: (name: string) => void }) {
  return (
    <details className="group rounded-md border border-border/70 px-2.5 py-2 text-xs">
      <summary className="cursor-pointer rounded-sm font-medium outline-none select-none focus-visible:ring-2 focus-visible:ring-ring">
        Live values
        <span className="font-normal text-muted-foreground"> — type a value in braces, like {"{user}"}, or pick one to insert it</span>
      </summary>
      <div className="mt-2 space-y-3">
        {TEXT_TOKEN_GROUPS.map((group) => (
          <section key={group} aria-label={group}>
            <h3 className="pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{group}</h3>
            <ul className="space-y-1">
              {TEXT_TOKENS.filter((t) => t.group === group).map((t) => {
                const available = tokenAvailable(t.name, features)
                const note = tokenNote(t.name)
                return (
                  <li key={t.name} className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => onInsert(t.name)}
                      aria-label={`Insert {${t.name}}: ${t.help}${t.linksTo ? ` Links to ${t.linksTo}.` : ""}`}
                      className={cn(
                        "shrink-0 rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground transition-colors duration-150",
                        "hover:border-primary/50 hover:bg-primary/5 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        "pointer-coarse:min-h-9",
                      )}
                    >
                      {`{${t.name}}`}
                    </button>
                    <span className="pt-0.5 text-muted-foreground">
                      {t.help}
                      {t.linksTo && (
                        <span className="ml-1 inline-flex items-baseline gap-0.5">
                          <Link2 className="size-3 shrink-0 self-center" aria-hidden />
                          Links to {t.linksTo}
                        </span>
                      )}
                      {note && (
                        <span className={cn("ml-1", available ? "text-muted-foreground" : "font-medium text-amber-700 dark:text-amber-400")}>
                          ({note}{available ? "" : "; Health is off, so it shows nothing"})
                        </span>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </details>
  )
}
