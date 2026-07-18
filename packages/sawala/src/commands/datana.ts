import { Command } from 'commander'
import {
  SAWALA_BRAND,
  apiFetch,
  loadContext,
  requireActiveOrg,
  requireActiveProject,
  requireActiveProjectId,
} from '@sawala/auth'
import { confirmOrThrow, resolveInputPayload } from '../lib/io'

/**
 * Datana is the unified structured-data platform in the Sawala suite. It
 * exposes "collections" (typed data models) and "records" (the rows inside a
 * collection), with private-by-default visibility and an opt-in public read
 * API. This CLI surface covers the dashboard/CLI bearer surface forwarded via
 * the gateway's `/cli/datana/*` prefix.
 *
 * Like Kontena, the Datana worker resolves `:projId` in the URL path as the
 * project's stable ULID — not its slug. So every URL below is built from
 * `ctx.activeProjectId`, which `sawala project use <slug>` persists alongside
 * the slug.
 */

interface PaginationMeta {
  limit: number
  nextCursor: string | null
  hasMore: boolean
}

interface CollectionRow {
  id: string
  slug: string
  name: string
  visibility: 'private' | 'public'
  pinned?: boolean
  [k: string]: unknown
}

interface CollectionListResponse {
  data: CollectionRow[]
  meta: { pagination: PaginationMeta }
}

interface RecordRow {
  id: string
  status: 'draft' | 'published'
  data: Record<string, unknown>
  [k: string]: unknown
}

interface RecordListResponse {
  data: RecordRow[]
  meta: { pagination: PaginationMeta }
}

function parseStatus(raw: string | undefined): 'draft' | 'published' | undefined {
  if (raw === undefined) return undefined
  if (raw !== 'draft' && raw !== 'published') {
    throw new Error(`--status must be 'draft' or 'published' (got '${raw}').`)
  }
  return raw
}

// Commander calls this for each `--filter` occurrence, accumulating repeats.
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value])
}

function collectionsBase(projectId: string): string {
  return `/cli/datana/projects/${encodeURIComponent(projectId)}/collections`
}

function recordsBase(projectId: string, collectionSlug: string): string {
  return `${collectionsBase(projectId)}/${encodeURIComponent(collectionSlug)}/records`
}

function pipelineEventsBase(projectId: string, collectionSlug: string): string {
  return `${collectionsBase(projectId)}/${encodeURIComponent(collectionSlug)}/events`
}

// Shape the resolved --file/--data payload into the ingest body the Pipeline
// endpoint expects. Accepts, in order of convenience:
//   - an array            → { events: [...] }
//   - an { event }/{ events } envelope (optionally with dedupeKeys) → sent as-is
//   - any other object    → a single { event: {...} }
// `--dedupe-keys a,b` is merged in unless the envelope already carries it.
function buildIngestBody(payload: unknown, dedupeKeys?: string[]): Record<string, unknown> {
  let body: Record<string, unknown>
  if (Array.isArray(payload)) {
    body = { events: payload }
  } else if (payload && typeof payload === 'object' && ('event' in payload || 'events' in payload)) {
    body = { ...(payload as Record<string, unknown>) }
  } else if (payload && typeof payload === 'object') {
    body = { event: payload }
  } else {
    throw new Error('Pipeline event payload must be a JSON object or array of objects.')
  }
  if (dedupeKeys && dedupeKeys.length > 0 && body.dedupeKeys === undefined) {
    body.dedupeKeys = dedupeKeys
  }
  return body
}

async function listCollections(): Promise<void> {
  const ctx = await loadContext(SAWALA_BRAND)
  requireActiveOrg(ctx, SAWALA_BRAND)
  const activeProject = requireActiveProject(ctx, SAWALA_BRAND)
  const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

  const result = await apiFetch<CollectionListResponse>(
    ctx,
    `${collectionsBase(projectId)}?limit=100`,
  )
  if (result.data.length === 0) {
    process.stdout.write(`No collections in '${activeProject}'.\n`)
    return
  }
  for (const c of result.data) {
    process.stdout.write(`${c.slug.padEnd(24)} ${c.visibility.padEnd(8)} ${c.name}\n`)
  }
}

