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
 * Formulir is the form-builder + submissions service in the Sawala suite.
 * Forms are content models with a `fields` schema; submissions are the user
 * responses to those forms (collected from internal dashboard entry, public
 * forms on the marketing site, or embedded widgets).
 *
 * The Formulir worker resolves `:projId` in the URL path as the project's
 * stable ULID — same convention as Kontena. So every URL below is built
 * from `ctx.activeProjectId`, which `sawala project use <slug>` persists
 * alongside the slug. Forms also have a per-project unique `slug`, but the
 * server-side `getForm` only resolves by id; slug→id is the CLI's job.
 * Submissions have no slug and are identified by ULID only.
 */

interface PaginationMeta {
  limit: number
  nextCursor: string | null
  hasMore: boolean
}

interface FormRow {
  id: string
  slug: string
  name: string
  description: string | null
  fields: unknown[]
  settings: Record<string, unknown>
  version: number
  orgSlug: string
  projectSlug: string
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

interface FormListResponse {
  data: FormRow[]
  meta: { pagination: PaginationMeta }
}

interface SubmissionRow {
  id: string
  formId: string
  formVersion: number
  status: 'received' | 'verified' | 'rejected'
  source: 'internal' | 'public' | 'embed'
  data: unknown
  createdByUserId: string | null
  createdByUserName: string | null
  ip: string | null
  userAgent: string | null
  createdAt: string
  updatedAt: string
  lastEditedByUserId: string | null
  lastEditedByUserName: string | null
}

interface SubmissionListResponse {
  data: SubmissionRow[]
  meta: { pagination: PaginationMeta }
}

async function listForms(): Promise<void> {
  const ctx = await loadContext(SAWALA_BRAND)
  requireActiveOrg(ctx, SAWALA_BRAND)
  const activeProject = requireActiveProject(ctx, SAWALA_BRAND)
  const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

  const result = await apiFetch<FormListResponse>(
    ctx,
    `/cli/formulir/projects/${encodeURIComponent(projectId)}/forms?limit=100`,
  )

  if (result.data.length === 0) {
    process.stdout.write(`No forms in '${activeProject}'.\n`)
    return
  }

  for (const f of result.data) {
    process.stdout.write(`${f.slug.padEnd(24)} ${f.name}\n`)
  }
}

/**
 * Resolve a form slug-or-ULID to a stable form id, using the same fallback
 * pattern as `kontena schema get`: ULID lookup first, then list + match by
 * slug on 404. Throws a clear error if no match is found.
 */
async function resolveFormId(
  ctx: Awaited<ReturnType<typeof loadContext>>,
  projectId: string,
  slugOrId: string,
): Promise<{ id: string; direct: FormRow | null }> {
  const directPath = `/cli/formulir/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(slugOrId)}`
  try {
    const row = await apiFetch<FormRow>(ctx, directPath)
    return { id: row.id, direct: row }
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) throw err
  }

  const listResult = await apiFetch<FormListResponse>(
    ctx,
    `/cli/formulir/projects/${encodeURIComponent(projectId)}/forms?limit=100`,
  )
  const match = listResult.data.find((f) => f.slug === slugOrId)
  if (!match) {
    const available = listResult.data.map((f) => f.slug).join(', ') || '(none)'
    throw new Error(`Form not found: '${slugOrId}'. Available: ${available}`)
  }
  return { id: match.id, direct: null }
}

