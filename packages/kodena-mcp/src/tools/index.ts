import { checkSlugAvailableTool } from './check-slug-available'
import { createScriptTool } from './create-script'
import { getCustomDomainStatusTool } from './get-custom-domain-status'
import { getOrgHandleTool } from './get-org-handle'
import { getScriptTool } from './get-script'
import { listOrgsTool } from './list-orgs'
import { listProjectsTool } from './list-projects'
import { listScriptsTool } from './list-scripts'
import { setOrgHandleTool } from './set-org-handle'
import type { ToolDefinition } from './types'
import { updateScriptTool } from './update-script'
import { whoamiTool } from './whoami'

/**
 * All Kodena MCP tools, in the order they appear in `tools/list`.
 *
 * M2 ships read-only tools (every `readOnlyHint: true`). M3 appends
 * non-destructive writes (destructiveHint: false). Destructive/deploy
 * tools (M4) get appended here as they land.
 */
export const ALL_TOOLS: ReadonlyArray<ToolDefinition<unknown>> = [
  // M2 — read-only
  whoamiTool,
  listOrgsTool,
  listProjectsTool,
  listScriptsTool,
  getScriptTool,
  checkSlugAvailableTool,
  getOrgHandleTool,
  getCustomDomainStatusTool,
  // M3 — non-destructive writes
  createScriptTool,
  updateScriptTool,
  setOrgHandleTool,
] as ReadonlyArray<ToolDefinition<unknown>>

export const TOOLS_BY_NAME: ReadonlyMap<string, ToolDefinition<unknown>> = new Map(
  ALL_TOOLS.map((t) => [t.name, t]),
)
