import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { type ToolDefinition, type ToolInputSchema, zodParser } from './types'

const inputZod = z
  .object({
    handle: z
      .string()
      .min(1, 'handle is required')
      .max(16, 'handle must be at most 16 chars')
      .regex(
        /^[a-z0-9]+$/,
        'handle must be lowercase alphanumeric (no hyphens, no uppercase)',
      ),
  })
  .strict()

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    handle: {
      type: 'string',
      description:
        'The handle to claim for the active org. 1–16 chars, lowercase alphanumeric, ' +
        'no hyphens. Globally unique across all Kodena orgs and reserved-word filtered ' +
        'server-side — picking a taken or reserved handle returns 409.',
      minLength: 1,
      maxLength: 16,
      pattern: '^[a-z0-9]+$',
    },
  },
  required: ['handle'],
  additionalProperties: false,
}

interface OrgHandleResponse {
  handle: string
}

export const setOrgHandleTool: ToolDefinition<z.infer<typeof inputZod>> = {
  name: 'kodena_set_org_handle',
  description:
    'Claim a Kodena handle for the active organisation. The handle is the second ' +
    'segment of every tenant URL (`<slug>-<handle>.kodena.id`) and is immutable once ' +
    'set — once an org has a handle, this tool returns 409. Use ' +
    '`kodena_get_org_handle` first to check whether one is already claimed.',
  inputSchema,
  annotations: {
    title: 'Set org handle',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
  },
  parseInput: zodParser(inputZod),
  async handle({ handle }, ctx: CliContext) {
    return apiFetch<OrgHandleResponse>(ctx, '/kodena/org-handle', {
      method: 'PUT',
      body: { handle },
    })
  },
}
