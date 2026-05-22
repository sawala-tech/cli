import type { ToolDefinition } from './types'
import { whoamiTool } from './whoami'

/**
 * Every tool the server registers. The order is the order `tools/list`
 * returns and the order hosts surface in their UI.
 */
export const ALL_TOOLS: ReadonlyArray<ToolDefinition<unknown>> = [
  whoamiTool,
] as ReadonlyArray<ToolDefinition<unknown>>

export const TOOLS_BY_NAME: ReadonlyMap<string, ToolDefinition<unknown>> = new Map(
  ALL_TOOLS.map((t) => [t.name, t]),
)
