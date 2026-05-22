import type { CliContext } from './resolve'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    public readonly url: string,
  ) {
    const detail =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${status}`
    super(`${detail} (${url})`)
    this.name = 'ApiError'
  }
}

export interface ApiCallOptions {
  /** HTTP method; defaults to GET. */
  method?: string
  /** JSON body to serialise; sets `content-type: application/json` automatically. */
  body?: unknown
  /** Additional headers to merge in. */
  headers?: Record<string, string>
  /**
   * Override the active-org header for a single call. When unset, the
   * context's `activeOrg` is sent as `x-org-id` (if set).
   * Pass `null` to suppress the header entirely.
   */
  orgOverride?: string | null
  /** Same as orgOverride for `x-project-id`. */
  projectOverride?: string | null
}

/**
 * Make an authenticated request against the Sawala API.
 *
 * - URL is `<ctx.apiBase><path>` (path must start with `/`).
 * - Authorization header is set from `ctx.token`.
 * - `x-org-id` and `x-project-id` are set from context unless overridden.
 * - 2xx responses parse as JSON (or return null for 204).
 * - non-2xx responses throw ApiError with the parsed body.
 */
export async function apiFetch<T = unknown>(
  ctx: CliContext,
  path: string,
  options: ApiCallOptions = {},
): Promise<T> {
  if (!path.startsWith('/')) {
    throw new Error(`apiFetch path must start with '/': got '${path}'`)
  }
  const url = `${ctx.apiBase}${path}`

  const headers: Record<string, string> = {
    Authorization: `Bearer ${ctx.token}`,
    ...(options.headers ?? {}),
  }

  const orgHeader = options.orgOverride === null ? null : options.orgOverride ?? ctx.activeOrg
  if (orgHeader) headers['x-org-id'] = orgHeader

  const projectHeader =
    options.projectOverride === null
      ? null
      : options.projectOverride ?? ctx.activeProject
  if (projectHeader) headers['x-project-id'] = projectHeader

  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers,
  }
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json'
    init.body = JSON.stringify(options.body)
  }

  const res = await fetch(url, init)

  if (res.status === 204) return null as T

  const text = await res.text()
  let parsed: unknown = null
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, parsed, url)
  }
  return parsed as T
}
