// Shapes shared by the generic entity dialog and the server actions it calls.
// Values travel as the strings the inputs hold; the zod schemas in
// lib/health-schemas.ts own every conversion to dates, numbers and nulls.

export type FormValues = Record<string, string>

export type FieldErrors = Record<string, string[] | undefined>

export type ActionResult = { success?: boolean; id?: string; error?: string | FieldErrors }

export type FieldOption = { value: string; label: string }

export type FieldConfig = {
  name: string
  label: string
  kind: "text" | "textarea" | "date" | "number" | "email" | "tel" | "select" | "checkboxes"
  required?: boolean
  placeholder?: string
  /// select and checkboxes only. A non-required select gets a "None" choice.
  options?: FieldOption[]
  /// Spans both columns of the dialog grid.
  wide?: boolean
}
