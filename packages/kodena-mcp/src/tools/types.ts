import { z } from 'zod'
import type { CliContext } from '../lib/auth'

/**
 * MCP tool annotations the server can attach to advertise behaviour
 * to the host. See the MCP spec's "tool annotations" section.
 *
 * Hosts use these as UX hints; they do not enforce semantics.
 * `irreversibleHint` is non-standard (the spec defines only the five
 * fields above it); hosts that don't recognise it ignore it.
 */
export interface ToolAnnotations {
  title?: string
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
  irreversibleHint?: boolean
}

/**
 * JSON-Schema-shaped description of a tool's input. Hand-written so
 * the wire surface stays auditable and we don't pull in zod-to-json-schema
 * just to handle "no input" and "one string field".
 */
export interface ToolInputSchema {
  type: 'object'
  properties: Record<string, unknown>
  required?: readonly string[]
  additionalProperties: false
}

/**
 * A single MCP tool exposed by `@sawala/kodena-mcp`.
 *
 * `inputSchema` advertises the wire shape. `parseInput` is the runtime
 * validator (a Zod schema's parse output); the two must agree by
 * construction — keep them in sync when editing a tool.
 */
export interface ToolDefinition<TInput = unknown> {
  name: string
  description: string
  inputSchema: ToolInputSchema
  annotations: ToolAnnotations
  parseInput: (raw: unknown) => TInput
  handle: (input: TInput, ctx: CliContext) => Promise<unknown>
}

/**
 * Helper: turn a Zod schema into a parseInput function that throws a
 * readable Error on mismatch. The thrown error's message is forwarded
 * to the host as a -32602 InvalidParams via `toMcpError`.
 */
export function zodParser<T>(schema: z.ZodType<T>): (raw: unknown) => T {
  return (raw) => {
    const result = schema.safeParse(raw)
    if (!result.success) {
      const summary = result.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ')
      throw new Error(`Invalid tool input: ${summary}`)
    }
    return result.data
  }
}

/** Reusable schema for tools that take no input. */
export const EMPTY_INPUT_SCHEMA: ToolInputSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
}

export const emptyInputParser = zodParser(z.object({}).strict())
