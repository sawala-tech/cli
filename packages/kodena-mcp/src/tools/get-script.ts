import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { type ToolDefinition, type ToolInputSchema, zodParser } from './types'

const slugSchema = z
  .object({ slug: z.string().min(1, 'slug is required').max(64) })
  .strict()

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    slug: {
      type: 'string',
      description: 'The script slug (1–64 chars, e.g. "my-blog").',
      minLength: 1,
      maxLength: 64,
    },
  },
  required: ['slug'],
  additionalProperties: false,
}

// Response shape of `GET /kodena/scripts/:slug` after `withDerived()` — see
// sawala-cloud-core/services/kodena/src/types.ts. snake_case throughout.
// `project_slug` and `project_id` are intentionally NOT typed here: the
// backend stores them but the values have been observed to be unreliable
// (set from a client-supplied header that the gateway does not validate),
// so the MCP strips them rather than exposing misleading data to callers.
interface ScriptDetail {
  script_slug: string
  org_handle: string
  name: string
  custom_hostname: string | null
  kind: string
  script_content: string
  assets_manifest: string
  assets_manifest_parsed?: unknown
  worker_module_size: number | null
  vars_parsed?: Record<string, string>
  compatibility_flags_parsed?: string[]
  compatibility_date: string | null
  tenant_subdomain?: string
  dispatched_name?: string
  created_on: string
  modified_on: string
}

export const getScriptTool: ToolDefinition<z.infer<typeof slugSchema>> = {
  name: 'kodena_get_script',
  description:
    'Return full details for one Kodena script: deployment metadata, bundle kind, ' +
    'custom-hostname state, asset manifest summary, and timestamps. Use when the user ' +
    'names a specific slug ("show me my-blog", "what is foo?"). Use `kodena_list_scripts` ' +
    'for browsing.',
  inputSchema,
  annotations: { title: 'Get script', readOnlyHint: true },
  parseInput: zodParser(slugSchema),
  async handle({ slug }, ctx: CliContext) {
    const row = await apiFetch<ScriptDetail>(
      ctx,
      `/kodena/scripts/${encodeURIComponent(slug)}`,
    )
    return {
      slug: row.script_slug,
      name: row.name,
      orgHandle: row.org_handle,
      url: resolvePublicUrl(row),
      tenantSubdomain: row.tenant_subdomain,
      dispatchedName: row.dispatched_name,
      kind: row.kind,
      customHostname: row.custom_hostname,
      scriptContent: row.script_content,
      assetsManifest: row.assets_manifest_parsed,
      workerModuleSize: row.worker_module_size,
      vars: row.vars_parsed,
      compatibilityFlags: row.compatibility_flags_parsed,
      compatibilityDate: row.compatibility_date,
      createdAt: row.created_on,
      updatedAt: row.modified_on,
    }
  },
}

function resolvePublicUrl(row: ScriptDetail): string {
  if (row.custom_hostname) return `https://${row.custom_hostname}`
  const sub = row.tenant_subdomain ?? `${row.script_slug}-${row.org_handle}`
  return `https://${sub}.kodena.id`
}
