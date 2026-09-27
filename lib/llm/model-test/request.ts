import { z } from "zod"
import { parseLlmSettings } from "../settings-schema"

// What the test page may send. Server address and key are never accepted from
// the page — they always come from saved Settings — so the page can't be used
// to send requests (or the stored key) somewhere else.

const schema = z.object({
  /** Absent = saved value. Blank model = saved model. */
  model: z.string().trim().max(200).optional(),
  /** Absent = saved value. Blank = the server's default. */
  temperature: z.string().trim().max(10).optional(),
  /** Absent = saved value. Blank = none. */
  extraBody: z.string().trim().max(2000).optional(),
  /** Absent = every case. */
  caseIds: z.array(z.string().max(100)).max(500).optional(),
  repeat: z.number().int().min(1).max(5).optional(),
})

export type ModelTestRequest = z.infer<typeof schema>

type Saved = { model: string | null; temperature: number | null; extraBody: string | null }
export type ModelTestSettings = { model: string; temperature: number | null; extraBody: string | null; caseIds: string[] | null; repeat: number }

export function parseModelTestRequest(
  body: unknown,
  saved: Saved,
  knownIds: string[]
): { ok: true; value: ModelTestSettings } | { ok: false; error: string } {
  const parsed = schema.safeParse(body)
  if (!parsed.success) return { ok: false, error: "Invalid request." }
  const r = parsed.data

  const checked = parseLlmSettings(
    { enabled: false, baseUrl: "", model: "", temperature: r.temperature ?? "", extraBody: r.extraBody ?? "" },
    { requireComplete: false }
  )
  if (!checked.ok) return checked

  const model = r.model || saved.model
  if (!model) return { ok: false, error: "No model is set. Save one in Settings or type one here." }

  if (r.caseIds) {
    const unknown = r.caseIds.find((id) => !knownIds.includes(id))
    if (unknown) return { ok: false, error: `Unknown test: ${unknown}.` }
    if (!r.caseIds.length) return { ok: false, error: "No tests selected." }
  }

  return {
    ok: true,
    value: {
      model,
      temperature: r.temperature === undefined ? saved.temperature : checked.value.temperature,
      extraBody: r.extraBody === undefined ? saved.extraBody : checked.value.extraBody,
      caseIds: r.caseIds ?? null,
      repeat: r.repeat ?? 1,
    },
  }
}
