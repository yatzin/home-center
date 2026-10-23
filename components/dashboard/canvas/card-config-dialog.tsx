"use client"

// A card's settings, opened from its gear in edit mode (or "Choose another" on
// a card whose item is gone). The controls come from the type's config fields;
// the form validates with configFormSchema, which ends in the type's own
// configSchema, so an invalid config cannot be saved. Saving hands the config
// to the editor (a `config` action); the card then reloads its data.

import { useEffect, useMemo } from "react"
import { useForm, useWatch, type Control } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Form } from "@/components/ui/form"
import { sameConfig } from "@/lib/dashboard/card-data"
import { cardType, configFieldsFor } from "@/lib/dashboard/card-types"
import {
  configFormSchema,
  toFormValues,
  visibleFields,
  type ConfigFormContext,
  type ConfigFormValues,
} from "@/lib/dashboard/config-form"
import type { CardInstance } from "@/lib/dashboard/layout"
import { ConfigFieldControl } from "@/components/dashboard/cards/config/config-field"
import { CARD_ICONS } from "./card-icons"

export function CardConfigDialog({
  card,
  open,
  onOpenChange,
  ctx,
  onSave,
  finalFocus,
}: {
  /** The card being configured; kept while the dialog closes so it fades out with its content. */
  card: CardInstance | null
  open: boolean
  onOpenChange: (open: boolean) => void
  ctx: ConfigFormContext
  /** Called with a valid, changed config. */
  onSave: (config: Record<string, unknown>) => void
  /** Where focus goes on close (the card's gear, normally). */
  finalFocus: () => HTMLElement | null
}) {
  const def = card ? cardType(card.type) : undefined
  const Icon = def ? CARD_ICONS[def.icon] : null
  return (
    <Dialog open={open && def !== undefined} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-md" finalFocus={() => finalFocus() ?? true}>
        {card && def && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {Icon && <Icon className="size-4 text-muted-foreground" aria-hidden />}
                {def.label} settings
              </DialogTitle>
              <DialogDescription>{def.description}</DialogDescription>
            </DialogHeader>
            {/* Keyed: each opening starts from the card's current config. */}
            <ConfigForm key={`${card.id}:${open}`} card={card} ctx={ctx} onSave={onSave} onCancel={() => onOpenChange(false)} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ConfigForm({
  card,
  ctx,
  onSave,
  onCancel,
}: {
  card: CardInstance
  ctx: ConfigFormContext
  onSave: (config: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const schema = useMemo(() => configFormSchema(card.type, ctx, card.config), [card.type, card.config, ctx])
  const defaults = useMemo(() => toFormValues(card.type, card.config, ctx), [card.type, card.config, ctx])
  const form = useForm<ConfigFormValues, unknown, Record<string, unknown>>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
    mode: "onTouched",
  })
  const values = useWatch({ control: form.control }) as ConfigFormValues
  const fields = visibleFields(card.type, { ...defaults, ...values })

  // "Choose another": say straight away that the configured item is gone.
  useEffect(() => {
    const gone = configFieldsFor(card.type).filter((f) => f.kind === "item" && defaults[f.key] !== "")
    if (gone.length > 0) void form.trigger(gone.map((f) => f.key))
  }, [card.type, defaults, form])

  const submit = form.handleSubmit((config) => {
    if (sameConfig(config, card.config)) onCancel()
    else onSave(config)
  })

  return (
    <Form {...form}>
      <form onSubmit={submit} noValidate className="flex min-h-0 flex-col gap-4">
        <div className="-mx-4 min-h-0 space-y-5 overflow-y-auto px-4 py-1">
          {fields.map((f) => (
            // FormField does not take the transformed-output type; the control is the same object.
            <ConfigFieldControl key={f.key} field={f} ctx={ctx} control={form.control as unknown as Control<ConfigFormValues>} />
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} className="pointer-coarse:h-11">
            Cancel
          </Button>
          <Button type="submit" className="pointer-coarse:h-11">
            Save
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}
