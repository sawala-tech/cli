import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import {
  EMPTY_INPUT_SCHEMA,
  emptyInputParser,
  type ToolDefinition,
} from './types'

interface ScriptSummary {
  slug: string
  orgHandle: string | null
  tenantSubdomain: string | null
  customHostname: string | null
  kind: string
  createdAt: string
  updatedAt: string
}

export const listScriptsTool: ToolDefinition<Record<string, never>> = {
  name: 'kodena_list_scripts',
  description:
    'List every Kodena script in the active organisation. A "script" is a deployed ' +
    'Cloudflare Worker bundle owned by an org — its slug becomes the subdomain it ' +
    'serves from (e.g. `my-blog` → `my-blog-acme.kodena.id`). Use this for browsing ' +
    '("what scripts do I have"); use `kodena_get_script` when the user names a ' +
    'specific slug. Takes no input.',
  inputSchema: EMPTY_INPUT_SCHEMA,
  annotations: { title: 'List scripts', readOnlyHint: true },
  parseInput: emptyInputParser,
  async handle(_input: Record<string, never>, ctx: CliContext) {
    const scripts = await apiFetch<ScriptSummary[]>(ctx, '/kodena/scripts')
    return {
      activeOrg: ctx.activeOrg,
      count: scripts.length,
      scripts: scripts.map((s) => ({
        slug: s.slug,
        url: resolvePublicUrl(s),
        kind: s.kind,
        customHostname: s.customHostname,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
    }
  },
}

function resolvePublicUrl(s: ScriptSummary): string | null {
  if (s.customHostname) return `https://${s.customHostname}`
  if (s.tenantSubdomain) return `https://${s.tenantSubdomain}.kodena.id`
  if (s.orgHandle) return `https://${s.slug}-${s.orgHandle}.kodena.id`
  return null
}
