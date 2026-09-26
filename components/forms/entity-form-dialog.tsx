"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { ActionResult, FieldConfig, FormValues } from "@/lib/form-types"

// Base UI Select has no empty-string option, so "none" needs a sentinel.
const NONE = "__none__"

// One dialog for every health record type. Each caller describes its fields as
// data; the server action's zod schema does the real validation and its field
// errors come back under the matching inputs.

interface Props {
  open: boolean
  onClose: () => void
  title: string
  submitLabel: string
  successMessage: string
  fields: FieldConfig[]
  initial: FormValues
  onSubmit: (values: FormValues) => Promise<ActionResult>
  /** Rendered under the fields, e.g. attachments for a record that already exists. */
  children?: React.ReactNode
}

export function EntityFormDialog({ open, onClose, title, submitLabel, successMessage, fields, initial, onSubmit, children }: Props) {
  const [values, setValues] = useState<FormValues>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [prevOpen, setPrevOpen] = useState(open)

  // Reset whenever the dialog opens, so it shows the record being edited (or a
  // blank form) rather than whatever was typed last time.
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setValues(initial)
      setErrors({})
    }
  }

  function set(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => {
      if (!prev[name]) return prev
      const next = { ...prev }
      delete next[name]
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const missing = fields.filter((f) => f.required && !values[f.name]?.trim())
    if (missing.length > 0) {
      setErrors(Object.fromEntries(missing.map((f) => [f.name, `${f.label} is required`])))
      return
    }

    setSubmitting(true)
    try {
      const result = await onSubmit(values)
      if (result.error) {
        if (typeof result.error === "string") {
          toast.error(result.error)
        } else {
          setErrors(Object.fromEntries(Object.entries(result.error).map(([k, v]) => [k, v?.[0] ?? "Invalid value"])))
          toast.error("Please fix the errors and try again.")
        }
        return
      }
      toast.success(successMessage)
      onClose()
    } catch {
      toast.error("Something went wrong saving. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.name} className={cn("space-y-1.5", f.wide && "sm:col-span-2")}>
                <Label htmlFor={`field-${f.name}`}>
                  {f.label}
                  {f.required && " *"}
                </Label>
                <FieldInput field={f} value={values[f.name] ?? ""} onChange={(v) => set(f.name, v)} />
                {errors[f.name] && <p className="text-xs text-destructive">{errors[f.name]}</p>}
              </div>
            ))}
          </div>

          {children}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FieldInput({ field, value, onChange }: { field: FieldConfig; value: string; onChange: (v: string) => void }) {
  const id = `field-${field.name}`

  if (field.kind === "textarea") {
    return <Textarea id={id} rows={3} value={value} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
  }

  if (field.kind === "select") {
    const options = field.options ?? []
    return (
      <Select value={value || NONE} onValueChange={(v) => onChange(!v || v === NONE ? "" : v)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue>{(v: string) => options.find((o) => o.value === v)?.label ?? "None"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {!field.required && <SelectItem value={NONE}>None</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (field.kind === "checkboxes") {
    const options = field.options ?? []
    const selected = new Set(value ? value.split(",") : [])
    return (
      <div id={id} className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={selected.has(o.value)}
              onChange={(e) => {
                const next = new Set(selected)
                if (e.target.checked) next.add(o.value)
                else next.delete(o.value)
                onChange([...next].join(","))
              }}
            />
            {o.label}
          </label>
        ))}
        {options.length === 0 && <span className="text-sm text-muted-foreground">Nothing to choose yet.</span>}
      </div>
    )
  }

  return (
    <Input
      id={id}
      type={field.kind}
      step={field.kind === "number" ? "any" : undefined}
      value={value}
      placeholder={field.placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
