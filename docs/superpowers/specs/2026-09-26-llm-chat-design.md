# LLM Chat Assistant — Design

**Date:** 2026-09-26
**Status:** Approved design, not yet implemented.
**Branch:** `FEAT/LLM`

## Problem

HomeCenter holds a lot of household data — assets, service history, costs,
warranties, maintenance schedules, health records, providers, insurance — but
answering a question that spans it ("did the Civic cost more than the Tacoma
over the last three years?", "who in the family is allergic to penicillin?",
"when was the furnace last serviced and what has it cost us?") means clicking
through several pages and doing arithmetic by hand.

## Goal

A chat assistant that answers questions about the data in the site, grounded in
what is actually in the database.

- A server API accepts the conversation, lets an LLM decide which data tools to
  call, runs them, and loops **up to 5 rounds** before a final answer is formed
  from the gathered data.
- Chat history lives **only in the browser** and is sent with every request.
  Threads are never stored on the server.
- Data comes from the **database only**. Uploaded documents are ignored.
- The LLM is configured on the Settings page and stored in the database. Any
  **OpenAI-compatible Chat Completions** endpoint works (OpenAI, Ollama,
  LM Studio, OpenRouter, vLLM, …).

**Success:** a signed-in user asks a comparison or history question in plain
English and gets a correct answer, with links to the records it came from, and
follow-up questions in the same thread understand the earlier turns.

## Decisions

| Question | Decision |
|---|---|
| Provider protocol | OpenAI-compatible `POST {baseUrl}/chat/completions` with `tools`. Plain `fetch`, no SDK. |
| Where chat lives | **Both**: a slide-out panel from a header button on every page, and a full `/chat` page. They share one thread. |
| Thread storage | `sessionStorage`, one thread per tab, keyed by user id. Survives navigation and reload; gone when the tab closes. "New chat" clears it. |
| What the browser stores | User and assistant **text only**. Tool calls and results are never sent back by the client; each turn re-fetches the data it needs. Keeps payloads small, prevents a client forging tool results, and keeps data fresh. |
| Response delivery | Streamed NDJSON: progress events per tool round, then answer text deltas. |
| Tool design | **Layered, ontology underneath**: a declarative ontology is the single source of truth; ~5 curated shortcut tools for common questions (friendly to weak models) plus 3 generic tools for the long tail. |
| Data scope | **All household data** reachable through the ontology. Excluded: `User`, `MailSettings`, `LlmSettings`, `Attachment`, image filenames, `createdById`. `Notification` is scoped to the current user. |
| Access | Any signed-in user can chat (every user already sees all data). LLM configuration is admin-only. |
| Writes | None. All tools are read-only. |
| Env fallback for LLM config | None. Configured in the UI only. |
| Rate limiting | None — auth-gated household app. |

## Architecture

```
Browser (panel or /chat)            Server
─────────────────────────           ──────────────────────────────────────
sessionStorage thread  ──POST──▶  /api/chat  (route handler, Node runtime)
{messages:[{role,content}]}         1. auth() → 401 if none
                                    2. zod-validate body
                                    3. loadLlmConfig() → 503 if unconfigured
                                    4. runAgent():
                                       rounds 1..5: POST {baseUrl}/chat/completions
                                         with tools, stream:true; if tool_calls →
                                         run tools, append results, emit status;
                                         if text only → done early
                                       after round 5 still calling tools →
                                         final call tool_choice "none", streamed
◀── NDJSON stream ─────────────     events: status | delta | done | error
```

### Units

| File | Responsibility | Depends on |
|---|---|---|
| `lib/llm/config.ts` | Load the `LlmSettings` row, decrypt the key, report configured / unreadable-key state. | prisma, `secret-box` |
| `lib/llm/client.ts` | Thin OpenAI-compatible client: streaming `chatCompletion()` that parses SSE into text deltas and assembled tool calls; maps HTTP errors to friendly messages. | `fetch` |
| `lib/llm/sse.ts` | Pure SSE / tool-call-delta assembly, separated for testing. | — |
| `lib/llm/ontology.ts` | Declarative entity catalog: fields, types, enums, relations, hrefs, descriptions, exclusions, scoping. | Prisma enums |
| `lib/llm/query.ts` | Compiles ontology filters / includes / sorts into Prisma arguments; rejects anything not in the ontology. | ontology |
| `lib/llm/aggregate.ts` | Pure in-memory aggregation: measures, group-bys, date buckets, polymorphic asset grouping. | — |
| `lib/llm/tools/*.ts` | Tool registry. Each tool: name, description, zod args → JSON Schema, `status label`, `run(args, ctx)`. | ontology, query, aggregate, existing libs |
| `lib/llm/prompt.ts` | Builds the system prompt. | ontology |
| `lib/llm/agent.ts` | The round loop. Takes the client and tool registry as parameters so it can be tested with fakes. Emits events through a callback. | — |
| `app/api/chat/route.ts` | Auth, validation, config, NDJSON stream wiring, abort on disconnect. | all of the above |
| `lib/actions/llm-settings.ts` | `updateLlmSettings`, `testLlmConnection` server actions. | config, client |

