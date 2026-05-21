import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { type ToolDefinition, type ToolInputSchema, zodParser } from './types'

const inputZod = z
  .object({ slug: z.string().min(1, 'slug is required').max(64) })
  .strict()

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    slug: {
      type: 'string',
      description: 'The script whose asset manifest to rebuild from the stored objects.',
      minLength: 1,
      maxLength: 64,
    },
  },
  required: ['slug'],
  additionalProperties: false,
}

export const rebuildAssetsManifestTool: ToolDefinition<z.infer<typeof inputZod>> = {
  name: 'kodena_rebuild_assets_manifest',
  description:
    'Recompute a script’s asset manifest from the stored asset objects. Use when a ' +
    'deploy left the manifest out of sync with the actual asset KV (rare; usually ' +
    'only after a partial-failure or operator intervention). Idempotent. The serving ' +
    'state may briefly flicker between old/new manifest.',
  inputSchema,
  annotations: {
    title: 'Rebuild assets manifest',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
  },
  parseInput: zodParser(inputZod),
  async handle({ slug }, ctx: CliContext) {
    return apiFetch(
      ctx,
      `/kodena/scripts/${encodeURIComponent(slug)}/assets/rebuild-manifest`,
      { method: 'POST' },
    )
  },
}
