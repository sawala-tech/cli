import { Command } from 'commander'
import {
  SAWALA_BRAND,
  ApiError,
  apiFetch,
  loadContext,
  requireActiveOrg,
  requireActiveProject,
  requireActiveProjectId,
} from '@sawala/auth'
import { confirmOrThrow, resolveInputPayload } from '../lib/io'

/**
 * Kontena is the lightweight content service in the Sawala suite. It exposes
 * a strapi-v5 compatible read/write API of "schemas" (content models) and
 * "entries" (the items inside a schema). The CLI surface here covers both
 * read-only inspection and the create/update/delete + publish workflow.
 *
 * Note: the Kontena worker resolves `:projId` in the URL path as the project's
 * stable ULID — not its slug. The api-gateway canonicalises the
 * `x-project-id` header from slug to id, but the URL path passes through
 * untouched. So every URL below is built from `ctx.activeProjectId`, which
 * `sawala project use <slug>` persists alongside the slug.
 */

interface PaginationMeta {
  limit: number
  nextCursor: string | null
  hasMore: boolean
}

interface SchemaRow {
  id: string
  documentId: string
  slug: string
  name: string
  type: 'single' | 'collection'
}

interface SchemaListResponse {
  data: SchemaRow[]
  meta: { pagination: PaginationMeta }
}

interface SchemaGetResponse {
  id: string
  documentId: string
  slug: string
  name: string
  type: string
  fields?: unknown[]
  locales?: string[]
  [k: string]: unknown
}

interface EntryRow {
  id: string
  documentId: string
  slug: string | null
  locale: string
  status: 'draft' | 'published'
  [k: string]: unknown
}

interface EntryListResponse {
  data: EntryRow[]
  meta: { pagination: PaginationMeta }
}

interface EntryGetResponse {
  id: string
  documentId: string
  slug: string | null
  locale: string
  status: string
  data: unknown
  [k: string]: unknown
}

type PublicationState = 'preview' | 'live'

function parseState(raw: string | undefined): PublicationState {
  if (raw === undefined) return 'live'
  if (raw !== 'preview' && raw !== 'live') {
    throw new Error(`--state must be 'preview' or 'live' (got '${raw}').`)
  }
  return raw
}

/**
 * Fetch a schema's `type` (single vs collection) so the entry CRUD verbs can
 * pick the right `/content/{single,collection}/...` subpath. The schema
 * type is an implementation detail of the kontena data model — exposing it
 * as a user-facing `--type` flag would leak the wire-protocol asymmetry into
 * the CLI surface, so we infer transparently. Costs one extra round-trip per
 * mutation; document the LRU-cache escape hatch if profiling later flags it.
 */
async function fetchSchemaType(
  ctx: Awaited<ReturnType<typeof loadContext>>,
  projectId: string,
  schemaSlug: string,
): Promise<'single' | 'collection'> {
  const schema = await apiFetch<SchemaGetResponse>(
    ctx,
    `/cli/kontena/projects/${encodeURIComponent(projectId)}/schemas/${encodeURIComponent(schemaSlug)}`,
  )
  const t = schema.type
  if (t !== 'single' && t !== 'collection') {
    throw new Error(`Schema '${schemaSlug}' has unexpected type '${t}'.`)
  }
  return t
}

async function listSchemas(): Promise<void> {
  const ctx = await loadContext(SAWALA_BRAND)
  requireActiveOrg(ctx, SAWALA_BRAND)
  const activeProject = requireActiveProject(ctx, SAWALA_BRAND)
  const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

  const result = await apiFetch<SchemaListResponse>(
    ctx,
    `/cli/kontena/projects/${encodeURIComponent(projectId)}/schemas?limit=100`,
  )

  if (result.data.length === 0) {
    process.stdout.write(`No schemas in '${activeProject}'.\n`)
    return
  }

  for (const s of result.data) {
    process.stdout.write(`${s.slug.padEnd(24)} ${s.type.padEnd(12)} ${s.name}\n`)
  }
}

