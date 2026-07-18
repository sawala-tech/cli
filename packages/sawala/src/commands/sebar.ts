import { Command } from 'commander'
import { SAWALA_BRAND, apiFetch, loadContext, requireActiveOrg } from '@sawala/auth'
import { confirmOrThrow } from '../lib/io'

/**
 * Sebar — Sawala's communication service (send/receive email + WhatsApp on an
 * org's behalf). These commands manage an org's CUSTOM INBOUND DOMAIN: instead
 * of receiving mail at an unmemorable Postmark hash address
 * (`<hash>@inbound.postmarkapp.com`), an org points a dedicated subdomain it
 * controls (e.g. `inbox.acme.co.id`) at Sebar by publishing a single MX record,
 * and can then create friendly addresses like `support@inbox.acme.co.id`.
 *
 * Unlike the Kontena/Datana commands, no projectId appears in the URL: the
 * inbound domain is ORG-level (one per org, one Postmark Server per org). The
 * gateway resolves the CLI token's org and injects it, so scope can never be
 * widened by anything on the command line — a request only ever touches the
 * caller's own org.
 *
 * Paths go through the gateway's CLI-only surface (`/cli/sebar/*`), reachable by
 * a koda_… CLI token and nothing else — no browser, no SDK. The forwarder strips
 * `/cli/sebar`, so `/cli/sebar/settings/inbound-domain` reaches Sebar's existing
 * dashboard handler as `/settings/inbound-domain`.
 */

const DOMAIN = '/cli/sebar/settings/inbound-domain'
const EMAIL = '/cli/sebar/settings/inbound-email'

interface InboundDomain {
  domain: string
  mxHost: string
  mxPriority: number
  verified: boolean
  status: 'pending' | 'verified'
  createdAt: string
  verifiedAt: string | null
}

interface MxRecord {
  type: 'MX'
  name: string
  value: string
  priority: number
}

interface InboundAddress {
  address: string
  projectId: string
  enabled: boolean
  forwardToAjena: boolean
  forwardToEmail: string | null
  createdAt: string
}

function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n')
}

// Print the one MX record the operator must publish, as terse aligned lines.
function printMxRecord(mx: MxRecord): void {
  process.stdout.write(`Publish this DNS record, then run \`sawala sebar inbound domain verify\`:\n`)
  process.stdout.write(`  Type      ${mx.type}\n`)
  process.stdout.write(`  Name      ${mx.name}\n`)
  process.stdout.write(`  Value     ${mx.value}\n`)
  process.stdout.write(`  Priority  ${mx.priority}\n`)
}

async function orgCtx() {
  const ctx = await loadContext(SAWALA_BRAND)
  requireActiveOrg(ctx, SAWALA_BRAND)
  return ctx
}

export function createSebarCommand(): Command {
  const sebar = new Command('sebar').description(
    'Sebar communication commands (custom inbound email domain + addresses).',
  )

  const inbound = new Command('inbound').description(
    'Manage inbound email: the custom domain and the friendly addresses on it.',
  )

  // ── inbound domain ─────────────────────────────────────────────────────────
  const domain = new Command('domain').description(
    'Manage the org custom inbound domain (show, set, verify, remove).',
  )

  domain
    .command('show')
    .description('Show the org current inbound domain and its verification state.')
    .action(async () => {
      const ctx = await orgCtx()
      const result = await apiFetch<{ domain: InboundDomain | null }>(ctx, DOMAIN)
      if (!result.domain) {
        process.stdout.write('No inbound domain set.\n')
        return
      }
      printJson(result.domain)
    })

  domain
    .command('set <domain>')
    .description(
      'Set (or replace) the org inbound subdomain, e.g. inbox.acme.co.id. Must be a ' +
        'dedicated subdomain (>=3 labels), never your main domain. Prints the MX record to publish.',
    )
    .option('--dry-run', 'Print what would be sent without writing.')
    .action(async (domainName: string, opts: { dryRun?: boolean }) => {
      const ctx = await orgCtx()
      const body = { domain: domainName }
      if (opts.dryRun) {
        printJson({ wouldSend: { method: 'POST', path: DOMAIN, body } })
        return
      }
      const result = await apiFetch<{ domain: InboundDomain; mxRecord: MxRecord }>(ctx, DOMAIN, {
        method: 'POST',
        body,
      })
      printMxRecord(result.mxRecord)
      process.stdout.write(
        result.domain.verified ? 'Status: verified.\n' : 'Status: pending — verify once DNS is live.\n',
      )
    })

  domain
    .command('verify')
    .description('Re-check the inbound domain MX against live DNS and update its state.')
    .action(async () => {
      const ctx = await orgCtx()
      const result = await apiFetch<{ domain: InboundDomain; mxRecord: MxRecord }>(ctx, `${DOMAIN}/verify`, {
        method: 'POST',
        body: {},
      })
      process.stdout.write(
        result.domain.verified
          ? `Verified: ${result.domain.domain}\n`
          : `Not verified yet — DNS may still be propagating for ${result.domain.domain}.\n`,
      )
    })

  domain
    .command('remove')
    .description(
      'Remove the org inbound domain and any friendly addresses on it. Requires --yes or a TTY.',
    )
    .option('-y, --yes', 'Skip the confirmation prompt.')
    .action(async (opts: { yes?: boolean }) => {
      const ctx = await orgCtx()
      if (!opts.yes) await confirmOrThrow('Remove the inbound domain and all addresses on it?')
      await apiFetch<{ ok: true }>(ctx, DOMAIN, { method: 'DELETE' })
      process.stdout.write('Inbound domain removed.\n')
    })

  inbound.addCommand(domain)

  // ── inbound address ────────────────────────────────────────────────────────
  const address = new Command('address').description(
    'Manage friendly inbound addresses on the verified inbound domain (list, add, remove).',
  )

  address
    .command('list')
    .description('List the org provisioned inbound addresses.')
    .action(async () => {
      const ctx = await orgCtx()
      const result = await apiFetch<{ addresses: InboundAddress[]; hasServer: boolean }>(ctx, EMAIL)
      if (result.addresses.length === 0) {
        process.stdout.write('No inbound addresses.\n')
        return
      }
      for (const a of result.addresses) {
        const state = a.enabled ? 'enabled' : 'disabled'
        process.stdout.write(`${a.address.padEnd(40)} ${state}\n`)
      }
    })

  address
    .command('add <address>')
    .description(
      'Provision a friendly inbound address (e.g. support@inbox.acme.co.id) on a domain the org owns.',
    )
    .option('--dry-run', 'Print what would be sent without writing.')
    .action(async (addr: string, opts: { dryRun?: boolean }) => {
      const ctx = await orgCtx()
      const body = { address: addr }
      if (opts.dryRun) {
        printJson({ wouldSend: { method: 'POST', path: EMAIL, body } })
        return
      }
      const result = await apiFetch<InboundAddress>(ctx, EMAIL, { method: 'POST', body })
      printJson(result)
    })

  address
    .command('remove <address>')
    .description('Remove a friendly inbound address. Requires --yes or a TTY for confirmation.')
    .option('-y, --yes', 'Skip the confirmation prompt.')
    .action(async (addr: string, opts: { yes?: boolean }) => {
      const ctx = await orgCtx()
      if (!opts.yes) await confirmOrThrow(`Remove inbound address '${addr}'?`)
      await apiFetch<{ ok: true }>(ctx, `${EMAIL}/${encodeURIComponent(addr)}`, { method: 'DELETE' })
      process.stdout.write(`Removed ${addr}.\n`)
    })

  inbound.addCommand(address)
  sebar.addCommand(inbound)
  return sebar
}