export function createFormulirCommand(): Command {
  const formulir = new Command('formulir').description(
    'Read-only Formulir commands (forms + submissions).',
  )

  // Service-root shortcut: `sawala formulir list` → `formulir form list`.
  formulir
    .command('list')
    .description('Shortcut for `sawala formulir form list`.')
    .action(listForms)

  const form = new Command('form').description('Inspect Formulir forms.')

  form
    .command('list')
    .description('List forms in the active project.')
    .action(listForms)

  form
    .command('get <slugOrId>')
    .description(
      'Fetch one form by ULID or slug. Tries the ULID lookup first; ' +
        'falls back to listing forms and matching by slug on 404.',
    )
    .action(async (slugOrId: string) => {
      const ctx = await loadContext(SAWALA_BRAND)
      requireActiveOrg(ctx, SAWALA_BRAND)
      requireActiveProject(ctx, SAWALA_BRAND)
      const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

      const resolved = await resolveFormId(ctx, projectId, slugOrId)
      if (resolved.direct) {
        process.stdout.write(JSON.stringify(resolved.direct, null, 2) + '\n')
        return
      }
      const row = await apiFetch<FormRow>(
        ctx,
        `/cli/formulir/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(resolved.id)}`,
      )
      process.stdout.write(JSON.stringify(row, null, 2) + '\n')
    })

  formulir.addCommand(form)

  const submission = new Command('submission').description(
    'Inspect Formulir submissions.',
  )

  submission
    .command('list <formSlugOrId>')
    .description('List submissions for a form (resolves slug → id first).')
    .option('--limit <n>', 'Page size (default 50, max 100).', '50')
    .option('--cursor <c>', 'Opaque cursor returned by a previous page.')
    .option(
      '--status <status>',
      'Filter by submission status: received | verified | rejected.',
    )
    .option(
      '--source <source>',
      'Filter by submission source: internal | public | embed.',
    )
    .action(
      async (
        formSlugOrId: string,
        opts: { limit?: string; cursor?: string; status?: string; source?: string },
      ) => {
        const ctx = await loadContext(SAWALA_BRAND)
        requireActiveOrg(ctx, SAWALA_BRAND)
        requireActiveProject(ctx, SAWALA_BRAND)
        const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

        const limitRaw = opts.limit ?? '50'
        const limit = Number.parseInt(limitRaw, 10)
        if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
          throw new Error(
            `--limit must be an integer between 1 and 100 (got '${limitRaw}').`,
          )
        }
        if (
          opts.status !== undefined &&
          opts.status !== 'received' &&
          opts.status !== 'verified' &&
          opts.status !== 'rejected'
        ) {
          throw new Error(
            `--status must be 'received', 'verified', or 'rejected' (got '${opts.status}').`,
          )
        }
        if (
          opts.source !== undefined &&
          opts.source !== 'internal' &&
          opts.source !== 'public' &&
          opts.source !== 'embed'
        ) {
          throw new Error(
            `--source must be 'internal', 'public', or 'embed' (got '${opts.source}').`,
          )
        }

        const resolved = await resolveFormId(ctx, projectId, formSlugOrId)

        const params = new URLSearchParams()
        params.set('limit', String(limit))
        if (opts.cursor) params.set('cursor', opts.cursor)
        if (opts.status) params.set('status', opts.status)
        if (opts.source) params.set('source', opts.source)

        const result = await apiFetch<SubmissionListResponse>(
          ctx,
          `/cli/formulir/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(resolved.id)}/submissions?${params.toString()}`,
        )

        if (result.data.length === 0) {
          process.stdout.write(
            `No submissions for form '${formSlugOrId}'.\n`,
          )
          return
        }

        for (const s of result.data) {
          process.stdout.write(
            `${s.id.padEnd(28)} ${s.status.padEnd(10)} ${s.source.padEnd(8)} ${s.createdAt}\n`,
          )
        }

        if (result.meta.pagination.nextCursor) {
          process.stdout.write(
            `\n(more — pass \`--cursor ${result.meta.pagination.nextCursor}\` to continue)\n`,
          )
        }
      },
    )

  submission
    .command('get <formSlugOrId> <submissionId>')
    .description(
      'Fetch one submission by ULID. The form arg may be a slug or ULID; the ' +
        'submission arg must be a ULID.',
    )
    .action(async (formSlugOrId: string, submissionId: string) => {
      const ctx = await loadContext(SAWALA_BRAND)
      requireActiveOrg(ctx, SAWALA_BRAND)
      requireActiveProject(ctx, SAWALA_BRAND)
      const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)

      const resolved = await resolveFormId(ctx, projectId, formSlugOrId)
      const row = await apiFetch<SubmissionRow>(
        ctx,
        `/cli/formulir/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(resolved.id)}/submissions/${encodeURIComponent(submissionId)}`,
      )
      process.stdout.write(JSON.stringify(row, null, 2) + '\n')
    })

  formulir.addCommand(submission)

  return formulir
}
