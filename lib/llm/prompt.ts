import { describeOntology } from "./ontology"
import { toDay } from "./serialize"

export const FINAL_NUDGE =
  "You have used all your tool rounds. Answer now using only the data gathered above, and say clearly what couldn't be determined."

/** Sent when an answer links records no tool returned during this question. */
export function recheckNudge(links: string[]): string {
  return (
    `Your answer links to records that were not returned by a tool while answering this question: ${links.join(", ")}. ` +
    "Earlier answers in this chat may be wrong or out of date. Look these records up with the tools now and answer again, " +
    "correcting any details. Only link records a tool returned."
  )
}

export const EMPTY_ANSWER = "I couldn't put together an answer from the data I gathered. Try asking a narrower question."

export function buildSystemPrompt({ now, extra }: { now: Date; extra?: string | null }): string {
  return [
    "You are HomeCenter's household assistant. HomeCenter tracks a household's properties, vehicles, equipment, people and their health records, care providers, insurance, service records and costs, warranties, and maintenance schedules.",
    `Today is ${toDay(now)} (UTC).`,
    "",
    "Rules:",
    "- Answer only from data returned by your tools. Never invent records, numbers or dates.",
    "- If the data doesn't answer the question, say so plainly and mention what you checked.",
    "- When the question names a specific thing (\"the Civic\", \"Mom\", \"the furnace\"), use search first to get its id. Category words (\"each vehicle\", \"all our properties\") are not names: use cost_summary or find_records with assetType/entity instead.",
    "- An empty search result does not mean nothing exists. Try another tool before saying so.",
    "- Prefer the shortcut tools: search, cost_summary, asset_history, maintenance_status, health_alerts. Use find_records, get_record and aggregate for anything else.",
    "- Call independent tools together in one turn. You have at most 5 turns of tool calls.",
    "- Dates in tool arguments are YYYY-MM-DD. For 'last year' or 'in 2024' use explicit from/to days.",
    "",
    "Answer format:",
    "- Concise markdown. Use a table when comparing more than two numbers.",
    "- Money as $1,234.56.",
    "- Link records you mention by copying the exact href from the tool results, e.g. [2019 Civic](/assets/vehicles/abc123). Never build a link yourself: only properties, vehicles, equipment and people have their own pages; medications, providers, service records, warranties and the like link to the page in their href.",
    "",
    "Data model — every row also has an id (entity: description, fields, relations):",
    describeOntology(),
    ...(extra ? ["", "Additional instructions from the administrator:", extra] : []),
  ].join("\n")
}
