import type { RegisteredTool } from "./registry"
import {
  assetHistoryTool, costSummaryTool, healthAlertsTool, maintenanceStatusTool, observationLogTool, searchTool, warrantyStatusTool,
} from "./shortcuts"
import { aggregateTool, findRecordsTool, getRecordTool } from "./generic"
import { documentTools } from "./documents"
import type { DocumentAccess } from "@/lib/documents/tool-helpers"

const SHORTCUT_TOOLS: RegisteredTool[] = [
  searchTool,
  costSummaryTool,
  assetHistoryTool,
  maintenanceStatusTool,
  warrantyStatusTool,
  healthAlertsTool,
  observationLogTool,
]
const GENERIC_TOOLS: RegisteredTool[] = [findRecordsTool, getRecordTool, aggregateTool]

/** Shortcuts first: weaker models tend to pick from the top of the list. */
export const TOOLS: RegisteredTool[] = [...SHORTCUT_TOOLS, ...GENERIC_TOOLS]

/** The chat's tools: document tools go between the shortcuts and the generic tools when allowed. */
export function chatTools(access: DocumentAccess): RegisteredTool[] {
  return access.enabled ? [...SHORTCUT_TOOLS, ...documentTools(access.includeHealth), ...GENERIC_TOOLS] : TOOLS
}
