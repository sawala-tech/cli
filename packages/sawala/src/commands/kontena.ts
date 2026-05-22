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

/**
 * Kontena is the lightweight content service in the Sawala suite. It exposes
 * a strapi-v5 compatible read/write API of "schemas" (content models) and
 * "entries" (the items inside a schema). The CLI surface here is read-only.
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
    'Read-only Kontena content commands (schemas + entries).',
  )

  // Service-root shortcut: `sawala kontena list` → same as `kontena schema list`.
  kontena
    .command('list')
    .description('Shortcut for `sawala kontena schema list`.')
    .action(listSchemas)

  const schema = new Command('schema').description('Inspect Kontena content schemas.')

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

  kontena.addCommand(schema)

  const entry = new Command('entry').description('Inspect Kontena content entries.')

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

  kontena.addCommand(entry)

  return kontena
}
