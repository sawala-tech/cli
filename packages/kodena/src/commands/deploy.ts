import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import { Command, Option } from 'commander'
import { ApiError, apiFetch } from '../lib/api'
import type { CliContext } from '../lib/resolve'
import {
  findKodenaConfig,
  readKodenaConfig,
  resolveBundlePaths,
  resolveStaticAssetsDir,
} from '../lib/config-file'
import type { KodenaConfig } from '../lib/config-file'
import {
  readWorkerEntry,
  summarise,
  validateVars,
  walkAssets,
  type WorkerBundle,
  type DeployBundle,
} from '../lib/bundle'
import {
  assertTokenScope,
  loadContext,
  requireActiveOrg,
} from '../lib/resolve'

const DEFAULT_BUILD_COMMAND = 'npx @opennextjs/cloudflare build'

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
  build?: boolean
  static?: boolean
}

interface DeployResponse {
  tenant_subdomain?: string
  custom_hostname?: string | null
  [key: string]: unknown
}

export function createDeployCommand(): Command {
  return new Command('deploy')
    .description('Upload a worker-bundle, or a pure static site (--static), to Kodena.')
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
    .option(
      '--build',
      "Run kodena.json's `build.command` (or `npx @opennextjs/cloudflare build`) before uploading.",
    )
    .option(
      '--no-build',
      "Skip the build step even if kodena.json sets `build.runByDefault: true`.",
    )
    .option(
      '--static',
      'Deploy the build output directory as a static site (kind:assets); no worker.',
    )
    .option(
      '--no-static',
      'Force a worker-bundle deploy even if kodena.json sets `build.static: true`.',
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

      const shouldBuild =
        options.build !== undefined ? options.build : Boolean(config.build?.runByDefault)
      if (shouldBuild) {
        const command = config.build?.command ?? DEFAULT_BUILD_COMMAND
        const projectDir = dirname(configPath)
        process.stdout.write(`→ Running build: ${command}\n`)
        await runBuild(command, projectDir)
        process.stdout.write('✓ Build complete\n')
      }

      const vars = buildVars(config, options.var)
      validateVars(vars)

      const compatibilityFlags =
        (options.compatFlag as Array<'nodejs_compat' | 'nodejs_als'> | undefined) ??
        config.compatibilityFlags
      const compatibilityDate = options.compatDate ?? config.compatibilityDate

      process.stdout.write(`→ Reading kodena.json at ${configPath} (script: ${slug})\n`)
      // Static vs worker-bundle: explicit flag wins; else kodena.json
      // build.static; else auto-detect — a missing worker entry means "static".
      let isStatic: boolean
      if (options.static !== undefined) {
        isStatic = options.static
      } else if (config.build?.static !== undefined) {
        isStatic = config.build.static
      } else {
        isStatic = !(await fileExists(workerEntry))
        if (isStatic) {
          process.stdout.write(
            `→ No worker entry at ${workerEntry}; deploying as a static site (kind:assets).\n`,
          )
        }
      }

      let bundle: DeployBundle
      if (isStatic) {
        const staticDir = resolveStaticAssetsDir(configPath, config)
        process.stdout.write(`→ Reading static assets: ${staticDir}\n`)
        const assets = await walkAssets(staticDir)
        if (vars && Object.keys(vars).length > 0) {
          process.stdout.write('! Ignoring vars — static (kind:assets) deploys have no worker.\n')
        }
        if ((compatibilityFlags && compatibilityFlags.length > 0) || compatibilityDate) {
          process.stdout.write('! Ignoring compatibility flags/date — static deploys have no worker.\n')
        }
        bundle = { kind: 'assets', assets }
      } else {
        process.stdout.write(`→ Reading worker entry: ${workerEntry}\n`)
        const worker = await readWorkerEntry(workerEntry)
        process.stdout.write(`→ Reading assets: ${assetsDir}\n`)
        const assets = await walkAssets(assetsDir)
        const wb: WorkerBundle = { kind: 'worker-bundle', scriptContent: worker.content, assets }
        if (vars && Object.keys(vars).length > 0) wb.vars = vars
        if (compatibilityFlags && compatibilityFlags.length > 0) wb.compatibilityFlags = compatibilityFlags
        if (compatibilityDate) wb.compatibilityDate = compatibilityDate
        bundle = wb
      }

      const stats = summarise(bundle)
      if (bundle.kind === 'worker-bundle') {
        process.stdout.write(
          `✓ Bundle ready: worker ${humanBytes(stats.workerBytes)}, ` +
            `${stats.assetCount} assets (${humanBytes(stats.assetsTotalBytes)} total)\n`,
        )
      } else {
        process.stdout.write(
          `✓ Bundle ready: static — ${stats.assetCount} assets (${humanBytes(stats.assetsTotalBytes)} total)\n`,
        )
      }

      if (options.dryRun) {
        process.stdout.write('Dry run — not uploading. Bundle summary:\n')
        process.stdout.write(JSON.stringify(redactBundle(bundle), null, 2) + '\n')
        return
      }

      await ensureScriptExists(ctx, slug, {
        name: config.name ?? slug,
        orgSlug,
        projectSlug: effectiveProject ?? null,
      })

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

/**
 * Probe GET /kodena/scripts/:slug; create it via POST /kodena/scripts on 404.
 * Matches wrangler's "creates the worker on first deploy" UX. Re-throws any
 * non-404 GET error so a permissions or network problem surfaces before
 * we attempt the larger upload.
 */
async function ensureScriptExists(
  ctx: CliContext,
  slug: string,
  opts: { name: string; orgSlug: string; projectSlug: string | null },
): Promise<void> {
  try {
    await apiFetch(ctx, `/kodena/scripts/${slug}`, {
      method: 'GET',
      orgOverride: opts.orgSlug,
      projectOverride: opts.projectSlug,
    })
    return
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 404) throw e
  }

  process.stdout.write(`→ Script '${slug}' does not exist yet; creating it.\n`)
  await apiFetch(ctx, '/kodena/scripts', {
    method: 'POST',
    body: { scriptSlug: slug, name: opts.name },
    orgOverride: opts.orgSlug,
    projectOverride: opts.projectSlug,
  })
  process.stdout.write(`✓ Created script '${slug}'\n`)
}

/**
 * Spawn a shell command from the project dir with inherited stdio so the
 * user sees the build's output live. Resolves on exit code 0; rejects with
 * a clean message on any non-zero exit.
 */
function runBuild(command: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) return resolve()
      const detail = signal ? `terminated by signal ${signal}` : `exit code ${code}`
      reject(new Error(`Build failed (${detail}); not deploying.`))
    })
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

function redactBundle(bundle: DeployBundle): unknown {
  const stats = summarise(bundle)
  const assets = `<${stats.assetCount} files, ${humanBytes(stats.assetsTotalBytes)} total>`
  if (bundle.kind === 'assets') {
    return { kind: bundle.kind, scriptContent: '<none — static>', assets }
  }
  return {
    kind: bundle.kind,
    scriptContent: `<base64 elided, ${humanBytes(stats.workerBytes)} decoded>`,
    assets,
    vars: bundle.vars,
    compatibilityFlags: bundle.compatibilityFlags,
    compatibilityDate: bundle.compatibilityDate,
  }
}

/** True if a file exists and is readable. Used to auto-detect static deploys
 *  (a missing worker entry implies the project is a pure static site). */
async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
  return `${(n / 1024 / 1024).toFixed(2)} MiB`
}
