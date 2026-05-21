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
      description: 'The script slug to rehydrate.',
      minLength: 1,
      maxLength: 64,
    },
  },
  required: ['slug'],
  additionalProperties: false,
}

export const rehydrateScriptTool: ToolDefinition<z.infer<typeof inputZod>> = {
  name: 'kodena_rehydrate_script',
  description:
    'Re-push a Kodena script’s stored bundle to Cloudflare without re-uploading from ' +
    'the user’s filesystem. Useful after a Cloudflare-side incident or after a ' +
    'dispatch-namespace migration where the script row exists in Kodena D1 but the ' +
    'Worker is missing from the CF namespace. Idempotent; no input artefacts needed.',
  inputSchema,
  annotations: {
    title: 'Rehydrate script',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
  },
  parseInput: zodParser(inputZod),
  async handle({ slug }, ctx: CliContext) {
    return apiFetch(
      ctx,
      `/kodena/scripts/${encodeURIComponent(slug)}/rehydrate`,
      { method: 'POST' },
    )
  },
}
