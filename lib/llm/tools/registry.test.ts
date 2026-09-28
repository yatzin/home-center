import { describe, expect, it, vi } from "vitest"
import { z } from "zod/v4"
import { defineTool, runToolCall, toOpenAiTools, toolLabel } from "./registry"
import { ToolInputError } from "../query"

const ctx = { userId: "u1", now: new Date("2026-09-26T12:00:00Z") }

const echo = defineTool({
  name: "echo",
  description: "Doubles n.",
  schema: z.object({ n: z.number().describe("A number") }),
  label: (a) => `Echoing ${a.n}…`,
  run: async (a) => ({ doubled: a.n * 2 }),
})
const picky = defineTool({
  name: "picky",
  description: "Always rejects.",
  schema: z.object({}),
  label: () => "Picky…",
  run: async () => {
    throw new ToolInputError("Unknown field \"x\". Valid fields: a, b.")
  },
})
const crashy = defineTool({
  name: "crashy",
  description: "Crashes.",
  schema: z.object({}),
  label: () => "Crashy…",
  run: async () => {
    throw new Error("SQLITE_CORRUPT with secret row data")
  },
})
const listy = defineTool({
  name: "listy",
  description: "Joins tags.",
  schema: z.object({ tags: z.array(z.string()).optional(), note: z.string().optional() }),
  label: (a) => `Tags ${a.tags?.join("+") ?? "none"}…`,
  run: async (a) => ({ tags: a.tags ?? [], note: a.note ?? "none" }),
  aliases: { labels: "tags" },
})
const invalidFilter = defineTool({
  name: "invalid_filter",
  description: "Throws a Prisma validation error.",
  schema: z.object({}),
  label: () => "…",
  run: async () => {
    const e = new Error("Argument `endDate` must not be null. row data")
    e.name = "PrismaClientValidationError"
    throw e
  },
})
const tools = [echo, picky, crashy, listy, invalidFilter]
const call = (name: string, args: string) => ({ id: "c1", name, arguments: args })

describe("toOpenAiTools", () => {
  it("emits function tools with a JSON Schema and no $schema key", () => {
    expect(toOpenAiTools([echo])).toEqual([
      {
        type: "function",
        function: {
          name: "echo",
          description: "Doubles n.",
          parameters: {
            type: "object",
            properties: { n: { type: "number", description: "A number" } },
            required: ["n"],
            additionalProperties: false,
          },
        },
      },
    ])
  })
})

describe("runToolCall", () => {
  it("runs a tool and returns JSON", async () => {
    expect(await runToolCall(tools, call("echo", '{"n":2}'), ctx)).toBe('{"doubled":4}')
  })
  it("reports bad JSON and schema mismatches to the model", async () => {
    expect(JSON.parse(await runToolCall(tools, call("echo", "{n:2"), ctx))).toEqual({ error: "Arguments must be a JSON object." })
    const mismatch = JSON.parse(await runToolCall(tools, call("echo", '{"n":"two"}'), ctx))
    expect(mismatch.error).toBe("Invalid arguments.")
    expect(mismatch.issues[0]).toMatch(/^n: /)
  })
  it("treats empty arguments as {}", async () => {
    expect(JSON.parse(await runToolCall(tools, call("picky", ""), ctx)).error).toMatch(/Valid fields/)
  })
  it("lists tools when the name is unknown", async () => {
    expect(JSON.parse(await runToolCall(tools, call("nope", "{}"), ctx))).toEqual({
      error: 'Unknown tool "nope". Available: echo, picky, crashy, listy, invalid_filter.',
    })
  })
  it("treats null optional args as unset and a bare string as a one-item list", async () => {
    expect(JSON.parse(await runToolCall(tools, call("listy", '{"tags":null,"note":null}'), ctx))).toEqual({ tags: [], note: "none" })
    expect(JSON.parse(await runToolCall(tools, call("listy", '{"tags":"a","note":"n"}'), ctx))).toEqual({ tags: ["a"], note: "n" })
    expect(toolLabel(tools, call("listy", '{"tags":"a"}'))).toBe("Tags a…")
  })

  it("accepts an argument's older name, but not over the current one", async () => {
    expect(JSON.parse(await runToolCall(tools, call("listy", '{"labels":"a"}'), ctx))).toEqual({ tags: ["a"], note: "none" })
    expect(JSON.parse(await runToolCall(tools, call("listy", '{"labels":["x"],"tags":["y"]}'), ctx)).tags).toEqual(["y"])
  })
  it("explains Prisma validation errors as a filter problem, logging the name only", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const out = JSON.parse(await runToolCall(tools, call("invalid_filter", "{}"), ctx))
    expect(out.error).toMatch(/That filter isn't valid for these fields/)
    expect(spy.mock.calls.flat().join(" ")).not.toMatch(/row data/)
    spy.mockRestore()
  })
  it("hides unexpected server errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const out = await runToolCall(tools, call("crashy", "{}"), ctx)
    expect(out).toBe('{"error":"The lookup failed on the server."}')
    expect(spy.mock.calls.flat().join(" ")).not.toMatch(/secret/)
    spy.mockRestore()
  })
})

describe("toolLabel", () => {
  it("uses the tool's label, falling back when args don't parse", () => {
    expect(toolLabel(tools, call("echo", '{"n":3}'))).toBe("Echoing 3…")
    expect(toolLabel(tools, call("echo", "garbage"))).toBe("Looking things up…")
    expect(toolLabel(tools, call("nope", "{}"))).toBe("Looking things up…")
  })
})
