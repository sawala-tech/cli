import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import {
  EMPTY_INPUT_SCHEMA,
  emptyInputParser,
  type ToolDefinition,
} from './types'

interface OrgHandleResponse {
  handle: string | null
}

export const getOrgHandleTool: ToolDefinition<Record<string, never>> = {
  name: 'kodena_get_org_handle',
  description:
    'Return the active organisation’s Kodena handle — the 1–16-char lowercase string ' +
    'that appears in every tenant URL (`<slug>-<handle>.kodena.id`). Returns null if ' +
    'the org has not claimed a handle yet. Use this when the user asks "what is my ' +
    'handle" or "what does my tenant URL look like". Takes no input.',
  inputSchema: EMPTY_INPUT_SCHEMA,
  annotations: { title: 'Get org handle', readOnlyHint: true },
  parseInput: emptyInputParser,
  async handle(_input: Record<string, never>, ctx: CliContext) {
    const result = await apiFetch<OrgHandleResponse>(ctx, '/kodena/org-handle')
    return {
      activeOrg: ctx.activeOrg,
      handle: result.handle,
    }
  },
}
