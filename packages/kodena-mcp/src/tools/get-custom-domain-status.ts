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
      description: 'The script slug whose custom-domain status to fetch.',
      minLength: 1,
      maxLength: 64,
    },
  },
  required: ['slug'],
  additionalProperties: false,
}

export const getCustomDomainStatusTool: ToolDefinition<z.infer<typeof inputZod>> = {
  name: 'kodena_get_custom_domain_status',
  description:
    'Return SSL + DNS provisioning status for the script’s attached custom domain. ' +
    'Useful for "is my domain ready", "why is my domain still pending", or ' +
    'troubleshooting after `kodena_set_custom_domain`. Returns null/404 if the ' +
    'script has no custom domain attached.',
  inputSchema,
  annotations: { title: 'Get custom-domain status', readOnlyHint: true },
  parseInput: zodParser(inputZod),
  async handle({ slug }, ctx: CliContext) {
    return apiFetch(
      ctx,
      `/kodena/scripts/${encodeURIComponent(slug)}/custom-domain-status`,
    )
  },
}