export function createKontenaCommand(): Command {
  const kontena = new Command('kontena').description(
    'Kontena content commands (schemas + entries, read + write).',
  )

  // Service-root shortcut: `sawala kontena list` → same as `kontena schema list`.
  kontena
    .command('list')
    .description('Shortcut for `sawala kontena schema list`.')
    .action(listSchemas)

  const schema = new Command('schema').description(
    'Manage Kontena content schemas (list, get, create, update, delete).',
  )

  schema
    .command('list')
    .description('List schemas in the active project.')
    .action(listSchemas)

  schema
    .command('get <slugOrId>')
    .description(
      'Fetch one schema by ULID or slug. Tries the ULID lookup first; ' +
        'falls back to listing schemas and matching by slug on 404.',
    )
    .action(async (slugOrId: string) => {
      const ctx = await loadContext(SAWALA_BRAND)
      requireActiveOrg(ctx, SAWALA_BRAND)
      requireActiveProject(ctx, SAWALA_BRAND)
      const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

      const directPath = `/cli/kontena/projects/${encodeURIComponent(projectId)}/schemas/${encodeURIComponent(slugOrId)}`
      try {
        const result = await apiFetch<SchemaGetResponse>(ctx, directPath)
        process.stdout.write(JSON.stringify(result, null, 2) + '\n')
        return
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 404) throw err
      }

      // Fallback: list and match by slug.
      const listResult = await apiFetch<SchemaListResponse>(
        ctx,
        `/cli/kontena/projects/${encodeURIComponent(projectId)}/schemas?limit=100`,
      )
      const match = listResult.data.find((s) => s.slug === slugOrId)
      if (!match) {
        const available = listResult.data.map((s) => s.slug).join(', ') || '(none)'
        throw new Error(
          `Schema '${slugOrId}' not found. Available slugs: ${available}.`,
        )
      }
      const result = await apiFetch<SchemaGetResponse>(
        ctx,
        `/cli/kontena/projects/${encodeURIComponent(projectId)}/schemas/${encodeURIComponent(match.id)}`,
      )
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    })

  schema
    .command('create')
    .description('Create a new schema. Provide the body via --file or --data.')
    .option('-f, --file <path>', "Read JSON body from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline JSON body.')
    .option('--dry-run', 'Validate and print the payload without writing.')
    .action(
      async (opts: { file?: string; data?: string; dryRun?: boolean }) => {
        const ctx = await loadContext(SAWALA_BRAND)
        requireActiveOrg(ctx, SAWALA_BRAND)
        requireActiveProject(ctx, SAWALA_BRAND)
        const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

        const body = await resolveInputPayload(opts)
        if (opts.dryRun) {
          process.stdout.write(
            JSON.stringify({ wouldSend: { method: 'POST', body } }, null, 2) + '\n',
          )
          return
        }
        const result = await apiFetch<unknown>(
          ctx,
          `/cli/kontena/projects/${encodeURIComponent(projectId)}/schemas`,
          { method: 'POST', body },
        )
        process.stdout.write(JSON.stringify(result, null, 2) + '\n')
      },
    )

  schema
    .command('update <slugOrId>')
    .description('Update a schema. Body is treated as a PUT replacement.')
    .option('-f, --file <path>', "Read JSON body from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline JSON body.')
    .option('--dry-run', 'Validate and print the payload without writing.')
    .action(
      async (
        slugOrId: string,
        opts: { file?: string; data?: string; dryRun?: boolean },
      ) => {
        const ctx = await loadContext(SAWALA_BRAND)
        requireActiveOrg(ctx, SAWALA_BRAND)
        requireActiveProject(ctx, SAWALA_BRAND)
        const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

        const body = await resolveInputPayload(opts)
        if (opts.dryRun) {
          process.stdout.write(
            JSON.stringify({ wouldSend: { method: 'PUT', body } }, null, 2) + '\n',
          )
          return
        }
        const result = await apiFetch<unknown>(
          ctx,
          `/cli/kontena/projects/${encodeURIComponent(projectId)}/schemas/${encodeURIComponent(slugOrId)}`,
          { method: 'PUT', body },
        )
        process.stdout.write(JSON.stringify(result, null, 2) + '\n')
      },
    )

  schema
    .command('delete <slugOrId>')
    .description('Delete a schema. Requires --yes or a TTY for confirmation.')
    .option('-y, --yes', 'Skip the confirmation prompt.')
    .action(async (slugOrId: string, opts: { yes?: boolean }) => {
      const ctx = await loadContext(SAWALA_BRAND)
      requireActiveOrg(ctx, SAWALA_BRAND)
      const activeProject = requireActiveProject(ctx, SAWALA_BRAND)
      const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

      if (!opts.yes) {
        await confirmOrThrow(
          `Delete schema '${slugOrId}' in project '${activeProject}'?`,
        )
      }
      const result = await apiFetch<unknown>(
        ctx,
        `/cli/kontena/projects/${encodeURIComponent(projectId)}/schemas/${encodeURIComponent(slugOrId)}`,
        { method: 'DELETE' },
      )
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    })

  kontena.addCommand(schema)

  const entry = new Command('entry').description(
    'Manage Kontena content entries (list, get, create, update, delete, publish).',
  )

  entry
    .command('list <schemaSlug>')
    .description('List entries of a collection schema.')
    .option('--locale <code>', 'Filter by locale code (e.g. `en`).')
    .option(
      '--state <preview|live>',
      'Publication state (preview includes drafts; live is published only).',
      'live',
    )
    .action(
      async (
        schemaSlug: string,
        opts: { locale?: string; state?: string },
      ) => {
        const ctx = await loadContext(SAWALA_BRAND)
        requireActiveOrg(ctx, SAWALA_BRAND)
        requireActiveProject(ctx, SAWALA_BRAND)
        const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

        const state = parseState(opts.state)
        const params = new URLSearchParams()
        params.set('publicationState', state)
        if (opts.locale) params.set('locale', opts.locale)

        const result = await apiFetch<EntryListResponse>(
          ctx,
          `/cli/kontena/projects/${encodeURIComponent(projectId)}/content/collection/${encodeURIComponent(schemaSlug)}?${params.toString()}`,
        )

        if (result.data.length === 0) {
          process.stdout.write(`No entries in '${schemaSlug}'.\n`)
          return
        }

        for (const e of result.data) {
          const label = e.slug ?? e.id
          process.stdout.write(`${label.padEnd(32)} ${e.locale.padEnd(6)} ${e.status}\n`)
        }
      },
    )

  entry
    .command('get <schemaSlug> <slugOrId>')
    .description('Fetch one entry by ULID or slug.')
    .option('--locale <code>', 'Locale code (e.g. `en`).')
    .option(
      '--state <preview|live>',
      'Publication state (preview includes drafts; live is published only).',
      'live',
    )
    .action(
      async (
        schemaSlug: string,
        slugOrId: string,
        opts: { locale?: string; state?: string },
      ) => {
        const ctx = await loadContext(SAWALA_BRAND)
        requireActiveOrg(ctx, SAWALA_BRAND)
        requireActiveProject(ctx, SAWALA_BRAND)
        const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

        const state = parseState(opts.state)
        const params = new URLSearchParams()
        params.set('publicationState', state)
        if (opts.locale) params.set('locale', opts.locale)

        const qs = params.toString()
        const result = await apiFetch<EntryGetResponse>(
          ctx,
          `/cli/kontena/projects/${encodeURIComponent(projectId)}/content/collection/${encodeURIComponent(schemaSlug)}/${encodeURIComponent(slugOrId)}${qs ? `?${qs}` : ''}`,
        )
        process.stdout.write(JSON.stringify(result, null, 2) + '\n')
      },
    )

  entry
    .command('create <schemaSlug>')
    .description(
      'Create a content entry. Single-type schemas upsert per locale; ' +
        'collection schemas enforce slug uniqueness per (schemaSlug, locale).',
    )
    .option('-f, --file <path>', "Read JSON body from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline JSON body.')
    .option('--publish', "Set status='published' on create (default is draft).")
    .option('--dry-run', 'Validate and print the payload without writing.')
    .action(
      async (
        schemaSlug: string,
        opts: { file?: string; data?: string; publish?: boolean; dryRun?: boolean },
      ) => {
        const ctx = await loadContext(SAWALA_BRAND)
        requireActiveOrg(ctx, SAWALA_BRAND)
        requireActiveProject(ctx, SAWALA_BRAND)
        const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

        const payload = (await resolveInputPayload(opts)) as Record<string, unknown>
        if (opts.publish) payload.status = 'published'
        if (opts.dryRun) {
          process.stdout.write(
            JSON.stringify({ wouldSend: { method: 'POST', body: payload } }, null, 2) + '\n',
          )
          return
        }
        const schemaType = await fetchSchemaType(ctx, projectId, schemaSlug)
        const subpath = schemaType === 'single' ? 'single' : 'collection'
        const result = await apiFetch<unknown>(
          ctx,
          `/cli/kontena/projects/${encodeURIComponent(projectId)}/content/${subpath}/${encodeURIComponent(schemaSlug)}`,
          { method: 'POST', body: payload },
        )
        process.stdout.write(JSON.stringify(result, null, 2) + '\n')
      },
    )

  entry
    .command('update <schemaSlug> <slugOrId>')
    .description('Update a content entry. PUT replacement semantics.')
    .option('-f, --file <path>', "Read JSON body from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline JSON body.')
    .option('--publish', "Also set status='published' in the same write.")
    .option('--dry-run', 'Validate and print the payload without writing.')
    .action(
      async (
        schemaSlug: string,
        slugOrId: string,
        opts: { file?: string; data?: string; publish?: boolean; dryRun?: boolean },
      ) => {
        const ctx = await loadContext(SAWALA_BRAND)
        requireActiveOrg(ctx, SAWALA_BRAND)
        requireActiveProject(ctx, SAWALA_BRAND)
        const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

        const payload = (await resolveInputPayload(opts)) as Record<string, unknown>
        if (opts.publish) payload.status = 'published'
        if (opts.dryRun) {
          process.stdout.write(
            JSON.stringify({ wouldSend: { method: 'PUT', body: payload } }, null, 2) + '\n',
          )
          return
        }
        const schemaType = await fetchSchemaType(ctx, projectId, schemaSlug)
        const url =
          schemaType === 'single'
            ? `/cli/kontena/projects/${encodeURIComponent(projectId)}/content/single/${encodeURIComponent(schemaSlug)}`
            : `/cli/kontena/projects/${encodeURIComponent(projectId)}/content/collection/${encodeURIComponent(schemaSlug)}/${encodeURIComponent(slugOrId)}`
        const result = await apiFetch<unknown>(ctx, url, { method: 'PUT', body: payload })
        process.stdout.write(JSON.stringify(result, null, 2) + '\n')
      },
    )

  entry
    .command('delete <schemaSlug> <slugOrId>')
    .description('Delete a content entry. Requires --yes or a TTY for confirmation.')
    .option('-y, --yes', 'Skip the confirmation prompt.')
    .option('--locale <code>', 'Locale to target (required for single-type schemas).')
    .action(
      async (
        schemaSlug: string,
        slugOrId: string,
        opts: { yes?: boolean; locale?: string },
      ) => {
        const ctx = await loadContext(SAWALA_BRAND)
        requireActiveOrg(ctx, SAWALA_BRAND)
        requireActiveProject(ctx, SAWALA_BRAND)
        const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

        if (!opts.yes) {
          await confirmOrThrow(`Delete entry '${slugOrId}' from '${schemaSlug}'?`)
        }
        const schemaType = await fetchSchemaType(ctx, projectId, schemaSlug)
        const url =
          schemaType === 'single'
            ? `/cli/kontena/projects/${encodeURIComponent(projectId)}/content/single/${encodeURIComponent(schemaSlug)}` +
              (opts.locale ? `?locale=${encodeURIComponent(opts.locale)}` : '')
            : `/cli/kontena/projects/${encodeURIComponent(projectId)}/content/collection/${encodeURIComponent(schemaSlug)}/${encodeURIComponent(slugOrId)}`
        const result = await apiFetch<unknown>(ctx, url, { method: 'DELETE' })
        process.stdout.write(JSON.stringify(result, null, 2) + '\n')
      },
    )

  entry
    .command('publish <schemaSlug> <slugOrId>')
    .description("Publish a draft collection entry (sets status='published').")
    .action(async (schemaSlug: string, slugOrId: string) => {
      const ctx = await loadContext(SAWALA_BRAND)
      requireActiveOrg(ctx, SAWALA_BRAND)
      requireActiveProject(ctx, SAWALA_BRAND)
      const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

      const result = await apiFetch<unknown>(
        ctx,
        `/cli/kontena/projects/${encodeURIComponent(projectId)}/content/collection/${encodeURIComponent(schemaSlug)}/${encodeURIComponent(slugOrId)}`,
        { method: 'PUT', body: { status: 'published' } },
      )
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    })

  entry
    .command('unpublish <schemaSlug> <slugOrId>')
    .description("Unpublish a collection entry (sets status='draft').")
    .action(async (schemaSlug: string, slugOrId: string) => {
      const ctx = await loadContext(SAWALA_BRAND)
      requireActiveOrg(ctx, SAWALA_BRAND)
      requireActiveProject(ctx, SAWALA_BRAND)
      const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

      const result = await apiFetch<unknown>(
        ctx,
        `/cli/kontena/projects/${encodeURIComponent(projectId)}/content/collection/${encodeURIComponent(schemaSlug)}/${encodeURIComponent(slugOrId)}`,
        { method: 'PUT', body: { status: 'draft' } },
      )
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    })

  kontena.addCommand(entry)

  return kontena
}
