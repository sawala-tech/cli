import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import {
  EMPTY_INPUT_SCHEMA,
  emptyInputParser,
  type ToolDefinition,
} from './types'

// Response shape of `GET /kodena/scripts` — see
// sawala-cloud-core/services/kodena/src/types.ts (Script + withDerived).
// The backend serialises rows in snake_case and adds `tenant_subdomain`
// as a derived field on every row.
interface ScriptSummary {
  script_slug: string
  org_handle: string
  tenant_subdomain: string
  custom_hostname: string | null
  kind: string
  created_on: string
  modified_on: string
}

export const listScriptsTool: ToolDefinition<Record<string, never>> = {
  name: 'kodena_list_scripts',
  description:
    'List every Kodena script in the active organisation AND active project (the ' +
    'backend filters on both org_id and project_id — switching projects changes ' +
    'what this returns). A "script" is a deployed Cloudflare Worker bundle — its ' +
    'slug becomes the subdomain it serves from (e.g. `my-blog` → ' +
    '`my-blog-acme.kodena.id`). Use this for browsing ("what scripts do I have"); ' +
    'use `kodena_get_script` when the user names a specific slug. Takes no input.',
  inputSchema: EMPTY_INPUT_SCHEMA,
  annotations: { title: 'List scripts', readOnlyHint: true },
  parseInput: emptyInputParser,
  async handle(_input: Record<string, never>, ctx: CliContext) {
    const scripts = await apiFetch<ScriptSummary[]>(ctx, '/kodena/scripts')
    return {
      activeOrg: ctx.activeOrg,
      count: scripts.length,
      scripts: scripts.map((s) => ({
        slug: s.script_slug,
        url: resolvePublicUrl(s),
        kind: s.kind,
        customHostname: s.custom_hostname,
        createdAt: s.created_on,
        updatedAt: s.modified_on,
      })),
    }
  },
}

function resolvePublicUrl(s: ScriptSummary): string {
  if (s.custom_hostname) return `https://${s.custom_hostname}`
  return `https://${s.tenant_subdomain}.kodena.id`
}
