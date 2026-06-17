import { Command } from 'commander'
import { apiFetch } from '../lib/api'
import { loadContext, requireActiveOrg, requireActiveProject } from '../lib/resolve'
import {
  addContextOptions,
  confirmDestructive,
  contextOptions,
  type ContextOptions,
} from '../lib/command-options'

// Attach an already-owned hostname to a script (not domain *purchase* — that's a
// separate, payment-gated flow). The backend POST body key is `hostname`.

type JsonOption = ContextOptions & { json?: boolean }
type YesOption = ContextOptions & { yes?: boolean }

export function createDomainCommand(): Command {
  const domain = new Command('domain').description(
    "Attach, inspect, and detach a script's custom domain.",
  )

  addContextOptions(
    domain
      .command('set')
      .argument('<slug>', 'The script slug to attach the domain to.')
      .argument('<domain>', 'A hostname you control, e.g. blog.acme.com.')
      .description('Attach a custom domain to a script.'),
  ).action(async (slug: string, host: string, opts: ContextOptions) => {
    const ctx = await loadContext(contextOptions(opts))
    requireActiveOrg(ctx)
    requireActiveProject(ctx)
    await apiFetch(ctx, `/kodena/scripts/${encodeURIComponent(slug)}/custom-domain`, {
      method: 'POST',
      body: { hostname: host },
    })
    process.stdout.write(
      `Attached ${host} to ${slug}.\n` +
        `CNAME ${host} to your kodena fallback origin, then run ` +
        `\`kodena domain status ${slug}\` until it reports active.\n`,
    )
  })

  addContextOptions(
    domain
      .command('status')
      .argument('<slug>', 'The script slug whose custom-domain status to show.')
      .description('Show DNS validation / SSL status for the custom domain.')
      .option('--json', 'Print the raw status object.'),
  ).action(async (slug: string, opts: JsonOption) => {
    const ctx = await loadContext(contextOptions(opts))
    requireActiveOrg(ctx)
    requireActiveProject(ctx)
    const status = await apiFetch<Record<string, unknown>>(
      ctx,
      `/kodena/scripts/${encodeURIComponent(slug)}/custom-domain-status`,
    )
    if (opts.json) {
      process.stdout.write(JSON.stringify(status, null, 2) + '\n')
      return
    }
    // Render defensively — surface the common fields, fall back to raw JSON.
    const hostname = status['hostname'] ?? status['custom_hostname'] ?? '—'
    const ssl = status['ssl'] ?? status['sslStatus'] ?? status['status'] ?? '—'
    const dns = status['dns'] ?? status['ownershipVerification'] ?? status['verification'] ?? null
    process.stdout.write(`  hostname: ${String(hostname)}\n  ssl:      ${String(ssl)}\n`)
    if (dns) process.stdout.write(`  dns:      ${JSON.stringify(dns)}\n`)
  })

  addContextOptions(
    domain
      .command('rm')
      .argument('<slug>', 'The script slug to detach the custom domain from.')
      .description('Detach the custom domain from a script.')
      .option('--yes', 'Skip the confirmation prompt.'),
  ).action(async (slug: string, opts: YesOption) => {
    const ctx = await loadContext(contextOptions(opts))
    requireActiveOrg(ctx)
    requireActiveProject(ctx)
    const ok = await confirmDestructive(
      `Detach the custom domain from ${slug}? The site stays on its kodena.id subdomain.`,
      opts.yes,
    )
    if (!ok) {
      process.stdout.write('Aborted.\n')
      return
    }
    await apiFetch(ctx, `/kodena/scripts/${encodeURIComponent(slug)}/custom-domain`, {
      method: 'DELETE',
    })
    process.stdout.write(`Detached custom domain from ${slug}.\n`)
  })

  return domain
}
