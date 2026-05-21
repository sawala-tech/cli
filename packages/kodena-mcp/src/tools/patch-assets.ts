import { promises as fs } from 'node:fs'
import mimeTypes from 'mime-types'
import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import type { AssetFile } from '../lib/bundle-client'
import { type ToolDefinition, type ToolInputSchema, zodParser } from './types'

const PATCH_FILE_MAX_BYTES = 10 * 1024 * 1024
const PATCH_AGGREGATE_MAX_BYTES = 25 * 1024 * 1024

const inputZod = z
  .object({
    slug: z.string().min(1, 'slug is required').max(64),
    files: z
      .array(
        z
          .object({
            path: z
              .string()
              .min(1)
              .regex(/^\//, 'asset path must start with "/"'),
            localPath: z.string().min(1),
          })
          .strict(),
      )
      .min(1, 'at least one file required'),
  })
  .strict()

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    slug: { type: 'string', description: 'The script slug.', minLength: 1, maxLength: 64 },
    files: {
      type: 'array',
      description:
        'Files to patch into the asset bundle. Each entry has `path` (the public ' +
        'URL path inside the bundle, must start with `/`) and `localPath` (the file ' +
        'on the user’s filesystem the server reads and base64-encodes). Per-file ' +
        'cap: 10 MiB. Aggregate cap: 25 MiB.',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          path: { type: 'string', pattern: '^/' },
          localPath: { type: 'string' },
        },
        required: ['path', 'localPath'],
        additionalProperties: false,
      },
    },
  },
  required: ['slug', 'files'],
  additionalProperties: false,
}

export const patchAssetsTool: ToolDefinition<z.infer<typeof inputZod>> = {
  name: 'kodena_patch_assets',
  description:
    'Add or replace specific files inside a script’s asset bundle without re-uploading ' +
    'the whole worker. The server reads each `localPath` from disk, base64-encodes it, ' +
    'and POSTs to /assets/patch. Each file capped at 10 MiB; aggregate 25 MiB. Useful ' +
    'for fixing a typo in a static page without bouncing the worker; for code changes ' +
    'use `kodena_deploy_script`.',
  inputSchema,
  annotations: {
    title: 'Patch assets',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
  },
  parseInput: zodParser(inputZod),
  async handle({ slug, files }, ctx: CliContext) {
    const assets: AssetFile[] = []
    let totalBytes = 0

    for (const f of files) {
      let buf: Buffer
      try {
        buf = await fs.readFile(f.localPath)
      } catch (err) {
        throw new Error(
          `Cannot read asset at ${f.localPath}: ${(err as Error).message}`,
        )
      }
      if (buf.byteLength > PATCH_FILE_MAX_BYTES) {
        throw new Error(
          `${f.localPath} is ${buf.byteLength} bytes; per-file cap is ${PATCH_FILE_MAX_BYTES} (10 MiB).`,
        )
      }
      totalBytes += buf.byteLength
      if (totalBytes > PATCH_AGGREGATE_MAX_BYTES) {
        throw new Error(
          `Patch aggregate exceeds ${PATCH_AGGREGATE_MAX_BYTES} bytes (25 MiB).`,
        )
      }

      const mime = mimeTypes.lookup(f.localPath)
      const asset: AssetFile = {
        path: f.path,
        content: buf.toString('base64'),
        size: buf.byteLength,
      }
      if (mime) asset.mime = mime
      assets.push(asset)
    }

    return apiFetch(
      ctx,
      `/kodena/scripts/${encodeURIComponent(slug)}/assets/patch`,
      { method: 'POST', body: { assets } },
    )
  },
}
