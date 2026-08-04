import { ApiError, apiFetch } from './api-client'
import type { CliContext } from './auth'

interface SchemaRow {
  id: string
  slug: string
  type: string
}

interface SchemaListResponse {
  data: SchemaRow[]
}

interface SchemaTypeResponse {
  type: string
  [k: string]: unknown
}

/**
 * Resolve a schema's `single`/`collection` type so an entry tool can pick the
 * right content sub-path.
 *
 * The schema-get route resolves ULIDs only, but the content routes this feeds
 * resolve the schema by SLUG — so the identifier that makes the write succeed
 * is exactly the one that 404s on the lookup. Every entry tool therefore needs
 * the same 404 → list → match-by-slug fallback that `sawala_kontena_get_schema`
 * already has. The list rows carry `type`, so the fallback costs one request,
 * not two.
 */
export async function resolveSchemaType(
  ctx: CliContext,
  projectId: string,
  schemaSlug: string,
): Promise<'single' | 'collection'> {
  const base = `/cli/kontena/projects/${encodeURIComponent(projectId)}/schemas`

  try {
    const schema = await apiFetch<SchemaTypeResponse>(
      ctx,
      `${base}/${encodeURIComponent(schemaSlug)}`,
    )
    return normalize(schema.type)
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) throw err
  }

  const listResult = await apiFetch<SchemaListResponse>(ctx, `${base}?limit=100`)
  const match = listResult.data.find((s) => s.slug === schemaSlug)
  if (!match) {
    const available = listResult.data.map((s) => s.slug).join(', ') || '(none)'
    throw new Error(`Schema '${schemaSlug}' not found. Available slugs: ${available}.`)
  }
  return normalize(match.type)
}

// Anything that is not explicitly 'single' routes as a collection, matching the
// pre-existing `schemaInfo.type === 'single' ? … : …` behaviour of every caller.
function normalize(t: string): 'single' | 'collection' {
  return t === 'single' ? 'single' : 'collection'
}
