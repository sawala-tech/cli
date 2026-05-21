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
  })
  .strict()

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    slug: {
      type: 'string',
      description:
        'Candidate script slug to check. Lowercase, alphanumeric + hyphens, 1–64 chars.',
      minLength: 1,
      maxLength: 64,
      pattern: '^[a-z0-9][a-z0-9-]*$',
    },
  },
  required: ['slug'],
  additionalProperties: false,
}

interface SlugAvailableResponse {
  available: boolean
  reason?: string
}

export const checkSlugAvailableTool: ToolDefinition<z.infer<typeof inputZod>> = {
  name: 'kodena_check_slug_available',
  description:
    'Check whether a script slug is available before creating a new script. Returns ' +
    '{ available: boolean, reason?: string }. Slugs are unique per organisation. ' +
    'Use this before calling `kodena_create_script` so the agent can suggest an ' +
    'alternative on conflict.',
  inputSchema,
  annotations: { title: 'Check slug available', readOnlyHint: true },
  parseInput: zodParser(inputZod),
  async handle({ slug }, ctx: CliContext) {
    const result = await apiFetch<SlugAvailableResponse>(
      ctx,
      `/kodena/scripts/slug-available?slug=${encodeURIComponent(slug)}`,
    )
    return { slug, ...result }
  },
}
