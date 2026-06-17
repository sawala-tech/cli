import { z } from 'zod'
import type { CliContext } from '../lib/auth'
import { ApiError } from '../lib/api-client'
import { type ToolDefinition, type ToolInputSchema, zodParser } from './types'

// Cap the payload we surface to the host. Asset bundles can hold large
// images/fonts; dumping megabytes into the model's context is wasteful and
// usually unintended. Callers that need a big binary should use the CLI's
// `kodena asset get <slug> <path> --out <file>` instead.
const MAX_BYTES = 256 * 1024

const argsSchema = z
  .object({
    slug: z.string().min(1, 'slug is required').max(64),
    path: z.string().min(1, 'path is required').max(1024),
  })
  .strict()

type Args = z.infer<typeof argsSchema>

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    slug: {
      type: 'string',
      description: 'The script slug whose asset bundle to read (1–64 chars, e.g. "my-blog").',
      minLength: 1,
      maxLength: 64,
    },
    path: {
      type: 'string',
      description: 'The asset path inside the bundle, e.g. "/index.html". A leading slash is added if missing.',
      minLength: 1,
      maxLength: 1024,
    },
  },
  required: ['slug', 'path'],
  additionalProperties: false,
}

const TEXT_CONTENT_TYPE = /^text\/|application\/(json|xml|javascript)|\+xml|svg/

export const getAssetTool: ToolDefinition<Args> = {
  name: 'kodena_get_asset',
  description:
    'Read the contents of one file from a script’s deployed asset bundle (e.g. the ' +
    'live index.html, a CSS or JS file). Use when the user asks to see "what’s ' +
    'deployed", inspect a specific asset, or before patching it. To list the files ' +
    'first, call kodena_get_script (its assetsManifest lists every path). Text assets ' +
    'are returned as a string; binary assets are returned base64-encoded with ' +
    `encoding:"base64". Payloads are capped at ${MAX_BYTES / 1024} KB — fetch larger ` +
    'binaries with `kodena asset get <slug> <path> --out <file>` in a shell instead. ' +
    'Requires an active org and project.',
  inputSchema,
  annotations: { title: 'Get asset', readOnlyHint: true },
  parseInput: zodParser(argsSchema),
  async handle(input: Args, ctx: CliContext) {
    const normalized = input.path.startsWith('/') ? input.path : '/' + input.path

    // The proxy streams raw bytes (not JSON), so call fetch directly with the
    // same auth/scoping headers apiFetch would attach.
    const url =
      `${ctx.apiBase}/kodena/scripts/${encodeURIComponent(input.slug)}/assets/proxy` +
      `?path=${encodeURIComponent(normalized)}`
    const headers: Record<string, string> = { Authorization: `Bearer ${ctx.token}` }
    if (ctx.activeOrg) headers['x-org-id'] = ctx.activeOrg
    if (ctx.activeProject) headers['x-project-id'] = ctx.activeProject

    const res = await fetch(url, { headers })
    if (!res.ok) {
      let errBody: unknown = { error: `HTTP ${res.status}` }
      try {
        errBody = await res.json()
      } catch {
        /* non-JSON error body — keep the synthesised one */
      }
      throw new ApiError(res.status, errBody, url)
    }

    const buf = Buffer.from(await res.arrayBuffer())
    const contentType = res.headers.get('content-type') ?? ''
    const truncated = buf.byteLength > MAX_BYTES
    const body = truncated ? buf.subarray(0, MAX_BYTES) : buf
    const isText = TEXT_CONTENT_TYPE.test(contentType)

    return {
      slug: input.slug,
      path: normalized,
      contentType: contentType || null,
      byteLength: buf.byteLength,
      truncated,
      encoding: isText ? 'utf-8' : 'base64',
      content: isText ? body.toString('utf-8') : body.toString('base64'),
    }
  },
}
