import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { type ToolDefinition, type ToolInputSchema, zodParser } from './types'

const LEVELS = ['log', 'error', 'warn', 'info', 'debug'] as const

const inputZod = z
  .object({
    slug: z.string().min(1, 'slug is required').max(64),
    // Lookback window, e.g. "15m", "2h", "1d". Backend defaults to 1h and
    // clamps to the 3-day native retention window.
    since: z
      .string()
      .regex(/^\d+\s*(m|h|d)?$/, 'since must look like 15m, 2h, or 1d')
      .optional(),
    level: z.enum(LEVELS).optional(),
  })
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
    since: {
      type: 'string',
      description: 'How far back to read: e.g. "15m", "2h", "1d". Default 1h; max 3d.',
    },
    level: {
      type: 'string',
      enum: [...LEVELS],
      description: 'Only return events at this level.',
    },
  },
  required: ['slug'],
  additionalProperties: false,
}

// One normalized native-log event, as returned by the kodena backend's
// `GET /kodena/scripts/:slug/logs` (see sawala-cloud-core
// services/kodena/src/resource.ts → ScriptLogEvent).
interface ScriptLogEvent {
  timestamp: string
  level: string
  message: string
  rayId: string | null
}

export const getScriptLogsTool: ToolDefinition<z.infer<typeof inputZod>> = {
  name: 'kodena_get_script_logs',
  description:
    'Return recent native Workers Logs events (console output + per-invocation ' +
    'summaries) for one Kodena script the caller owns. Use when the user wants to ' +
    'debug a deployed function ("why is my-blog erroring?", "show recent logs"). ' +
    'Optional `since` window (e.g. "1h") and `level` filter. Read-only.',
  inputSchema,
  annotations: { title: 'Get script logs', readOnlyHint: true },
  parseInput: zodParser(inputZod),
  async handle({ slug, since, level }, ctx: CliContext) {
    const qs = new URLSearchParams()
    if (since) qs.set('since', since)
    if (level) qs.set('level', level)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    const { events } = await apiFetch<{ events: ScriptLogEvent[] }>(
      ctx,
      `/kodena/scripts/${encodeURIComponent(slug)}/logs${suffix}`,
    )
    return { slug, count: events.length, events }
  },
}
