import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { type ToolDefinition, type ToolInputSchema, zodParser } from './types'

const HOSTNAME = /^(?=.{1,253}$)(?!-)(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}$/

const inputZod = z
  .object({
    slug: z.string().min(1, 'slug is required').max(64),
    domain: z.string().regex(HOSTNAME, 'domain must be a valid public hostname'),
  })
  .strict()

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    slug: { type: 'string', description: 'The target script slug.', minLength: 1, maxLength: 64 },
    domain: {
      type: 'string',
      description:
        'The public hostname to attach (e.g. `blog.acme.com`). The user is responsible ' +
        'for CNAME-pointing it at the tenant URL; SSL provisions automatically once DNS ' +
        'resolves. Use `kodena_get_custom_domain_status` afterwards to track provisioning.',
    },
  },
  required: ['slug', 'domain'],
  additionalProperties: false,
}

export const setCustomDomainTool: ToolDefinition<z.infer<typeof inputZod>> = {
  name: 'kodena_set_custom_domain',
  description:
    'Attach a custom hostname to a Kodena script. The hostname starts serving once the ' +
    'user CNAMEs it at the tenant URL and SSL provisions. Affects DNS-resolution state ' +
    'outside Sawala (openWorldHint). Use `kodena_get_custom_domain_status` to track ' +
    'provisioning, and `kodena_remove_custom_domain` to detach.',
  inputSchema,
  annotations: {
    title: 'Set custom domain',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
  parseInput: zodParser(inputZod),
  async handle({ slug, domain }, ctx: CliContext) {
    return apiFetch(
      ctx,
      `/kodena/scripts/${encodeURIComponent(slug)}/custom-domain`,
      { method: 'POST', body: { domain } },
    )
  },
}
