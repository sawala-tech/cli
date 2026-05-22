// Berkasna's asset routes are *org-scoped*, not project-scoped — the
// worker resolves the project from the x-project-id header set by
// apiFetch. Hence the CLI URL is /cli/berkasna/assets, not
// /cli/berkasna/projects/:projId/assets like Kontena/Formulir.
import { Command } from 'commander'
import {
  SAWALA_BRAND,
  apiFetch,
  loadContext,
  requireActiveOrg,
  requireActiveProject,
} from '@sawala/auth'

/**
 * Berkasna is the asset/file metadata service in the Sawala suite. Assets
 * are uploaded files (images, PDFs, videos, audio, etc.); the CLI surface
 * is read-only and returns *metadata only* — to fetch the bytes, GET the
 * asset's `publicUrl` (served from https://berkasna.sawala.cloud).
 *
 * Unlike Kontena and Formulir, Berkasna's routes are org-scoped, not
 * project-scoped — the worker reads the project from the x-project-id
 * header that apiFetch sets from the active project. The `projectId`
 * query param is an *optional* filter, not a routing key.
 */

interface AssetRow {
  id: string
  orgId: string
  projectId: string | null
  originalName: string | null
  mimeType: string
  size: number
  status: string
  sha256: string | null
  r2Key: string
  publicUrl: string | null
  createdAt: string
  updatedAt: string
  [k: string]: unknown
}

interface AssetListResponse {
  items: AssetRow[]
  hasMore: boolean
  nextCursor: string | null
}

type AssetKind = 'image' | 'pdf' | 'video' | 'audio' | 'all'

const KIND_VALUES: readonly AssetKind[] = ['image', 'pdf', 'video', 'audio', 'all']

function parseKind(raw: string | undefined): AssetKind | undefined {
  if (raw === undefined) return undefined
  if (!(KIND_VALUES as readonly string[]).includes(raw)) {
    throw new Error(
      `--kind must be one of ${KIND_VALUES.join(' | ')} (got '${raw}').`,
    )
  }
  return raw as AssetKind
}

function kindToMimeCategory(kind: AssetKind | undefined): string | null {
  if (kind === undefined || kind === 'all') return null
  if (kind === 'pdf') return 'application/pdf'
  return kind
}

function kindOf(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  return 'other'
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return `${bytes} B`
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIdx = 0
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024
    unitIdx += 1
  }
  // 1 decimal place, but drop trailing .0 for cleaner output.
  const rounded = value >= 100 ? value.toFixed(0) : value.toFixed(1)
  return `${rounded} ${units[unitIdx]}`
}

async function listAssets(opts: {
  limit?: string
  cursor?: string
  kind?: string
  project?: string
}): Promise<void> {
  const ctx = await loadContext(SAWALA_BRAND)
  requireActiveOrg(ctx, SAWALA_BRAND)
  requireActiveProject(ctx, SAWALA_BRAND)

  const limitRaw = opts.limit ?? '50'
  const limit = Number.parseInt(limitRaw, 10)
  if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
    throw new Error(
      `--limit must be an integer between 1 and 100 (got '${limitRaw}').`,
    )
  }

  const kind = parseKind(opts.kind)
  const mimeCategory = kindToMimeCategory(kind)

  const params = new URLSearchParams()
  params.set('limit', String(limit))
  if (opts.cursor) params.set('cursor', opts.cursor)
  if (mimeCategory) params.set('mimeCategory', mimeCategory)
  if (opts.project) params.set('projectId', opts.project)

  const result = await apiFetch<AssetListResponse>(
    ctx,
    `/cli/berkasna/assets?${params.toString()}`,
  )

  if (result.items.length === 0) {
    process.stdout.write('No assets matching filters.\n')
    return
  }

  for (const a of result.items) {
    const name = a.originalName ?? '(unnamed)'
    process.stdout.write(
      `${a.id.padEnd(28)} ${kindOf(a.mimeType).padEnd(8)} ${name.padEnd(40)} ${formatSize(a.size)}\n`,
    )
  }

  if (result.nextCursor) {
    process.stdout.write(`\n(more — pass --cursor ${result.nextCursor})\n`)
  }
}

export function createBerkasnaCommand(): Command {
  const berkasna = new Command('berkasna').description(
    'Read-only Berkasna commands (assets metadata).',
  )

  const listOptions = (cmd: Command): Command =>
    cmd
      .option('--limit <n>', 'Page size (default 50, max 100).', '50')
      .option('--cursor <c>', 'Opaque cursor returned by a previous page.')
      .option(
        '--kind <kind>',
        'Filter by asset kind: image | pdf | video | audio | all.',
      )
      .option(
        '--project <projectId>',
        'Filter by an explicit project id (defaults to no project filter — ' +
          'returns assets across the active org).',
      )

  // Service-root shortcut: `sawala berkasna list` → `berkasna asset list`.
  listOptions(
    berkasna
      .command('list')
      .description('Shortcut for `sawala berkasna asset list`.'),
  ).action(listAssets)

  const asset = new Command('asset').description('Inspect Berkasna assets.')

  listOptions(
    asset.command('list').description('List assets in the active org.'),
  ).action(listAssets)

  asset
    .command('get <id>')
    .description('Fetch one asset by ULID; prints metadata as JSON.')
    .action(async (id: string) => {
      const ctx = await loadContext(SAWALA_BRAND)
      requireActiveOrg(ctx, SAWALA_BRAND)
      requireActiveProject(ctx, SAWALA_BRAND)

      const row = await apiFetch<AssetRow>(
        ctx,
        `/cli/berkasna/assets/${encodeURIComponent(id)}`,
      )
      process.stdout.write(JSON.stringify(row, null, 2) + '\n')
    })

  berkasna.addCommand(asset)

  return berkasna
}
