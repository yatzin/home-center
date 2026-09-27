import type { RegisteredTool } from "./registry"
import {
  assetHistoryTool, costSummaryTool, healthAlertsTool, maintenanceStatusTool, observationLogTool, searchTool, warrantyStatusTool,
} from "./shortcuts"
import { aggregateTool, findRecordsTool, getRecordTool } from "./generic"

/** Shortcuts first: weaker models tend to pick from the top of the list. */
export const TOOLS: RegisteredTool[] = [
  searchTool,
  costSummaryTool,
  assetHistoryTool,
  maintenanceStatusTool,
  warrantyStatusTool,
  healthAlertsTool,
  observationLogTool,
  findRecordsTool,
  getRecordTool,
  aggregateTool,
]
