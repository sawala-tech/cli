import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { zodParser, type ToolDefinition, type ToolInputSchema } from './types'

const inputZod = z
  .object({
    name: z.string().min(1),
    fields: z.array(z.record(z.string(), z.unknown())),
    slug: z.string().optional(),
    visibility: z.enum(['private', 'public']).optional(),
    pinned: z.boolean().optional(),
  })
  .strict()

type Input = z.infer<typeof inputZod>

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Human-readable collection name, e.g. "Contacts".' },
    fields: {
      type: 'array',
      description:
        'Typed field definitions (SchemaField[]). Each field is an object such as ' +
        '{ name, type, required?, ... }. Fetch an existing collection to see the shape.',
      items: { type: 'object' },
    },
    slug: { type: 'string', description: 'Optional URL slug; auto-generated from name if omitted.' },
    visibility: {
      type: 'string',
      enum: ['private', 'public'],
      description: 'Default private (no public read route). public exposes the read-only API.',
    },
    pinned: { type: 'boolean', description: 'Pin to the top of the collections list.' },
  },
  required: ['name', 'fields'],
  additionalProperties: false,
}

export const datanaCreateCollectionTool: ToolDefinition<Input> = {
  name: 'sawala_datana_create_collection',
  description:
    'Create a Datana collection (a typed data model) in the active project. Provide a name ' +
    'and the typed `fields` array; slug is auto-generated if omitted. Collections are private ' +
    'by default. 409 if the slug already exists. Requires an active project.',
  inputSchema,
  annotations: { title: 'Create Datana collection', readOnlyHint: false },
  parseInput: zodParser(inputZod),
  async handle(input: Input, ctx: CliContext) {
    if (!ctx.activeProjectId) {
      throw new Error(
        'No active project id. Run `sawala project use <slug>` in a terminal to refresh, then retry.',
      )
    }
    return await apiFetch<unknown>(
      ctx,
      `/cli/datana/projects/${encodeURIComponent(ctx.activeProjectId)}/collections`,
      { method: 'POST', body: input },
    )
  },
}
