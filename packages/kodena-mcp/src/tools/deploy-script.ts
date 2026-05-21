import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import {
  readWorkerEntry,
  summarise,
  validateVars,
  walkAssets,
  type WorkerBundle,
} from '../lib/bundle-client'
import { type ToolDefinition, type ToolInputSchema, zodParser } from './types'

const compatFlag = z.enum(['nodejs_compat', 'nodejs_als'])

const inputZod = z
  .object({
    slug: z.string().min(1, 'slug is required').max(64),
    workerEntryPath: z
      .string()
      .min(1, 'workerEntryPath is required (path to your built worker.js)'),
    assetsDir: z.string().min(1).optional(),
    vars: z.record(z.string(), z.string()).optional(),
    compatibilityFlags: z.array(compatFlag).optional(),
    compatibilityDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'compatibilityDate must be YYYY-MM-DD')
      .optional(),
    dryRun: z.boolean().optional(),
  })
  .strict()

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    slug: {
      type: 'string',
      description: 'The target script slug.',
      minLength: 1,
      maxLength: 64,
    },
    workerEntryPath: {
      type: 'string',
      description:
        'Absolute (or CWD-relative) path to the built worker entry file ' +
        '(e.g. `./.open-next/worker.js`). Capped at 10 MiB.',
      minLength: 1,
    },
    assetsDir: {
      type: 'string',
      description:
        'Optional path to a static-assets directory whose tree is uploaded ' +
        'alongside the worker. Each file becomes an `AssetFile` keyed by its ' +
        'POSIX-style path under the directory. Aggregate cap: 100 MiB.',
      minLength: 1,
    },
    vars: {
      type: 'object',
      description:
        'Worker environment variables. Keys must match /^[A-Z][A-Z0-9_]*$/; ' +
        'each value capped at 8 KiB.',
      additionalProperties: { type: 'string' },
    },
    compatibilityFlags: {
      type: 'array',
      description: 'Cloudflare compatibility flags applied to the deployed Worker.',
      items: { type: 'string', enum: ['nodejs_compat', 'nodejs_als'] },
    },
    compatibilityDate: {
      type: 'string',
      description: 'Cloudflare compatibility date (YYYY-MM-DD).',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    },
    dryRun: {
      type: 'boolean',
      description:
        'When true, build the bundle and return its summary without sending the ' +
        'network call. Useful for confirming cap usage before a real deploy.',
    },
  },
  required: ['slug', 'workerEntryPath'],
  additionalProperties: false,
}

export const deployScriptTool: ToolDefinition<z.infer<typeof inputZod>> = {
  name: 'kodena_deploy_script',
  description:
    'Deploy a Cloudflare Worker bundle to a Kodena script from local files. Reads ' +
    '`workerEntryPath` (max 10 MiB) and optionally walks `assetsDir` (max 100 MiB ' +
    'aggregate); base64-encodes everything; POSTs the WorkerBundle to /deploy. The ' +
    'agent must point at a pre-built artifact (e.g. `.open-next/worker.js`) — this ' +
    'tool does not run a build step. Use `dryRun: true` to see the bundle summary ' +
    'without uploading.',
  inputSchema,
  annotations: {
    title: 'Deploy script',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
  },
  parseInput: zodParser(inputZod),
  async handle(input, ctx: CliContext) {
    const { workerEntryPath, assetsDir, vars, compatibilityFlags, compatibilityDate, dryRun, slug } =
      input

    validateVars(vars)

    const worker = await readWorkerEntry(workerEntryPath)
    const assets = assetsDir ? await walkAssets(assetsDir) : []

    const bundle: WorkerBundle = {
      kind: 'worker-bundle',
      scriptContent: worker.content,
      assets,
    }
    if (vars) bundle.vars = vars
    if (compatibilityFlags) bundle.compatibilityFlags = compatibilityFlags
    if (compatibilityDate) bundle.compatibilityDate = compatibilityDate

    const stats = summarise(bundle)

    if (dryRun) {
      return {
        dryRun: true,
        slug,
        bundle: {
          kind: bundle.kind,
          workerBytes: stats.workerBytes,
          assetCount: stats.assetCount,
          assetsTotalBytes: stats.assetsTotalBytes,
          vars: vars ? Object.keys(vars) : [],
          compatibilityFlags: bundle.compatibilityFlags ?? [],
          compatibilityDate: bundle.compatibilityDate ?? null,
        },
      }
    }

    const response = await apiFetch(
      ctx,
      `/kodena/scripts/${encodeURIComponent(slug)}/deploy`,
      { method: 'POST', body: bundle },
    )

    return {
      slug,
      bundleStats: stats,
      response,
    }
  },
}
