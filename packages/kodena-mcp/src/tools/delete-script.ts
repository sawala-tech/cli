import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { type ToolDefinition, type ToolInputSchema, zodParser } from './types'

const inputZod = z
  .object({
    slug: z.string().min(1, 'slug is required').max(64),
    confirm: z
      .literal(true, {
        errorMap: () => ({ message: 'confirm must be the literal value `true`' }),
      })
      .describe('explicit guard against accidental deletes'),
  })
  .strict()

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    slug: {
      type: 'string',
      description: 'The script slug to delete. The deletion cannot be undone.',
      minLength: 1,
      maxLength: 64,
    },
    confirm: {
      type: 'boolean',
      description:
        'Must be the literal value `true`. Required guard against accidental deletes ' +
        '— the host should surface its destructive-action prompt and only call this ' +
        'tool with confirm=true after explicit user approval.',
      enum: [true],
    },
  },
  required: ['slug', 'confirm'],
  additionalProperties: false,
}

export const deleteScriptTool: ToolDefinition<z.infer<typeof inputZod>> = {
  name: 'kodena_delete_script',
  description:
    'IRREVERSIBLY delete a Kodena script and all its deployed code, assets, and ' +
    'configuration. The tenant URL stops serving immediately; any attached custom ' +
    'domain is detached. Requires `confirm: true` as an explicit input guard on ' +
    'top of the host’s own destructive-action prompt — both must agree.',
  inputSchema,
  annotations: {
    title: 'Delete script',
    readOnlyHint: false,
    destructiveHint: true,
    irreversibleHint: true,
    idempotentHint: true,
  },
  parseInput: zodParser(inputZod),
  async handle({ slug }, ctx: CliContext) {
    return apiFetch(
      ctx,
      `/kodena/scripts/${encodeURIComponent(slug)}`,
      { method: 'DELETE' },
    )
  },
}