export function createDatanaCommand(): Command {
  const datana = new Command('datana').description(
    'Datana structured-data commands (collections + records, read + write).',
  )

  // Service-root shortcut: `sawala datana list` → `datana collection list`.
  datana
    .command('list')
    .description('Shortcut for `sawala datana collection list`.')
    .action(listCollections)

  // ── collections ───────────────────────────────────────────────────────────
  const collection = new Command('collection').description(
    'Manage Datana collections (list, get, create, update).',
  )

  collection
    .command('list')
    .description('List collections in the active project.')
    .action(listCollections)

  collection
    .command('get <slug>')
    .description('Fetch one collection by slug, including its field definitions.')
    .action(async (slug: string) => {
      const ctx = await loadContext(SAWALA_BRAND)
      requireActiveOrg(ctx, SAWALA_BRAND)
      requireActiveProject(ctx, SAWALA_BRAND)
      const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

      const result = await apiFetch<unknown>(
        ctx,
        `${collectionsBase(projectId)}/${encodeURIComponent(slug)}`,
      )
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    })

  collection
    .command('create')
    .description(
      'Create a collection. Body: { name, fields[], slug?, visibility?, pinned? }. ' +
        'Provide it via --file or --data.',
    )
    .option('-f, --file <path>', "Read JSON body from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline JSON body.')
    .option('--dry-run', 'Validate and print the payload without writing.')
    .action(async (opts: { file?: string; data?: string; dryRun?: boolean }) => {
      const ctx = await loadContext(SAWALA_BRAND)
      requireActiveOrg(ctx, SAWALA_BRAND)
      requireActiveProject(ctx, SAWALA_BRAND)
      const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

      const body = await resolveInputPayload(opts)
      if (opts.dryRun) {
        process.stdout.write(JSON.stringify({ wouldSend: { method: 'POST', body } }, null, 2) + '\n')
        return
      }
      const result = await apiFetch<unknown>(ctx, collectionsBase(projectId), {
        method: 'POST',
        body,
      })
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    })

  collection
    .command('update <slug>')
    .description('Update a collection. Body is treated as a PUT replacement.')
    .option('-f, --file <path>', "Read JSON body from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline JSON body.')
    .option('--dry-run', 'Validate and print the payload without writing.')
    .action(async (slug: string, opts: { file?: string; data?: string; dryRun?: boolean }) => {
      const ctx = await loadContext(SAWALA_BRAND)
      requireActiveOrg(ctx, SAWALA_BRAND)
      requireActiveProject(ctx, SAWALA_BRAND)
      const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

      const body = await resolveInputPayload(opts)
      if (opts.dryRun) {
        process.stdout.write(JSON.stringify({ wouldSend: { method: 'PUT', body } }, null, 2) + '\n')
        return
      }
      const result = await apiFetch<unknown>(
        ctx,
        `${collectionsBase(projectId)}/${encodeURIComponent(slug)}`,
        { method: 'PUT', body },
      )
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    })

  datana.addCommand(collection)

  // ── records ───────────────────────────────────────────────────────────────
  const record = new Command('record').description(
    'Manage Datana records (list, get, create, update, publish, unpublish, delete).',
  )

  record
    .command('list <collectionSlug>')
    .description('List records in a collection, with optional filter/sort/status.')
    .option('--status <draft|published>', 'Filter by lifecycle status.')
    .option('--sort <field>', "Sort by `field` (asc) or `-field` (desc), e.g. `-createdAt`.")
    .option(
      '--filter <expr>',
      'Repeatable. field:value | field:in:a,b | field:gte:N | field:lte:N.',
      collect,
      [],
    )
    .option('--populate <fields>', "Comma-separated relation fields to inline, or '*' for all.")
    .option('--q <text>', 'Case-insensitive search over the record title (data.title).')
    .option('--limit <n>', 'Page size (1–100, default 25).')
    .action(
      async (
        collectionSlug: string,
        opts: {
          status?: string
          sort?: string
          filter: string[]
          populate?: string
          q?: string
          limit?: string
        },
      ) => {
        const ctx = await loadContext(SAWALA_BRAND)
        requireActiveOrg(ctx, SAWALA_BRAND)
        requireActiveProject(ctx, SAWALA_BRAND)
        const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

        const status = parseStatus(opts.status)
        const params = new URLSearchParams()
        params.set('limit', opts.limit ?? '100')
        if (status) params.set('status', status)
        if (opts.sort) params.set('sort', opts.sort)
        if (opts.populate) params.set('populate', opts.populate)
        if (opts.q) params.set('q', opts.q)
        for (const f of opts.filter) params.append('filter', f)

        const result = await apiFetch<RecordListResponse>(
          ctx,
          `${recordsBase(projectId, collectionSlug)}?${params.toString()}`,
        )
        if (result.data.length === 0) {
          process.stdout.write(`No records in '${collectionSlug}'.\n`)
          return
        }
        for (const r of result.data) {
          const title = typeof r.data?.title === 'string' ? r.data.title : ''
          process.stdout.write(`${r.id.padEnd(28)} ${r.status.padEnd(10)} ${title}\n`)
        }
      },
    )

  record
    .command('get <collectionSlug> <id>')
    .description('Fetch one record by id.')
    .option('--populate <fields>', "Comma-separated relation fields to inline, or '*' for all.")
    .action(async (collectionSlug: string, id: string, opts: { populate?: string }) => {
      const ctx = await loadContext(SAWALA_BRAND)
      requireActiveOrg(ctx, SAWALA_BRAND)
      requireActiveProject(ctx, SAWALA_BRAND)
      const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

      const qs = opts.populate ? `?populate=${encodeURIComponent(opts.populate)}` : ''
      const result = await apiFetch<unknown>(
        ctx,
        `${recordsBase(projectId, collectionSlug)}/${encodeURIComponent(id)}${qs}`,
      )
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    })

  record
    .command('create <collectionSlug>')
    .description(
      "Create a record. The --file/--data body is the record's field values (the " +
        "`data` object); they're wrapped as { data, status } for the API.",
    )
    .option('-f, --file <path>', "Read JSON body from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline JSON body (the record field values).')
    .option('--publish', "Set status='published' on create (default is draft).")
    .option('--dry-run', 'Validate and print the payload without writing.')
    .action(
      async (
        collectionSlug: string,
        opts: { file?: string; data?: string; publish?: boolean; dryRun?: boolean },
      ) => {
        const ctx = await loadContext(SAWALA_BRAND)
        requireActiveOrg(ctx, SAWALA_BRAND)
        requireActiveProject(ctx, SAWALA_BRAND)
        const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

        const data = await resolveInputPayload(opts)
        const body: Record<string, unknown> = { data }
        if (opts.publish) body.status = 'published'
        if (opts.dryRun) {
          process.stdout.write(JSON.stringify({ wouldSend: { method: 'POST', body } }, null, 2) + '\n')
          return
        }
        const result = await apiFetch<unknown>(ctx, recordsBase(projectId, collectionSlug), {
          method: 'POST',
          body,
        })
        process.stdout.write(JSON.stringify(result, null, 2) + '\n')
      },
    )

  record
    .command('update <collectionSlug> <id>')
    .description(
      "Update a record. PUT replacement semantics; the --file/--data body is the " +
        'record field values (wrapped as { data, status }).',
    )
    .option('-f, --file <path>', "Read JSON body from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline JSON body (the record field values).')
    .option('--publish', "Also set status='published' in the same write.")
    .option('--dry-run', 'Validate and print the payload without writing.')
    .action(
      async (
        collectionSlug: string,
        id: string,
        opts: { file?: string; data?: string; publish?: boolean; dryRun?: boolean },
      ) => {
        const ctx = await loadContext(SAWALA_BRAND)
        requireActiveOrg(ctx, SAWALA_BRAND)
        requireActiveProject(ctx, SAWALA_BRAND)
        const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

        const data = await resolveInputPayload(opts)
        const body: Record<string, unknown> = { data }
        if (opts.publish) body.status = 'published'
        if (opts.dryRun) {
          process.stdout.write(JSON.stringify({ wouldSend: { method: 'PUT', body } }, null, 2) + '\n')
          return
        }
        const result = await apiFetch<unknown>(
          ctx,
          `${recordsBase(projectId, collectionSlug)}/${encodeURIComponent(id)}`,
          { method: 'PUT', body },
        )
        process.stdout.write(JSON.stringify(result, null, 2) + '\n')
      },
    )

  record
    .command('publish <collectionSlug> <id>')
    .description("Publish a record (sets status='published') without resending its body.")
    .action(async (collectionSlug: string, id: string) => {
      const ctx = await loadContext(SAWALA_BRAND)
      requireActiveOrg(ctx, SAWALA_BRAND)
      requireActiveProject(ctx, SAWALA_BRAND)
      const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

      const result = await apiFetch<unknown>(
        ctx,
        `${recordsBase(projectId, collectionSlug)}/${encodeURIComponent(id)}`,
        { method: 'PATCH', body: { status: 'published' } },
      )
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    })

  record
    .command('unpublish <collectionSlug> <id>')
    .description("Unpublish a record (sets status='draft') without resending its body.")
    .action(async (collectionSlug: string, id: string) => {
      const ctx = await loadContext(SAWALA_BRAND)
      requireActiveOrg(ctx, SAWALA_BRAND)
      requireActiveProject(ctx, SAWALA_BRAND)
      const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

      const result = await apiFetch<unknown>(
        ctx,
        `${recordsBase(projectId, collectionSlug)}/${encodeURIComponent(id)}`,
        { method: 'PATCH', body: { status: 'draft' } },
      )
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    })

  record
    .command('delete <collectionSlug> <id>')
    .description('Delete a record. Requires --yes or a TTY for confirmation.')
    .option('-y, --yes', 'Skip the confirmation prompt.')
    .action(async (collectionSlug: string, id: string, opts: { yes?: boolean }) => {
      const ctx = await loadContext(SAWALA_BRAND)
      requireActiveOrg(ctx, SAWALA_BRAND)
      requireActiveProject(ctx, SAWALA_BRAND)
      const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

      if (!opts.yes) {
        await confirmOrThrow(`Delete record '${id}' from '${collectionSlug}'?`)
      }
      const result = await apiFetch<unknown>(
        ctx,
        `${recordsBase(projectId, collectionSlug)}/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      )
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    })

  datana.addCommand(record)

  // ── pipeline (analytical plane) ─────────────────────────────────────────────
  // Datana Pipeline is the append-only analytical plane (PLAN-datana-pipeline-
  // analytical-plane): a pipeline collection reuses the same typed-field schema as
  // an operational collection but its records are ingested as events, never
  // updated/deleted and never draft/published. Events land in the Iceberg-on-R2
  // archive (or, pre-beta, a D1 landing) rather than being served row-by-row.
  const pipeline = new Command('pipeline').description(
    'Datana Pipeline — the append-only analytical plane (create pipeline collections, push events).',
  )

  pipeline
    .command('create')
    .description(
      'Create a pipeline (analytical) collection. Body: { name, fields[], slug? } via ' +
        '--file or --data; flavor is forced to "pipeline" and visibility to private.',
    )
    .option('-f, --file <path>', "Read JSON body from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline JSON body.')
    .option('--dry-run', 'Validate and print the payload without writing.')
    .action(async (opts: { file?: string; data?: string; dryRun?: boolean }) => {
      const ctx = await loadContext(SAWALA_BRAND)
      requireActiveOrg(ctx, SAWALA_BRAND)
      requireActiveProject(ctx, SAWALA_BRAND)
      const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

      const input = await resolveInputPayload(opts)
      if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('A pipeline collection body must be a JSON object ({ name, fields[] }).')
      }
      // Force the analytical plane regardless of what the body says — this
      // subcommand exists precisely to create pipeline collections.
      const body: Record<string, unknown> = { ...(input as Record<string, unknown>), flavor: 'pipeline' }
      if (opts.dryRun) {
        process.stdout.write(JSON.stringify({ wouldSend: { method: 'POST', body } }, null, 2) + '\n')
        return
      }
      const result = await apiFetch<unknown>(ctx, collectionsBase(projectId), { method: 'POST', body })
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    })

  pipeline
    .command('push <collectionSlug>')
    .description(
      'Ingest events into a pipeline collection. The --file/--data payload may be a ' +
        'single event object, an array of events, or an { events, dedupeKeys } envelope.',
    )
    .option('-f, --file <path>', "Read JSON body from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline JSON payload.')
    .option(
      '--dedupe-keys <fields>',
      'Comma-separated field names composing the per-event natural key (at-most-once ingest).',
    )
    .option('--dry-run', 'Validate and print the payload without writing.')
    .action(
      async (
        collectionSlug: string,
        opts: { file?: string; data?: string; dedupeKeys?: string; dryRun?: boolean },
      ) => {
        const ctx = await loadContext(SAWALA_BRAND)
        requireActiveOrg(ctx, SAWALA_BRAND)
        requireActiveProject(ctx, SAWALA_BRAND)
        const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

        const dedupeKeys = opts.dedupeKeys
          ? opts.dedupeKeys.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined
        const payload = await resolveInputPayload(opts)
        const body = buildIngestBody(payload, dedupeKeys)
        if (opts.dryRun) {
          process.stdout.write(JSON.stringify({ wouldSend: { method: 'POST', body } }, null, 2) + '\n')
          return
        }
        const result = await apiFetch<unknown>(ctx, pipelineEventsBase(projectId, collectionSlug), {
          method: 'POST',
          body,
        })
        process.stdout.write(JSON.stringify(result, null, 2) + '\n')
      },
    )

  datana.addCommand(pipeline)

  return datana
}
