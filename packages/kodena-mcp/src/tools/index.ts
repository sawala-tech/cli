import { checkSlugAvailableTool } from './check-slug-available'
import { getCustomDomainStatusTool } from './get-custom-domain-status'
import { getOrgHandleTool } from './get-org-handle'
import { getScriptTool } from './get-script'
import { listOrgsTool } from './list-orgs'
import { listProjectsTool } from './list-projects'
import { listScriptsTool } from './list-scripts'
import type { ToolDefinition } from './types'
import { whoamiTool } from './whoami'

/**
 * All Kodena MCP tools, in the order they appear in `tools/list`.
 *
 * M2 ships only read-only tools (every `readOnlyHint: true`). Write
 * tools (M3) and destructive/deploy tools (M4) get appended here as
 * they land.
 */
export const ALL_TOOLS: ReadonlyArray<ToolDefinition<unknown>> = [
  whoamiTool,
  listOrgsTool,
  listProjectsTool,
  listScriptsTool,
  getScriptTool,
  checkSlugAvailableTool,
  getOrgHandleTool,
  getCustomDomainStatusTool,
] as ReadonlyArray<ToolDefinition<unknown>>

export const TOOLS_BY_NAME: ReadonlyMap<string, ToolDefinition<unknown>> = new Map(
  ALL_TOOLS.map((t) => [t.name, t]),
)