`ctx` passed to every tool carries `userId` (for notification scoping) and
`now` (so date logic is testable).

## Ontology

`lib/llm/ontology.ts` declares every reachable entity once:

```ts
vehicle: {
  model: "vehicle",
  label: "Vehicle",
  description: "Cars, trucks, boats, mowers — anything with a mileage or hour meter.",
  assetType: "VEHICLE",
  href: (r) => `/assets/vehicles/${r.id}`,
  nameField: "name",
  fields: {
    name:           { type: "string" },
    make:           { type: "string" },
    year:           { type: "int" },
    purchasePrice:  { type: "money" },
    currentMileage: { type: "int", description: "Current odometer or hour-meter reading" },
    meterUnit:      { type: "enum", values: ["MILES", "HOURS"] },
    // …
  },
  relations: {
    serviceRecords: { entity: "serviceRecord", kind: "polymorphic" },
    warranties:     { entity: "warranty", kind: "polymorphic" },
    maintenance:    { entity: "maintenanceSchedule", kind: "polymorphic" },
  },
}
```

Entities: `property`, `vehicle`, `equipment`, `person`, `provider`,
`serviceRecord`, `warranty`, `maintenanceSchedule`, `healthCondition`,
`medication`, `allergy`, `immunization`, `insurancePolicy`, `notification`.

Field types: `string`, `int`, `number`, `money`, `date`, `boolean`, `enum`.
Each type defines its allowed filter operators:

