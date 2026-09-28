import { z } from "zod/v4"
import { ToolInputError, type ToolContext } from "../query"
import { toToolContent } from "../serialize"
import type { OpenAiTool, ToolCall } from "../types"

// Tools are declared with a zod schema; the registry turns that into the JSON
// Schema the provider needs, validates the model's arguments, and converts every
// failure into a tool message the model can learn from. Pure — tools that touch
// the database live in generic.ts / shortcuts.ts.

export const FALLBACK_LABEL = "Looking things up…"

export type RegisteredTool = {
  name: string
  description: string
  parameters: Record<string, unknown>
  label(raw: unknown): string
  execute(raw: unknown, ctx: ToolContext): Promise<string>
}

function isArraySchema(schema: unknown): boolean {
  let s = schema
  while (s instanceof z.ZodOptional || s instanceof z.ZodNullable || s instanceof z.ZodDefault) s = s.unwrap()
  return s instanceof z.ZodArray
}

/**
 * Smooths over two common small-model habits before validation: null for an
 * optional argument ("not set"), and a bare string where a list is expected.
 */
export function normalizeArgs(schema: z.ZodType, raw: unknown, aliases: Record<string, string> = {}): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw
  const shape = schema instanceof z.ZodObject ? (schema.shape as Record<string, unknown>) : {}
  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(raw)) {
    if (v === null) continue
    // An argument's older name still works, unless the current name is also given.
    const k = aliases[key] && !(aliases[key] in raw) ? aliases[key] : key
    out[k] = typeof v === "string" && isArraySchema(shape[k]) ? [v] : v
  }
  return out
}

export function defineTool<S extends z.ZodType>(t: {
  name: string
  description: string
  schema: S
  /** Older argument names models may still send, mapped to the current ones. */
  aliases?: Record<string, string>
  label: (args: z.infer<S>) => string
  run: (args: z.infer<S>, ctx: ToolContext) => Promise<unknown>
}): RegisteredTool {
  const parameters = z.toJSONSchema(t.schema) as Record<string, unknown>
  delete parameters.$schema
  return {
    name: t.name,
    description: t.description,
    parameters,
    label(raw) {
      const parsed = t.schema.safeParse(normalizeArgs(t.schema, raw, t.aliases))
      return parsed.success ? t.label(parsed.data) : FALLBACK_LABEL
    },
    async execute(raw, ctx) {
      const parsed = t.schema.safeParse(normalizeArgs(t.schema, raw, t.aliases))
      if (!parsed.success) {
        return JSON.stringify({
          error: "Invalid arguments.",
          issues: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
        })
      }
      try {
        return toToolContent(await t.run(parsed.data, ctx))
      } catch (error) {
        if (error instanceof ToolInputError) return JSON.stringify({ error: error.message })
        // Name only: messages from the database can carry row data.
        const name = error instanceof Error ? error.name : typeof error
        console.error(`[llm] tool ${t.name} failed:`, name)
        if (name === "PrismaClientValidationError") {
          return JSON.stringify({ error: "That filter isn't valid for these fields (e.g. isNull on a required field). Adjust the filters." })
        }
        return JSON.stringify({ error: "The lookup failed on the server." })
      }
    },
  }
}

export function toOpenAiTools(tools: RegisteredTool[]): OpenAiTool[] {
  return tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }))
}

/** undefined means "not a JSON object". Empty strings count as {} — some servers send that for no-arg calls. */
export function parseToolArgs(raw: string): unknown | undefined {
  if (!raw.trim()) return {}
  try {
    const v = JSON.parse(raw)
    return v && typeof v === "object" && !Array.isArray(v) ? v : undefined
  } catch {
    return undefined
  }
}

export async function runToolCall(tools: RegisteredTool[], call: ToolCall, ctx: ToolContext): Promise<string> {
  const tool = tools.find((t) => t.name === call.name)
  if (!tool) return JSON.stringify({ error: `Unknown tool "${call.name}". Available: ${tools.map((t) => t.name).join(", ")}.` })
  const args = parseToolArgs(call.arguments)
  if (args === undefined) return JSON.stringify({ error: "Arguments must be a JSON object." })
  return tool.execute(args, ctx)
}

export function toolLabel(tools: RegisteredTool[], call: ToolCall): string {
  const tool = tools.find((t) => t.name === call.name)
  const args = parseToolArgs(call.arguments)
  return tool && args !== undefined ? tool.label(args) : FALLBACK_LABEL
}
