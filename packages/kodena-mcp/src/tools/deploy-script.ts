import { promises as fs } from 'node:fs'
import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import {
  readWorkerEntry,
  summarise,
  validateVars,
  walkAssets,
  type WorkerBundle,
  type CodeBundle,
} from '../lib/bundle-client'
import { type ToolDefinition, type ToolInputSchema, zodParser } from './types'

const compatFlag = z.enum(['nodejs_compat', 'nodejs_als'])

// A directly-authored Worker module is capped like a worker-bundle's entry.
const CODE_MODULE_MAX_BYTES = 10 * 1024 * 1024

const inputZod = z
  .object({
    slug: z.string().min(1, 'slug is required').max(64),
    // Worker-bundle mode: a pre-built entry file (+ optional assets tree).
    workerEntryPath: z.string().min(1).optional(),
    // Code mode: a single directly-authored module, given either inline...
    scriptContent: z.string().min(1).optional(),
    // ...or as a path the tool reads as UTF-8.
    sourcePath: z.string().min(1).optional(),
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
  .refine(
    (v) =>
      [v.workerEntryPath, v.scriptContent, v.sourcePath].filter((x) => x !== undefined).length === 1,
    {
      message:
        'Provide exactly one of workerEntryPath (worker-bundle), scriptContent, or sourcePath (kind:code).',
    },
  )

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
        'Worker-bundle mode. Absolute (or CWD-relative) path to the built worker ' +
        'entry file (e.g. `./.open-next/worker.js`). Capped at 10 MiB. Provide ' +
        'exactly one of workerEntryPath, scriptContent, or sourcePath.',
      minLength: 1,
    },
    scriptContent: {
      type: 'string',
      description:
        'kind:code mode. The single Worker module source, inline as a string ' +
        '(e.g. `export default { async fetch() { … } }`). Sent as raw UTF-8, ' +
        'not base64; the source round-trips. Capped at 10 MiB. Mutually ' +
        'exclusive with workerEntryPath and sourcePath.',
      minLength: 1,
    },
    sourcePath: {
      type: 'string',
      description:
        'kind:code mode. Path to a single Worker module source file the tool ' +
        'reads as UTF-8. Same as scriptContent but from disk. Mutually exclusive ' +
        'with workerEntryPath and scriptContent.',
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
  required: ['slug'],
  additionalProperties: false,
}

export const deployScriptTool: ToolDefinition<z.infer<typeof inputZod>> = {
  name: 'kodena_deploy_script',
  description:
    'Deploy a Kodena script. Two modes: (1) worker-bundle — pass `workerEntryPath` ' +
    '(a pre-built artifact e.g. `.open-next/worker.js`, max 10 MiB) and optionally ' +
    '`assetsDir` (max 100 MiB aggregate); everything is base64-encoded and POSTed as ' +
    'a WorkerBundle. (2) kind:code — pass `scriptContent` (inline module source) or ' +
    '`sourcePath` (a file read as UTF-8) to deploy a single directly-authored Worker ' +
    'module whose source round-trips. Provide exactly one of the three. This tool ' +
    'does not run a build step. Use `dryRun: true` to see the summary without uploading.',
  inputSchema,
  annotations: {
    title: 'Deploy script',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
  },
  parseInput: zodParser(inputZod),
  async handle(input, ctx: CliContext) {
    const {
      workerEntryPath,
      scriptContent,
      sourcePath,
      assetsDir,
      vars,
      compatibilityFlags,
      compatibilityDate,
      dryRun,
      slug,
    } = input

    validateVars(vars)

    // kind:code mode — a single directly-authored module (inline or from disk).
    // Compat flags/date and assetsDir are worker-bundle concepts; ignored here.
    if (scriptContent !== undefined || sourcePath !== undefined) {
      const source = scriptContent ?? (await readCodeModule(sourcePath as string))
      const codeBundle: CodeBundle = { kind: 'code', script_content: source }
      if (vars) codeBundle.vars = vars

      const stats = summarise(codeBundle)
      if (dryRun) {
        return {
          dryRun: true,
          slug,
          bundle: {
            kind: codeBundle.kind,
            workerBytes: stats.workerBytes,
            vars: vars ? Object.keys(vars) : [],
          },
        }
      }

      const response = await apiFetch(
        ctx,
        `/kodena/scripts/${encodeURIComponent(slug)}/deploy`,
        { method: 'POST', body: codeBundle },
      )
      return { slug, bundleStats: stats, response }
    }

    // worker-bundle mode.
    const worker = await readWorkerEntry(workerEntryPath as string)
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

/**
 * Read a code-mode source file as UTF-8 (kind:code sends raw source, not
 * base64). Throws a clean message if missing, over the 10 MiB cap, or empty.
 */
async function readCodeModule(path: string): Promise<string> {
  let buf: Buffer
  try {
    buf = await fs.readFile(path)
  } catch (err) {
    throw new Error(`Cannot read source module at ${path}: ${(err as Error).message}`)
  }
  if (buf.byteLength > CODE_MODULE_MAX_BYTES) {
    throw new Error(`Source module is ${buf.byteLength} bytes; max ${CODE_MODULE_MAX_BYTES} (10 MiB).`)
  }
  const source = buf.toString('utf8')
  if (source.trim().length === 0) {
    throw new Error(`Source module at ${path} is empty.`)
  }
  return source
}
