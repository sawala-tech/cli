import { Command, Option } from 'commander'
import { apiFetch } from '../lib/api'
import {
  findKodenaConfig,
  readKodenaConfig,
  resolveBundlePaths,
} from '../lib/config-file'
import type { KodenaConfig } from '../lib/config-file'
import {
  readWorkerEntry,
  summarise,
  validateVars,
  walkAssets,
  type WorkerBundle,
} from '../lib/bundle'
import {
  assertTokenScope,
  loadContext,
  requireActiveOrg,
} from '../lib/resolve'

interface DeployOptions {
  slug?: string
  org?: string
  project?: string
  token?: string
  apiBase?: string
  var?: string[]
  compatFlag?: string[]
  compatDate?: string
  dryRun?: boolean
}

interface DeployResponse {
  tenant_subdomain?: string
  custom_hostname?: string | null
  [key: string]: unknown
}

export function createDeployCommand(): Command {
  return new Command('deploy')
    .description('Upload a worker-bundle (worker.js + assets) to Kodena.')
    .option('--slug <name>', "Override kodena.json's script slug.")
    .option('--org <slug>', 'Override the active org for this command only.')
    .option('--project <slug>', 'Override the active project for this command only.')
    .option('--token <koda_…>', 'Use this CLI token instead of the resolved one.')
    .option('--api-base <url>', 'Override the API base URL.')
    .option(
      '--var <KEY=value>',
      'Set a worker var. Repeatable.',
      (val: string, prev: string[] = []) => {
        prev.push(val)
        return prev
      },
    )
    .addOption(
      new Option('--compat-flag <flag>', 'Compatibility flag. Repeatable.').choices([
        'nodejs_compat',
        'nodejs_als',
      ]),
    )
    .option('--compat-date <YYYY-MM-DD>', 'Compatibility date (YYYY-MM-DD).')
    .option(
      '--dry-run',
      'Run all the work up to the network call, then print a summary and exit.',
    )
    .action(async (options: DeployOptions) => {
      const ctx = await loadContext({
        token: options.token,
        org: options.org,
        project: options.project,
        apiBase: options.apiBase,
      })

      const configPath = await findKodenaConfig()
      if (!configPath) {
        throw new Error(
          'No kodena.json found in the current directory or any parent directory. ' +
            'Create one with at least `{"slug": "<your-script-slug>"}` at the project root.',
        )
      }
      const config = await readKodenaConfig(configPath)
      const slug = options.slug ?? config.slug

      // Bring kodena.json's `project` field into the project-resolution chain
      // (it sits between KODENA_PROJECT env and ~/.kodena/config activeProject).
      const effectiveProject =
        options.project ??
        process.env['KODENA_PROJECT'] ??
        config.project ??
        ctx.activeProject

      const orgSlug = requireActiveOrg(ctx)
      assertTokenScope(ctx, orgSlug)

      const { workerEntry, assetsDir } = resolveBundlePaths(configPath, config)

      const vars = buildVars(config, options.var)
      validateVars(vars)

      const compatibilityFlags =
        (options.compatFlag as Array<'nodejs_compat' | 'nodejs_als'> | undefined) ??
        config.compatibilityFlags
      const compatibilityDate = options.compatDate ?? config.compatibilityDate

      process.stdout.write(`→ Reading kodena.json at ${configPath} (script: ${slug})\n`)
      process.stdout.write(`→ Reading worker entry: ${workerEntry}\n`)
      const worker = await readWorkerEntry(workerEntry)
      process.stdout.write(`→ Reading assets: ${assetsDir}\n`)
      const assets = await walkAssets(assetsDir)

      const bundle: WorkerBundle = {
        kind: 'worker-bundle',
        scriptContent: worker.content,
        assets,
      }
      if (vars && Object.keys(vars).length > 0) bundle.vars = vars
      if (compatibilityFlags && compatibilityFlags.length > 0) bundle.compatibilityFlags = compatibilityFlags
      if (compatibilityDate) bundle.compatibilityDate = compatibilityDate

      const stats = summarise(bundle)
      process.stdout.write(
        `✓ Bundle ready: worker ${humanBytes(stats.workerBytes)}, ` +
          `${stats.assetCount} assets (${humanBytes(stats.assetsTotalBytes)} total)\n`,
      )

      if (options.dryRun) {
        process.stdout.write('Dry run — not uploading. Bundle summary:\n')
        process.stdout.write(JSON.stringify(redactBundle(bundle), null, 2) + '\n')
        return
      }

      const target = `${ctx.apiBase}/kodena/scripts/${slug}/deploy`
      process.stdout.write(`→ Uploading to ${target}\n`)

      const started = Date.now()
      const response = await apiFetch<DeployResponse>(ctx, `/kodena/scripts/${slug}/deploy`, {
        method: 'POST',
        body: bundle,
        orgOverride: orgSlug,
        projectOverride: effectiveProject ?? null,
      })
      const elapsedSec = ((Date.now() - started) / 1000).toFixed(1)

      process.stdout.write(`✓ Deployed in ${elapsedSec}s\n`)
      const tenant = response.tenant_subdomain
      if (tenant) {
        process.stdout.write(`→ Live at https://${tenant}.kodena.id\n`)
      }
      if (response.custom_hostname) {
        process.stdout.write(`→ Custom hostname: https://${response.custom_hostname}\n`)
      }
    })
}

function buildVars(
  config: KodenaConfig,
  flagVars: string[] | undefined,
): Record<string, string> | undefined {
  const merged: Record<string, string> = { ...(config.vars ?? {}) }
  if (flagVars) {
    for (const entry of flagVars) {
      const eq = entry.indexOf('=')
      if (eq < 0) {
        throw new Error(`--var must be in the form KEY=value (got '${entry}').`)
      }
      const key = entry.slice(0, eq)
      const value = entry.slice(eq + 1)
      merged[key] = value
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined
}

function redactBundle(bundle: WorkerBundle): unknown {
  const stats = summarise(bundle)
  return {
    kind: bundle.kind,
    scriptContent: `<base64 elided, ${humanBytes(stats.workerBytes)} decoded>`,
    assets: `<${stats.assetCount} files, ${humanBytes(stats.assetsTotalBytes)} total>`,
    vars: bundle.vars,
    compatibilityFlags: bundle.compatibilityFlags,
    compatibilityDate: bundle.compatibilityDate,
  }
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
  return `${(n / 1024 / 1024).toFixed(2)} MiB`
}
