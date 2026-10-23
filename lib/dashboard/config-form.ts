// The card settings dialog's form, as pure TS: config -> form values, and a
// zod schema from form values back to a config. The schema ends in the card
// type's own configSchema, so a config that schema rejects can never be
// submitted (the reducer would ignore it anyway). Every input is a string
// (selects, radios and text inputs all give strings); "" means "all" / unset.
import { z } from "zod"
import type { Features } from "@/lib/features"
import { cardType, configFieldsFor, type ChoiceOption, type ConfigField, type ConfigItemType } from "./card-types"

export type ItemOption = { id: string; name: string }
export type ConfigItemOptions = Record<ConfigItemType, ItemOption[]>

export type ConfigFormContext = {
  /** Null when the page has no lists (then only "All" is valid). */
  items: ConfigItemOptions | null
  features: Features
}

export type ConfigFormValues = Record<string, string>

type ChoiceField = Extract<ConfigField, { kind: "choice" }>

/** The choices the dialog offers: those whose feature is on. */
export function offeredOptions(field: ChoiceField, features: Features): ChoiceOption[] {
  return field.options.filter((o) => !o.requires || features[o.requires])
}

const isSet = (v: string | undefined) => v !== undefined && v.trim() !== ""

/** A field is hidden while the key it depends on is set (a limit means nothing for one item). */
function hidden(field: ConfigField, values: ConfigFormValues): boolean {
  return field.kind === "number" && field.hiddenWhenSet !== undefined && isSet(values[field.hiddenWhenSet])
}

/** The fields to show for these values. */
export function visibleFields(typeId: string, values: ConfigFormValues): ConfigField[] {
  return configFieldsFor(typeId).filter((f) => !hidden(f, values))
}

/** The form's starting values for a card's config. */
export function toFormValues(typeId: string, config: Record<string, unknown>, ctx: ConfigFormContext): ConfigFormValues {
  const defaults = cardType(typeId)?.defaultConfig ?? {}
  const values: ConfigFormValues = {}
  for (const f of configFieldsFor(typeId)) {
    const v = config[f.key]
    if (f.kind === "item") {
      // A deleted item's id is kept, so the form can say it is gone.
      values[f.key] = typeof v === "string" ? v : ""
    } else if (f.kind === "number") {
      const n = typeof v === "number" ? v : typeof defaults[f.key] === "number" ? (defaults[f.key] as number) : f.default
      values[f.key] = String(n)
    } else {
      const offered = offeredOptions(f, ctx.features).map((o) => o.value)
      const fallback = f.allLabel ? "" : String(defaults[f.key] ?? offered[0] ?? "")
      values[f.key] = typeof v === "string" && offered.includes(v) ? v : fallback
    }
  }
  return values
}

const WHOLE = /^\d+$/

/**
 * Form values -> config, validated. Errors land on the field's key. `original`
 * is the card's config before editing: a hidden field keeps its value from it.
 */
export function configFormSchema(
  typeId: string,
  ctx: ConfigFormContext,
  original: Record<string, unknown>,
): z.ZodType<Record<string, unknown>, z.ZodTypeDef, ConfigFormValues> {
  const def = cardType(typeId)
  const fields = configFieldsFor(typeId)
  const shape = Object.fromEntries(fields.map((f) => [f.key, z.string().optional().default("")]))
  const strict = def?.configSchema ?? z.object({})

  return z
    .object(shape)
    .superRefine((values, issue) => {
      const fail = (key: string, message: string) => issue.addIssue({ code: z.ZodIssueCode.custom, path: [key], message })
      for (const f of fields) {
        if (hidden(f, values)) continue
        const v = values[f.key].trim()
        if (f.kind === "item") {
          if (v && !(ctx.items?.[f.itemType] ?? []).some((o) => o.id === v)) fail(f.key, `This ${f.noun} no longer exists. Choose another.`)
        } else if (f.kind === "number") {
          if (!WHOLE.test(v)) fail(f.key, "Enter a whole number.")
          else if (Number(v) < f.min || Number(v) > f.max) fail(f.key, `Choose ${f.min} to ${f.max}.`)
        } else {
          const offered = offeredOptions(f, ctx.features).some((o) => o.value === v)
          if (!(offered || (v === "" && f.allLabel))) fail(f.key, "Choose one of the options.")
        }
      }
    })
    .transform((values) => {
      const config: Record<string, unknown> = {}
      for (const f of fields) {
        if (hidden(f, values)) {
          // Not shown, so not edited: keep what was there if it is still valid.
          const kept = original[f.key]
          if (kept !== undefined && strict.safeParse({ [f.key]: kept }).success) config[f.key] = kept
          continue
        }
        const v = values[f.key].trim()
        if (v === "") continue
        config[f.key] = f.kind === "number" ? Number(v) : v
      }
      return config
    })
    .pipe(strict) as z.ZodType<Record<string, unknown>, z.ZodTypeDef, ConfigFormValues>
}
