import { Command } from 'commander'
import { SAWALA_BRAND, apiFetch, loadContext, requireActiveOrg } from '@sawala/auth'
import { confirmOrThrow } from '../lib/io'

/**
 * Akuna — Sawala's membership service (per-org Clerk connection + member
 * directory). These commands drive the ISOLATED-STORAGE seam: by default an
 * org's member rows live in the shared `sawala-akuna` D1 scoped by org_id; an
 * operator can move a single connection's member data plane onto a dedicated
 * per-org database (`sawala-akuna-org-<orgId>`) for data-residency / scale.
 *
 * This is an operator action, not a customer self-serve one, and it is
 * effectively one-way (no isolated→shared migration exists) — which is exactly
 * why it lives on the CLI/MCP-only surface (`/cli/akuna/*`) instead of the
 * browser dashboard. The provisioner route is tagged 'Internal' on the backend.
 *
 * No projectId appears in the URL: a connection is org-scoped. The gateway
 * resolves the CLI token's org and injects it as x-org-id, so scope can never be
 * widened from the command line — a request only ever touches the caller's own
 * org (a connection id from another org → 404). The forwarder strips
 * `/cli/akuna`, so `/cli/akuna/connections/:id/provision-isolated` reaches
 * Akuna's handler as `/connections/:id/provision-isolated`.
 */

const CONNECTIONS = '/cli/akuna/connections'
const STORAGE = '/cli/akuna/storage'

interface Connection {
  id: string
  mode: 'managed' | 'byo'
  clerkInstanceDomain: string
  storageMode: 'shared' | 'isolated'
  status: 'active' | 'disabled' | 'deleted'
}

interface ProvisionResult {
  id: string
  storageMode: 'isolated'
  isolatedDbId: string
}

// Org-level data-residency status. Isolation is an ORG setting (per-product):
// enabling moves ALL the org's BYO connections onto one dedicated database.
// Managed (Quick Login) connections always stay shared and are not counted.
interface StorageStatus {
  isolated: boolean
  databaseName: string | null
  byoTotal: number
  byoIsolated: number
}

function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n')
}

async function orgCtx() {
  const ctx = await loadContext(SAWALA_BRAND)
  requireActiveOrg(ctx, SAWALA_BRAND)
  return ctx
}

export function createAkunaCommand(): Command {
  const akuna = new Command('akuna').description(
    "Manage the org Akuna membership connections and their storage mode.",
  )

  const connection = new Command('connection').description(
    'List connections and move one to isolated per-org storage.',
  )

  connection
    .command('list')
    .description('List the org membership connections (id, mode, domain, storage, status).')
    .action(async () => {
      const ctx = await orgCtx()
      const result = await apiFetch<{ data: Connection[] }>(ctx, CONNECTIONS)
      if (result.data.length === 0) {
        process.stdout.write('No connections.\n')
        return
      }
      for (const c of result.data) {
        process.stdout.write(
          `${c.id}  ${c.mode.padEnd(7)}  ${(c.clerkInstanceDomain || '-').padEnd(28)}  ${c.storageMode.padEnd(8)}  ${c.status}\n`,
        )
      }
    })

  connection
    .command('isolate <connectionId>')
    .description(
      'Move a connection to a dedicated per-org D1 (storage_mode=isolated). ' +
        'Provisions the database if needed and is idempotent. NOTE: effectively ' +
        'one-way — there is no isolated→shared migration. Requires --yes or a TTY.',
    )
    .option('-y, --yes', 'Skip the confirmation prompt.')
    .option('--dry-run', 'Print what would be sent without writing.')
    .action(async (connectionId: string, opts: { yes?: boolean; dryRun?: boolean }) => {
      const ctx = await orgCtx()
      const path = `${CONNECTIONS}/${encodeURIComponent(connectionId)}/provision-isolated`
      if (opts.dryRun) {
        printJson({ wouldSend: { method: 'POST', path } })
        return
      }
      if (!opts.yes) {
        await confirmOrThrow(
          `Move connection ${connectionId} to a dedicated isolated database? This is effectively one-way.`,
        )
      }
      const result = await apiFetch<ProvisionResult>(ctx, path, { method: 'POST', body: {} })
      process.stdout.write(
        `Connection ${result.id} is now on isolated storage (db: ${result.isolatedDbId}).\n`,
      )
    })

  akuna.addCommand(connection)

  // ── Org-level data residency (the primary model) ────────────────────────────
  // Isolation is an ORG setting: `storage isolate` moves ALL the org's BYO
  // connections onto one dedicated per-org database, and new BYO connections
  // inherit it. This is the org-level counterpart to the per-connection
  // `connection isolate` primitive above. Managed connections always stay shared.
  const storage = new Command('storage').description(
    "Manage the org's data residency (dedicated database for all BYO connections).",
  )

  storage
    .command('status')
    .description('Show whether the org uses a dedicated database, and how many BYO connections are on it.')
    .action(async () => {
      const ctx = await orgCtx()
      const s = await apiFetch<StorageStatus>(ctx, STORAGE)
      if (!s.isolated) {
        process.stdout.write(`Shared storage. ${s.byoTotal} BYO connection(s) in the org.\n`)
        return
      }
      process.stdout.write(
        `Dedicated database active (${s.databaseName}). ${s.byoIsolated} of ${s.byoTotal} BYO connection(s) on it; new BYO connections inherit it.\n`,
      )
    })

  storage
    .command('isolate')
    .description(
      'Enable a dedicated database for the whole org: move ALL BYO connections onto ' +
        'it (managed connections stay shared) and auto-isolate future BYO connections. ' +
        'Idempotent. NOTE: effectively one-way — no isolated→shared migration. Requires --yes or a TTY.',
    )
    .option('-y, --yes', 'Skip the confirmation prompt.')
    .option('--dry-run', 'Print what would be sent without writing.')
    .action(async (opts: { yes?: boolean; dryRun?: boolean }) => {
      const ctx = await orgCtx()
      const path = `${STORAGE}/isolate`
      if (opts.dryRun) {
        printJson({ wouldSend: { method: 'POST', path } })
        return
      }
      if (!opts.yes) {
        await confirmOrThrow(
          'Enable a dedicated database for this org? All BYO connections move onto it. This is effectively one-way.',
        )
      }
      const s = await apiFetch<StorageStatus>(ctx, path, { method: 'POST', body: {} })
      process.stdout.write(
        `Dedicated database enabled (${s.databaseName}). ${s.byoIsolated} of ${s.byoTotal} BYO connection(s) on it.\n`,
      )
    })

  akuna.addCommand(storage)
  return akuna
}