| Type | Operators |
|---|---|
| string | `eq`, `ne`, `contains`, `in`, `isNull` |
| int / number / money / date | `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `isNull` |
| boolean | `eq` |
| enum | `eq`, `ne`, `in` |

`contains` is case-insensitive (SQLite `LIKE` via Prisma `contains` is already
case-insensitive for ASCII).

Relation kinds:

- **direct** — a Prisma relation (`equipment.property`, `medication.person`,
  `insurancePolicy.members`). Compiled to Prisma `include` / relation filters.
- **polymorphic** — `assetId` + `assetType` on service records, warranties and
  maintenance schedules. Resolved by the query layer: filters on
  `asset.name` look up matching asset ids across the asset tables first; rows
  are returned with a resolved `asset: { type, id, name, href }`.

Scoping: `notification` has `scope: (ctx) => ({ userId: ctx.userId })` which is
always merged into its `where` and cannot be overridden.

Anything not declared — fields or entities — is unreachable. Excluded
explicitly: `User`, `MailSettings`, `LlmSettings`, `Attachment`,
`imageFilename`, `createdById`, `passwordHash`.

## Tools

All tools are read-only. Arguments are zod schemas converted to JSON Schema for
the `tools` array. Every returned row carries `href` when the entity has a
page. Dates are returned as `YYYY-MM-DD`, read in UTC (matching the I3 calendar
fix). Default `limit` 25, max 100. A tool result is truncated at ~12k characters
with a `"truncated": true` flag and a note telling the model to narrow the query.

Tool errors (bad args, unknown field, not found) are returned to the model as a
`{"error": "..."}` tool message with a hint (e.g. the list of valid fields) so it
can correct itself within the round budget. They are not shown to the user.

### Shortcut tools (curated)

Descriptions tell the model to prefer these.

| Tool | Args | Returns | Reuses |
|---|---|---|---|
| `search` | `query`, `entities?` | Name matches across all named entities: `{entity, id, name, href, summary}` | `loadAssetIndex` plus provider / condition / medication / insurance names |
| `cost_summary` | `assetType?`, `assetIds?` (people are assets too), `from?`, `to?`, `category?`, `groupBy` (1–2 of `asset`, `year`, `quarter`, `month`, `category`, `vendor`) | Buckets with total and count, grand total — comparisons across assets or years in one call | `loadCostRecords`, `rollup`, `cents` |
| `asset_history` | `assetType`, `assetId`, `from?`, `to?` | Chronological timeline for one asset or person: service records, warranty start/expiry, maintenance completions; for a person also conditions diagnosed/resolved, immunizations, medication start/end | `loadReport` |
| `maintenance_status` | `assetType?`, `assetId?`, `status?` (`overdue`, `due_soon`, `all`), `withinDays?` | Schedules with next due date/mileage and due state, including mileage-based due | `scheduleDue`, `loadVehicleMileage`, `dueCandidateFilter` |
| `health_alerts` | `personId?` | Refills due, immunizations due, insurance expiring | `refillDue`, `immunizationDue`, `insuranceExpiring`, `HEALTH_WINDOWS` |

### Generic tools (ontology-driven)

| Tool | Args | Purpose |
|---|---|---|
| `find_records` | `entity`, `filters?: {field, op, value}[]`, `include?: relation[]`, `fields?`, `sort?: {field, dir}`, `limit?` | List / filter any entity. Filters may go one relation hop (`asset.name`, `person.name`, `property.name`). |
| `get_record` | `entity`, `id`, `include?: relation[]` | One row plus related rows. |
| `aggregate` | `entity`, `measure` (`count`, or `sum`/`avg`/`min`/`max` of a numeric field), `groupBy?` (fields, relation name labels, or `year`/`quarter`/`month` of a date field), `filters?` | Counts and totals grouped any way the ontology allows. |

The ontology summary (entities, key fields, enum values, relations) is baked
into the system prompt in compact form; `find_records`' description points the
model at it. No separate `describe_data` tool — the prompt already carries it,
and one fewer tool helps weak models.

Aggregation runs in memory after a filtered `findMany` (same reasoning as
`lib/costs-server.ts`: SQLite can't group by an extracted year without raw SQL,
and polymorphic asset names can't be resolved in an aggregate query). Fine at
household scale.

### Status labels

Each tool has a friendly label for the UI status event, e.g. `search` →
"Searching…", `cost_summary` → "Adding up costs…", `find_records` on
`serviceRecord` → "Looking up service records…".

## System prompt

Built by `lib/llm/prompt.ts`:

- Role: HomeCenter's household assistant; answer **only** from tool data; say
  plainly when the data doesn't contain the answer; never invent records.
- Today's date (UTC).
- Compact ontology summary.
- Guidance: prefer shortcut tools; use `search` to resolve names to ids; call
  independent tools in parallel.
- Answer format: concise markdown; tables for comparisons; money as `$1,234.56`;
  link records as markdown links to their `href` (relative paths).
- The admin's optional extra instructions appended last.

## Agent loop

`runAgent({ messages, client, tools, ctx, emit, signal })`:

1. Build `[system, ...history]`. History is the last 20 client messages.
2. For round 1..5: stream a completion with `tools` and `tool_choice: "auto"`.
   - Text deltas are forwarded as `delta` events as they arrive.
   - If the round finishes with no tool calls → emit `done`, stop.
   - Otherwise append the assistant tool-call message, run all tool calls in
     parallel (`Promise.all`), emit a `status` event per call, append each result
     as a `tool` message.
3. If round 5 still ended in tool calls → one final streamed call with
   `tool_choice: "none"` plus a system nudge: "Answer now using the data
   gathered; say what couldn't be determined." Emit `done`.

**Text alongside tool calls.** Some models emit a "let me check…" preface in
the same round as tool calls. Text deltas are forwarded immediately (buffering
would defeat streaming); if tool calls then appear in that round, the agent
emits a `reset` event and the UI clears the in-progress assistant text. Most
providers send tool calls instead of text, so resets are rare.

Limits: total wall clock 120 s; each upstream request 60 s; the client
disconnecting (`request.signal`) aborts the in-flight upstream fetch and stops
the loop.

## API contract

**`POST /api/chat`** (`runtime = "nodejs"`)

Request:

```json
{ "messages": [{ "role": "user", "content": "..." }, { "role": "assistant", "content": "..." }] }
```

Validation: 1–40 messages, last is `user`, roles `user`/`assistant` only, each
≤ 8,000 chars, total ≤ 64,000 chars. Server keeps the last 20.

Pre-stream failures are plain HTTP JSON: `401` not signed in, `400` invalid
body, `503` LLM disabled or not configured.

Success: `200`, `Content-Type: application/x-ndjson`, one JSON object per line:

```
{"type":"status","tool":"cost_summary","label":"Adding up costs…","round":1}
{"type":"reset"}
{"type":"delta","text":"The Civic cost "}
{"type":"done","rounds":2,"model":"gpt-4o-mini"}
{"type":"error","message":"The provider rejected the API key — check it in Settings."}
```

`error` is terminal.

## Error handling

Upstream errors are translated like `explain()` in `lib/actions/mail-settings.ts`:

| Condition | Message |
|---|---|
| 401 / 403 | Provider rejected the API key — check it in Settings. |
| 404 | Model or URL not found — check base URL and model name. |
| 400 mentioning tools / functions | This model doesn't support tool calling — pick another in Settings. |
| 429 | Provider rate limit hit — try again shortly. |
| 5xx | Provider error — try again. |
| ECONNREFUSED / ENOTFOUND / timeout | Couldn't reach the LLM server at {host}. |
| Wall-clock cap | Took too long — try a narrower question. |

Server logs record tool names, round count, durations and errors. They **never**
record message content or tool results — the data includes health records.

## LLM settings

### Schema

```prisma
/// Single row (id is always "singleton"). Configured from Settings only.
model LlmSettings {
  id           String   @id @default("singleton")
  enabled      Boolean  @default(false)
  baseUrl      String?
  /// AES-256-GCM via lib/secret-box.ts. Optional: local servers need none.
  apiKeyEnc    String?
  model        String?
  temperature  Float?
  maxTokens    Int?
  /// Appended to the built-in system prompt.
  systemPrompt String?
  updatedAt    DateTime @updatedAt
}
```

Configured = `enabled && baseUrl && model` and the key (if stored) decrypts.

### Settings card

`components/settings/llm-settings.tsx`, admin-only, same form conventions as
`MailSettings`:

- Enabled switch, provider preset (OpenAI / Ollama / LM Studio / OpenRouter /
  Custom — fills base URL), Base URL, API key (password field, "unchanged"
  placeholder, clear checkbox), Model, Temperature (0–2), Max tokens,
  Extra instructions (textarea).
- **Test connection** uses the on-screen draft falling back to saved values,
  sends a tiny prompt with one dummy tool, and reports: reachable, model
  accepted, **tool calling supported**.
- Warning when the stored key can't be decrypted (`AUTH_SECRET` rotated).

### Server actions

`lib/actions/llm-settings.ts`: `updateLlmSettings`, `testLlmConnection` —
`requireAdmin`, zod, base URL must be `http(s)`, temperature 0–2, max tokens
1–32,000, `revalidatePath("/settings")` and the layout. The API key is never
sent to the browser.

## Chat UI

### Thread hook — `components/chat/use-chat-thread.ts`

- Thread in `sessionStorage` under `hc.chat.{userId}` as `{role, content}[]`;
  every read/write in `try/catch` (storage can be unavailable).
- `send(text)`: append the user message, POST the thread (last 20), read the
  NDJSON stream, update the in-flight assistant message on `delta`, clear it on
  `reset`, show the latest `status` label while working.
- `stop()` aborts the fetch; the partial answer is kept.
- On error: the user message stays, an inline error with **Retry** replaces the
  assistant bubble; a failed turn is not saved as an assistant message.
- `clear()` for "New chat".

### Components — `components/chat/`

- `chat-thread.tsx` — message list and composer, used by both surfaces.
  - Assistant messages render as markdown with `react-markdown` + `remark-gfm`
    (new dependencies; raw HTML disabled). Relative links render as
    `next/link`, so following one keeps the panel open.
  - Status chip while tools run.
  - Composer: textarea, Enter sends, Shift+Enter newline, Stop while streaming,
    New chat.
  - Empty state with 3–4 clickable example prompts.
  - Footnote: "Answers are generated from your HomeCenter data by {model} and
    can be wrong."
- `chat-panel.tsx` — `Sheet` from the right, ~420 px (full width on mobile),
  opened by a `MessageSquare` header button beside the notification bell;
  header has an "Open full page" link to `/chat`.
- `app/(app)/chat/page.tsx` — full-height thread; sidebar item **Assistant**
  directly under Dashboard.

### Availability

The layout passes `{ available, isAdmin, model }` to the header. Not configured:
non-admins see no chat button or nav item and `/chat` says the assistant isn't
set up; admins see the button and an empty state linking to Settings.

## Testing

Vitest, pure logic with fakes:

- **Query compiler:** valid operators per type; unknown / excluded field or
  entity rejected with a helpful error; enum value validation; one-hop relation
  filters; polymorphic `asset.name` filter; notification scope always applied.
- **Aggregate:** count / sum / avg / min / max; group by field, relation label,
  and year / quarter / month buckets; polymorphic asset grouping; money summed
  in cents.
- **SSE parser:** text deltas; tool-call deltas split across chunks and across
  multiple parallel calls; `[DONE]`.
- **Agent loop** with a fake client and fake tools: early exit on a text-only
  round; 5-round cap then forced `tool_choice: "none"`; parallel tool calls;
  tool error fed back as a tool message; `reset` when text precedes tool calls;
  abort stops the loop.
- **NDJSON reader** on the client: partial lines across chunks.
- **Settings validation:** URL, temperature, max tokens.

Plus `npm run lint`, `next build`, and driving the app against a real provider
(OpenAI and a local Ollama model) with comparison and history questions.

## Out of scope

- Uploaded documents / attachment contents.
- Any write actions through chat.
- Server-side thread storage, multiple saved threads.
- `LLM_*` environment-variable fallback.
- Rate limiting, per-user usage quotas, cost tracking.
- Non-OpenAI-compatible provider APIs (e.g. native Anthropic Messages).
