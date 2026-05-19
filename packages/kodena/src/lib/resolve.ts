import { readConfig } from './config'
import { readCredentials, TOKEN_PATTERN } from './credentials'
import { resolveApiBase } from './api-base'

export type TokenSource = 'flag' | 'env' | 'file'

export interface CliOptions {
  token?: string | undefined
  org?: string | undefined
  project?: string | undefined
  apiBase?: string | undefined
}

export interface CliContext {
  token: string
  apiBase: string
  /** Active org slug; null if none has been set. */
  activeOrg: string | null
  /** Active project slug; null if none has been set. */
  activeProject: string | null
  /** Cached from credentials when login wrote them; null if token is all-orgs or came from a non-file source. */
  scopeOrgId: string | null
  scopeOrgSlug: string | null
  tokenSource: TokenSource
}

export class NotLoggedInError extends Error {
  constructor() {
    super('Not logged in. Run `kodena login` or set KODENA_API_TOKEN.')
    this.name = 'NotLoggedInError'
  }
}

export class TokenScopeMismatchError extends Error {
  constructor(public readonly scopeOrgSlug: string, public readonly resolvedOrgSlug: string) {
    super(
      `Token is scoped to '${scopeOrgSlug}'; cannot target '${resolvedOrgSlug}'. ` +
        `Switch tokens (\`kodena logout && kodena login\`) or mint a new token scoped to '${resolvedOrgSlug}'.`,
    )
    this.name = 'TokenScopeMismatchError'
  }
}

/**
 * Resolve the full CLI context from flags + env + config + credentials.
 *
 * Token resolution chain (highest first):
 *   1. --token flag
 *   2. KODENA_API_TOKEN env
 *   3. ~/.kodena/credentials
 *   4. throw NotLoggedInError
 *
 * Active-org resolution chain:
 *   1. --org flag
 *   2. KODENA_ORG env
 *   3. ~/.kodena/config activeOrg
 *   4. null (commands that require an org error out themselves)
 *
 * Active-project resolution chain:
 *   1. --project flag
 *   2. KODENA_PROJECT env
 *   3. ~/.kodena/config activeProject
 *   4. null
 *
 * The kodena.json `project` field is NOT consulted here — that's a deploy-
 * command concern, layered on top by the deploy command itself.
 */
export async function loadContext(options: CliOptions = {}): Promise<CliContext> {
  const credentials = await readCredentials()

  let token: string | undefined
  let tokenSource: TokenSource | undefined
  let credentialApiBase: string | null = null
  let scopeOrgId: string | null = null
  let scopeOrgSlug: string | null = null

  if (options.token) {
    token = options.token
    tokenSource = 'flag'
  } else if (process.env['KODENA_API_TOKEN']) {
    token = process.env['KODENA_API_TOKEN']
    tokenSource = 'env'
  } else if (credentials) {
    token = credentials.token
    tokenSource = 'file'
    credentialApiBase = credentials.apiBase
    scopeOrgId = credentials.scopeOrgId
    scopeOrgSlug = credentials.scopeOrgSlug
  }

  if (!token || !tokenSource) throw new NotLoggedInError()

  if (!TOKEN_PATTERN.test(token)) {
    throw new Error(
      "That doesn't look like a Sawala CLI token — they start with 'koda_' followed by 32 letters/digits.",
    )
  }

  const apiBase = resolveApiBase(options.apiBase ?? credentialApiBase ?? null)

  const config = await readConfig()
  const activeOrg = options.org ?? process.env['KODENA_ORG'] ?? config.activeOrg ?? null
  const activeProject =
    options.project ?? process.env['KODENA_PROJECT'] ?? config.activeProject ?? null

  return {
    token,
    apiBase,
    activeOrg,
    activeProject,
    scopeOrgId,
    scopeOrgSlug,
    tokenSource,
  }
}

/**
 * If the token (from credentials cache) is scoped to a specific org and the
 * resolved active org doesn't match, throw TokenScopeMismatchError so the
 * caller can exit before any network round-trip.
 *
 * Safe to call with `activeOrg = null` — passes through with no error.
 * Safe to call when scopeOrgSlug is null (all-orgs token) — passes through.
 */
export function assertTokenScope(ctx: CliContext, targetOrgSlug?: string | null): void {
  const target = targetOrgSlug ?? ctx.activeOrg
  if (!ctx.scopeOrgSlug || !target) return
  if (ctx.scopeOrgSlug !== target) {
    throw new TokenScopeMismatchError(ctx.scopeOrgSlug, target)
  }
}

/**
 * Require an active org slug. Throws if none is set.
 */
export function requireActiveOrg(ctx: CliContext): string {
  if (!ctx.activeOrg) {
    throw new Error('No active org. Run `kodena org use <slug>` or pass `--org`.')
  }
  return ctx.activeOrg
}

/**
 * Require an active project slug. Throws if none is set.
 */
export function requireActiveProject(ctx: CliContext): string {
  if (!ctx.activeProject) {
    throw new Error('No active project. Run `kodena project use <slug>` or pass `--project`.')
  }
  return ctx.activeProject
}
