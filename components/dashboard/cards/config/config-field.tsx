"use client"

// One control of the card settings dialog, chosen by the field's kind
// (lib/dashboard/card-types.ts ConfigField): an item picker (one type, or any asset, grouped), a whole number
// with its unit, a choice (segmented for two or three options, otherwise a
// select), multi-line text (text-field.tsx) or an on/off checkbox. A card type gets its settings by declaring fields; there is no
// per-type form code. Values are strings; "" means "all".

import type { Control } from "react-hook-form"
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ConfigField } from "@/lib/dashboard/card-types"
import { offeredOptions, type ConfigFormContext, type ConfigFormValues } from "@/lib/dashboard/config-form"
import { assetPickValue } from "@/lib/dashboard/asset-pick"
import { cn } from "@/lib/utils"
import { TextFieldControl } from "./text-field"

/** Base UI's select cannot hold "", so "all" travels as this inside it. */
const ALL = "__all__"
const toSelect = (v: string) => (v === "" ? ALL : v)
const fromSelect = (v: unknown) => (v === ALL || v == null ? "" : String(v))

const TOUCH = "pointer-coarse:h-11"

const ASSET_GROUP_LABELS = { PROPERTY: "Properties", VEHICLE: "Vehicles", EQUIPMENT: "Equipment", PERSON: "People" } as const

