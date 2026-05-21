import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { type ToolDefinition, type ToolInputSchema, zodParser } from './types'

const inputZod = z
  .object({
    slug: z
      .string()
      .min(1, 'slug is required')
      .max(64)
      .regex(/^[a-z0-9][a-z0-9-]*$/, 'slug must be lowercase alphanumeric with hyphens'),
    name: z.string().min(1).max(128).optional(),
  })
  .strict()

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    slug: {
      type: 'string',
      description:
        'The new script slug (lowercase, alphanumeric + hyphens, 1–64 chars). ' +
        'Becomes part of the tenant URL: `<slug>-<orgHandle>.kodena.id`. ' +
        'Call `kodena_check_slug_available` first to avoid 409 conflicts.',
      minLength: 1,
      maxLength: 64,
      pattern: '^[a-z0-9][a-z0-9-]*$',
    },
    name: {
      type: 'string',
      description: 'Optional human-readable display name. Defaults to the slug.',
      minLength: 1,
      maxLength: 128,
    },
  },
  required: ['slug'],
  additionalProperties: false,
}

export const createScriptTool: ToolDefinition<z.infer<typeof inputZod>> = {
  name: 'kodena_create_script',
  description:
    'Create a new empty Kodena script in the active organisation. The script row is ' +
    'reserved at the given slug but contains no worker code or assets yet — call ' +
    '`kodena_deploy_script` after this to upload a bundle. Returns the created script ' +
    'row. Fails with 409 if the slug is already taken; check first with ' +
    '`kodena_check_slug_available`.',
  inputSchema,
  annotations: {
    title: 'Create script',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
  },
  parseInput: zodParser(inputZod),
  async handle({ slug, name }, ctx: CliContext) {
    return apiFetch(ctx, '/kodena/scripts', {
      method: 'POST',
      body: { scriptSlug: slug, name: name ?? slug },
    })
  },
}
