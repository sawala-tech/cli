import { checkSlugAvailableTool } from './check-slug-available'
import { createScriptTool } from './create-script'
import { deleteScriptTool } from './delete-script'
import { deployScriptTool } from './deploy-script'
import { getCustomDomainStatusTool } from './get-custom-domain-status'
import { getOrgHandleTool } from './get-org-handle'
import { getScriptTool } from './get-script'
import { listOrgsTool } from './list-orgs'
import { listProjectsTool } from './list-projects'
import { listScriptsTool } from './list-scripts'
import { patchAssetsTool } from './patch-assets'
import { rebuildAssetsManifestTool } from './rebuild-assets-manifest'
import { rehydrateScriptTool } from './rehydrate-script'
import { removeCustomDomainTool } from './remove-custom-domain'
import { setCustomDomainTool } from './set-custom-domain'
import { setOrgHandleTool } from './set-org-handle'
import type { ToolDefinition } from './types'
import { updateScriptTool } from './update-script'
import { whoamiTool } from './whoami'

/**
 * Every tool the server can register, before the read-only filter.
 *
 * Order matters: it's the order `tools/list` returns and the order hosts
 * surface in their UI. Read tools come first (cheap, safe defaults
 * preferred by agents), then non-destructive writes, then destructive
 * tools at the bottom.
 */
const ALL_TOOLS_UNFILTERED: ReadonlyArray<ToolDefinition<unknown>> = [
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
  // M4 — destructive / deploy
  deployScriptTool,
  setCustomDomainTool,
  removeCustomDomainTool,
  deleteScriptTool,
  rebuildAssetsManifestTool,
  patchAssetsTool,
  rehydrateScriptTool,
] as ReadonlyArray<ToolDefinition<unknown>>

/**
 * True when the operator has set `KODENA_MCP_READ_ONLY=1` in the MCP
 * server's environment. Resolved once at module load — the host's MCP
 * config sets the env when spawning the server and it doesn't change
 * during a session.
 */
export function isReadOnlyMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['KODENA_MCP_READ_ONLY'] === '1'
}

/**
 * The tool list actually exposed by this server instance. In read-only
 * mode, every write tool (M3 + M4) is filtered out — hosts see only the
 * M2 read surface and `tools/call` on any write tool fails with -32602
 * InvalidInput "Unknown tool".
 */
export const ALL_TOOLS: ReadonlyArray<ToolDefinition<unknown>> = isReadOnlyMode()
  ? ALL_TOOLS_UNFILTERED.filter((t) => t.annotations.readOnlyHint === true)
  : ALL_TOOLS_UNFILTERED

export const TOOLS_BY_NAME: ReadonlyMap<string, ToolDefinition<unknown>> = new Map(
  ALL_TOOLS.map((t) => [t.name, t]),
)

/** Test seam: full unfiltered list, regardless of env state. */
export const ALL_TOOLS_FOR_TESTING = ALL_TOOLS_UNFILTERED
