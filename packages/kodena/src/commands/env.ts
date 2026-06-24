import { Command } from 'commander'
import { apiFetch } from '../lib/api'
import { loadContext, requireActiveOrg, requireActiveProject } from '../lib/resolve'

// Same binding-name shape the backend enforces for env var names.
const VAR_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/

// GET /kodena/scripts/:slug (withDerived) — the fields we need to read current
// env vars and redeploy the same code with an updated set.
interface ScriptDetail {
  script_slug: string
  kind: string
  script_content: string
  vars_parsed?: Record<string, string>
}

/**
 * `kodena env list|set|unset <slug>` — manage a directly-authored code script's
 * environment variables (plain_text bindings) the worker reads as `env.NAME`.
 *
 * Setting/unsetting redeploys the script's CURRENT code with the updated var
 * set (env vars apply at deploy time). Only `kind: 'code'` scripts are
 * supported here; worker-bundle scripts carry their vars in the bundle deploy.
 * Env var VALUES are not secret — use `kodena secret` for sensitive data.
 *
 * Project-scoped: the active org AND project must be set.
 */
export function createEnvCommand(): Command {
  const env = new Command('env').description(
    "Manage a code script's environment variables (plain text; redeploys on change).",
  )

  env
    .command('list')
    .argument('<slug>', 'The script slug.')
    .description('List a script\'s environment variables.')
    .action(async (slug: string) => {
      const ctx = await loadContext()
      requireActiveOrg(ctx)
      requireActiveProject(ctx)
      const row = await apiFetch<ScriptDetail>(ctx, `/kodena/scripts/${encodeURIComponent(slug)}`)
      const vars = row.vars_parsed ?? {}
      const keys = Object.keys(vars)
      if (keys.length === 0) {
        process.stdout.write(`No environment variables on '${slug}'.\n`)
        return
      }
      for (const k of keys) process.stdout.write(`  ${k}=${vars[k]}\n`)
    })

  env
    .command('set')
    .argument('<slug>', 'The script slug.')
    .argument('<KEY=value>', 'Variable in KEY=value form (KEY: uppercase, digits, underscores).')
    .description('Set or update one environment variable, then redeploy the code.')
    .action(async (slug: string, keyValue: string) => {
      const eq = keyValue.indexOf('=')
      if (eq < 0) throw new Error('variable must be in the form KEY=value.')
      const name = keyValue.slice(0, eq)
      const value = keyValue.slice(eq + 1)
      if (!VAR_NAME_PATTERN.test(name)) {
        throw new Error(`variable key '${name}' must match /^[A-Z][A-Z0-9_]*$/.`)
      }
      const ctx = await loadContext()
      requireActiveOrg(ctx)
      requireActiveProject(ctx)
      const row = await apiFetch<ScriptDetail>(ctx, `/kodena/scripts/${encodeURIComponent(slug)}`)
      if (row.kind !== 'code') {
        throw new Error(`'${slug}' is a ${row.kind} script; env vars via the CLI are only for code scripts.`)
      }
      const vars = { ...(row.vars_parsed ?? {}), [name]: value }
      await apiFetch(ctx, `/kodena/scripts/${encodeURIComponent(slug)}/deploy`, {
        method: 'POST',
        body: { kind: 'code', script_content: row.script_content, vars },
      })
      process.stdout.write(`✓ Set ${name} on ${slug} (redeployed).\n`)
      process.stdout.write(`  Vars: ${Object.keys(vars).join(', ')}\n`)
    })

  env
    .command('unset')
    .argument('<slug>', 'The script slug.')
    .argument('<KEY>', 'The variable name to remove.')
    .description('Remove one environment variable, then redeploy the code.')
    .action(async (slug: string, name: string) => {
      const ctx = await loadContext()
      requireActiveOrg(ctx)
      requireActiveProject(ctx)
      const row = await apiFetch<ScriptDetail>(ctx, `/kodena/scripts/${encodeURIComponent(slug)}`)
      if (row.kind !== 'code') {
        throw new Error(`'${slug}' is a ${row.kind} script; env vars via the CLI are only for code scripts.`)
      }
      const vars = { ...(row.vars_parsed ?? {}) }
      if (!(name in vars)) {
        process.stdout.write(`'${name}' is not set on '${slug}'.\n`)
        return
      }
      delete vars[name]
      await apiFetch(ctx, `/kodena/scripts/${encodeURIComponent(slug)}/deploy`, {
        method: 'POST',
        body: { kind: 'code', script_content: row.script_content, vars },
      })
      process.stdout.write(`✓ Removed ${name} from ${slug} (redeployed).\n`)
      process.stdout.write(`  Vars: ${Object.keys(vars).join(', ') || '(none)'}\n`)
    })

  return env
}