export function ConfigFieldControl({
  field,
  ctx,
  control,
}: {
  field: ConfigField
  ctx: ConfigFormContext
  control: Control<ConfigFormValues>
}) {
  return (
    <FormField
      control={control}
      name={field.key}
      render={({ field: input, fieldState }) => {
        // One settings dialog is open at a time, so the key makes a unique id.
        const labelId = `dash-config-${field.key}`
        const help = field.help ? <FormDescription className="text-xs">{field.help}</FormDescription> : null
        const message = <FormMessage role="alert" className="text-xs" />

        if (field.kind === "item") {
          const options = ctx.items?.[field.itemType] ?? []
          const nameOf = (v: string) =>
            v === ALL ? field.allLabel : (options.find((o) => o.id === v)?.name ?? `Choose a ${field.noun}`)
          return (
            <FormItem>
              <FormLabel id={labelId}>{field.label}</FormLabel>
              <Select value={toSelect(input.value)} onValueChange={(v) => input.onChange(fromSelect(v))}>
                <FormControl>
                  <SelectTrigger aria-labelledby={`${labelId} ${labelId}-value`} className={cn("w-full", TOUCH)} onBlur={input.onBlur} ref={input.ref}>
                    <SelectValue id={`${labelId}-value`}>{(v: string) => <span className={cn(fieldState.invalid && "text-destructive")}>{nameOf(v)}</span>}</SelectValue>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={ALL} className={TOUCH}>
                    {field.allLabel}
                  </SelectItem>
                  {options.length > 0 && <SelectSeparator />}
                  {options.map((o) => (
                    <SelectItem key={o.id} value={o.id} className={TOUCH}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {help}
              {message}
            </FormItem>
          )
        }

        if (field.kind === "asset") {
          const groups = field.itemTypes.map((type) => ({ type, label: ASSET_GROUP_LABELS[type], options: ctx.items?.[type] ?? [] })).filter((g) => g.options.length > 0)
          const nameOf = (v: string) => {
            if (v === ALL) return field.allLabel
            const found = groups.flatMap((g) => g.options.map((o) => ({ value: assetPickValue(g.type, o.id), name: o.name }))).find((o) => o.value === v)
            return found?.name ?? `Choose a ${field.noun}`
          }
          return (
            <FormItem>
              <FormLabel id={labelId}>{field.label}</FormLabel>
              <Select value={toSelect(input.value)} onValueChange={(v) => input.onChange(fromSelect(v))}>
                <FormControl>
                  <SelectTrigger aria-labelledby={`${labelId} ${labelId}-value`} className={cn("w-full", TOUCH)} onBlur={input.onBlur} ref={input.ref}>
                    <SelectValue id={`${labelId}-value`}>{(v: string) => <span className={cn(fieldState.invalid && "text-destructive")}>{nameOf(v)}</span>}</SelectValue>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={ALL} className={TOUCH}>
                    {field.allLabel}
                  </SelectItem>
                  {groups.map((g) => (
                    <SelectGroup key={g.type}>
                      <SelectSeparator />
                      <SelectLabel>{g.label}</SelectLabel>
                      {g.options.map((o) => (
                        <SelectItem key={o.id} value={assetPickValue(g.type, o.id)} className={TOUCH}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {help}
              {message}
            </FormItem>
          )
        }

        if (field.kind === "text") {
          return <TextFieldControl field={field} ctx={ctx} input={input} fieldState={fieldState} />
        }

        if (field.kind === "toggle") {
          return (
            <FormItem>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium select-none pointer-coarse:min-h-11">
                <input
                  type="checkbox"
                  name={input.name}
                  ref={input.ref}
                  checked={input.value === "true"}
                  onChange={(e) => input.onChange(String(e.target.checked))}
                  onBlur={input.onBlur}
                  aria-describedby={field.help ? `${labelId}-help` : undefined}
                  className="size-4 accent-primary"
                />
                {field.label}
              </label>
              {field.help && (
                <p id={`${labelId}-help`} className="text-xs text-muted-foreground">
                  {field.help}
                </p>
              )}
              {message}
            </FormItem>
          )
        }

        if (field.kind === "number") {
          return (
            <FormItem>
              <FormLabel>
                {field.label}
                <span className="sr-only">
                  {" "}
                  ({field.unit}, {field.min} to {field.max})
                </span>
              </FormLabel>
              <div className="flex items-center gap-2">
                <FormControl>
                  <Input
                    {...input}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    className={cn("w-24 tabular-nums", TOUCH)}
                  />
                </FormControl>
                <span aria-hidden className="text-sm text-muted-foreground">
                  {field.unit}
                </span>
              </div>
              {help}
              {message}
            </FormItem>
          )
        }

        const options = offeredOptions(field, ctx.features)
        if (!field.allLabel && options.length <= 3) {
          // Two or three options: a segmented control (native radios: arrow keys move between them).
          return (
            <FormItem>
              <fieldset>
                <legend className="mb-1.5 text-sm leading-none font-medium select-none">{field.label}</legend>
                <div className="inline-flex w-full rounded-lg bg-muted p-0.5 sm:w-auto">
                  {options.map((o) => (
                    <label
                      key={o.value}
                      className={cn(
                        "relative flex h-8 flex-1 cursor-pointer items-center justify-center rounded-md px-3 text-sm whitespace-nowrap text-muted-foreground transition-colors duration-150 select-none sm:flex-none",
                        "has-checked:bg-background has-checked:font-medium has-checked:text-foreground has-checked:shadow-sm",
                        "has-focus-visible:ring-2 has-focus-visible:ring-ring",
                        TOUCH,
                      )}
                    >
                      <input
                        type="radio"
                        name={input.name}
                        value={o.value}
                        checked={input.value === o.value}
                        onChange={() => input.onChange(o.value)}
                        onBlur={input.onBlur}
                        aria-describedby={fieldState.error ? `${labelId}-error` : undefined}
                        className="sr-only"
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              {help}
              {fieldState.error && (
                <p id={`${labelId}-error`} role="alert" className="text-xs font-medium text-destructive">
                  {fieldState.error.message}
                </p>
              )}
            </FormItem>
          )
        }

        const labelOf = (v: string) => (v === ALL ? (field.allLabel ?? "") : (options.find((o) => o.value === v)?.label ?? v))
        return (
          <FormItem>
            <FormLabel id={labelId}>{field.label}</FormLabel>
            <Select value={toSelect(input.value)} onValueChange={(v) => input.onChange(fromSelect(v))}>
              <FormControl>
                <SelectTrigger aria-labelledby={`${labelId} ${labelId}-value`} className={cn("w-full", TOUCH)} onBlur={input.onBlur} ref={input.ref}>
                  <SelectValue id={`${labelId}-value`}>{(v: string) => labelOf(v)}</SelectValue>
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {field.allLabel && (
                  <SelectItem value={ALL} className={TOUCH}>
                    {field.allLabel}
                  </SelectItem>
                )}
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value} className={TOUCH}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {help}
            {message}
          </FormItem>
        )
      }}
    />
  )
}
