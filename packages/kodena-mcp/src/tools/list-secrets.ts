import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { type ToolDefinition, type ToolInputSchema, zodParser } from './types'

const argsSchema = z
  .object({ slug: z.string().min(1, 'slug is required').max(64) })
  .strict()

type Args = z.infer<typeof argsSchema>

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    slug: {
      type: 'string',
      description: 'The script slug whose secret names to list (1–64 chars, e.g. "my-blog").',
      minLength: 1,
      maxLength: 64,
    },
  },
  required: ['slug'],
  additionalProperties: false,
}

interface SecretsResponse {
  secretNames: string[]
}

export const listSecretsTool: ToolDefinition<Args> = {
  name: 'kodena_list_secrets',
  description:
    'List the NAMES of a script’s worker secrets. Values are never returned by the ' +
    'backend and never exposed here — only the names. Use when the user asks "what ' +
    'secrets does this worker have" or before setting/rotating one. Setting, rotating, ' +
    'or removing a secret is intentionally NOT available through MCP — direct the user ' +
    'to `kodena secret put/rm <slug> <KEY>` in a shell. Requires an active org and project.',
  inputSchema,
  annotations: { title: 'List secrets', readOnlyHint: true },
  parseInput: zodParser(argsSchema),
  async handle(input: Args, ctx: CliContext) {
    const res = await apiFetch<SecretsResponse>(
      ctx,
      `/kodena/scripts/${encodeURIComponent(input.slug)}/secrets`,
    )
    return {
      slug: input.slug,
      // Names only — the value of a secret is never returned by the backend.
      secretNames: res.secretNames,
    }
  },
}
