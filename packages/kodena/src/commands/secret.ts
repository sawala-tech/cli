import { Command } from 'commander'
import { ApiError, apiFetch } from '../lib/api'
import { loadContext, requireActiveOrg, requireActiveProject } from '../lib/resolve'

// Same binding-name shape the backend enforces (vars + secrets).
const SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/

// Response of the standalone secret routes — names only, never values.
interface SecretsResponse {
  secretNames: string[]
}

/**
 * `kodena secret` — manage a worker's encrypted secrets WITHOUT a redeploy.
 *
 * Secrets are `secret_text` bindings: the worker reads them at runtime
 * (`process.env.NAME`) but Cloudflare never returns the value, and Kodena
 * stores only the NAME. These commands therefore never print a secret value.
 *
 * Secrets are project-scoped, like scripts: the backend resolves the target
 * with getScriptBySlug(org, project, slug), so the active org AND project must
 * be set. apiFetch sends them as x-org-id / x-project-id.
 */
export function createSecretCommand(): Command {
  const secret = new Command('secret').description(
    "Manage a worker's encrypted secrets (set/list/remove) without a redeploy.",
  )

  secret
    .command('put')
    .argument('<slug>', 'The script slug whose secret to set.')
    .argument('<KEY=value>', 'Secret in KEY=value form (KEY: uppercase, digits, underscores).')
    .description('Set or rotate one secret on the live worker. The value is never printed.')
    .action(async (slug: string, keyValue: string) => {
      const eq = keyValue.indexOf('=')
      if (eq < 0) {
        // Never echo the raw argument — it may be `KEY=<secret>`. Name the form only.
        throw new Error('secret must be in the form KEY=value.')
      }
      const name = keyValue.slice(0, eq)
      const value = keyValue.slice(eq + 1)
      if (!SECRET_NAME_PATTERN.test(name)) {
        throw new Error(
          `secret key '${name}' must match /^[A-Z][A-Z0-9_]*$/ (uppercase letter, then uppercase letters / digits / underscores).`,
        )
      }

      const ctx = await loadContext()
      requireActiveOrg(ctx)
      requireActiveProject(ctx)

      let res: SecretsResponse
      try {
        res = await apiFetch<SecretsResponse>(
          ctx,
          `/kodena/scripts/${encodeURIComponent(slug)}/secrets`,
          { method: 'PUT', body: { name, value } },
        )
      } catch (e) {
        // The name is already a plaintext `var` on this worker. The incremental
        // secrets API can't convert it; only a redeploy can. Explain the fix
        // instead of surfacing Cloudflare's raw "already in use" string.
        if (e instanceof ApiError && isNameInUseAsVar(e)) {
          throw new Error(
            `'${name}' is currently a plaintext var on '${slug}', so it can't be set as a secret in place.\n` +
              `Convert it by redeploying with the secret (and removing it from your vars):\n` +
              `  kodena deploy --secret ${name}=<value>\n` +
              `After that, 'kodena secret put' can rotate it without a redeploy.`,
          )
        }
        throw e
      }
      process.stdout.write(`✓ Secret ${name} set on ${slug}\n`)
      process.stdout.write(`  Secrets: ${res.secretNames.join(', ') || '(none)'}\n`)
    })

  secret
    .command('list')
    .argument('<slug>', 'The script slug whose secret names to list.')
    .description('List the NAMES of a worker\'s secrets (values are never shown).')
    .action(async (slug: string) => {
      const ctx = await loadContext()
      requireActiveOrg(ctx)
      requireActiveProject(ctx)

      const res = await apiFetch<SecretsResponse>(
        ctx,
        `/kodena/scripts/${encodeURIComponent(slug)}/secrets`,
      )
      if (res.secretNames.length === 0) {
        process.stdout.write(`No secrets on '${slug}'.\n`)
        return
      }
      for (const name of res.secretNames) {
        process.stdout.write(`  ${name}\n`)
      }
    })

  secret
    .command('rm')
    .argument('<slug>', 'The script slug whose secret to remove.')
    .argument('<KEY>', 'The secret name to remove.')
    .description('Remove one secret from the live worker.')
    .action(async (slug: string, name: string) => {
      if (!SECRET_NAME_PATTERN.test(name)) {
        throw new Error(
          `secret key '${name}' must match /^[A-Z][A-Z0-9_]*$/ (uppercase letter, then uppercase letters / digits / underscores).`,
        )
      }
      const ctx = await loadContext()
      requireActiveOrg(ctx)
      requireActiveProject(ctx)

      const res = await apiFetch<SecretsResponse>(
        ctx,
        `/kodena/scripts/${encodeURIComponent(slug)}/secrets/${encodeURIComponent(name)}`,
        { method: 'DELETE' },
      )
      process.stdout.write(`✓ Secret ${name} removed from ${slug}\n`)
      process.stdout.write(`  Secrets: ${res.secretNames.join(', ') || '(none)'}\n`)
    })

  return secret
}

// True when the backend rejected `secret put` because the name is already a
// plaintext var. Matches the dedicated 409 code from a current backend, and
// falls back to Cloudflare's raw "already in use" string for older backends.
function isNameInUseAsVar(e: ApiError): boolean {
  const code =
    e.body && typeof e.body === 'object' && 'error' in e.body
      ? String((e.body as { error: unknown }).error)
      : ''
  return code === 'SECRET_NAME_IN_USE_AS_VAR' || /already in use/i.test(code)
}
