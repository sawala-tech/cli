import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import {
  EMPTY_INPUT_SCHEMA,
  emptyInputParser,
  type ToolDefinition,
} from './types'

interface MeResponse {
  id: string
  email: string | null
  displayName: string | null
  orgId: string | null
  orgSlug: string | null
  tokenScope: {
    tokenId: string
    scopeOrgId: string | null
    scopeOrgSlug: string | null
    label: string
  } | null
}

export const whoamiTool: ToolDefinition<Record<string, never>> = {
  name: 'sawala_whoami',
  description:
    'Return the identity attached to the active Sawala CLI token: email, display name, ' +
    'active org/project context, and the token’s scope label. Use this when the user ' +
    'asks "who am I", "what org am I in", or "what token am I using". Takes no input.',
  inputSchema: EMPTY_INPUT_SCHEMA,
  annotations: { title: 'Show Sawala identity', readOnlyHint: true },
  parseInput: emptyInputParser,
  async handle(_input: Record<string, never>, ctx: CliContext) {
    const me = await apiFetch<MeResponse>(ctx, '/cli/organization/me')
    return {
      id: me.id,
      email: me.email,
      displayName: me.displayName,
      activeOrg: ctx.activeOrg,
      activeProject: ctx.activeProject,
      tokenSource: ctx.tokenSource,
      tokenScope: me.tokenScope
        ? {
            scopeOrgSlug: me.tokenScope.scopeOrgSlug,
            label: me.tokenScope.label,
          }
        : null,
    }
  },
}
