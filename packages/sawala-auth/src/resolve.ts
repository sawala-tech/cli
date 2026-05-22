import type { Brand } from './brand'
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
  /**
   * Active project's stable ULID, persisted by `<brand> project use <slug>`.
   * Required by services (e.g. Kontena) whose URL path takes the project id
   * rather than the slug. Null for older configs written before this field
   * existed — call `requireActiveProjectId` to surface a clear recovery hint.
   */
  activeProjectId: string | null
  /** Cached from credentials when login wrote them; null if token is all-orgs or came from a non-file source. */
  scopeOrgId: string | null
  scopeOrgSlug: string | null
  tokenSource: TokenSource
}

export class NotLoggedInError extends Error {
  constructor(brand?: Brand) {
    const name = brand?.name ?? 'kodena'
    const envVar = brand?.apiTokenEnvVar ?? 'KODENA_API_TOKEN'
    super(`Not logged in. Run \`${name} login\` or set ${envVar}.`)
    this.name = 'NotLoggedInError'
  }
}

export class TokenScopeMismatchError extends Error {
  constructor(
    public readonly scopeOrgSlug: string,
    public readonly resolvedOrgSlug: string,
    brand?: Brand,
  ) {
    const name = brand?.name ?? 'kodena'
    super(
      `Token is scoped to '${scopeOrgSlug}'; cannot target '${resolvedOrgSlug}'. ` +
        `Switch tokens (\`${name} logout && ${name} login\`) or mint a new token scoped to '${resolvedOrgSlug}'.`,
    )
    this.name = 'TokenScopeMismatchError'
  }
}

/**
 * Resolve the full CLI context from flags + env + config + credentials.
 *
 * Token resolution chain (highest first):
 *   1. --token flag
 *   2. <brand>.apiTokenEnvVar env
 *   3. <brand-config-dir>/credentials
 *   4. throw NotLoggedInError
 *
 * Active-org resolution chain:
 *   1. --org flag
 *   2. <brand>.orgEnvVar env
 *   3. <brand-config-dir>/config activeOrg
 *   4. null (commands that require an org error out themselves)
 *
 * Active-project resolution chain is symmetric.
 *
 * The kodena.json `project` field is NOT consulted here — that's a deploy-
 * command concern, layered on top by the deploy command itself.
 */
export async function loadContext(
  brand: Brand,
  options: CliOptions = {},
): Promise<CliContext> {
  const credentials = await readCredentials(brand)

  let token: string | undefined
  let tokenSource: TokenSource | undefined
  let credentialApiBase: string | null = null
  let scopeOrgId: string | null = null
  let scopeOrgSlug: string | null = null

  if (options.token) {
    token = options.token
    tokenSource = 'flag'
  } else if (process.env[brand.apiTokenEnvVar]) {
    token = process.env[brand.apiTokenEnvVar]
    tokenSource = 'env'
  } else if (credentials) {
    token = credentials.token
    tokenSource = 'file'
    credentialApiBase = credentials.apiBase
    scopeOrgId = credentials.scopeOrgId
    scopeOrgSlug = credentials.scopeOrgSlug
  }

  if (!token || !tokenSource) throw new NotLoggedInError(brand)

  if (!TOKEN_PATTERN.test(token)) {
    throw new Error(
      "That doesn't look like a Sawala CLI token — they start with 'koda_' followed by 32 letters/digits.",
    )
  }

  const apiBase = resolveApiBase(brand, options.apiBase ?? credentialApiBase ?? null)

  const config = await readConfig(brand)
  const activeOrg = options.org ?? process.env[brand.orgEnvVar] ?? config.activeOrg ?? null
  const activeProject =
    options.project ?? process.env[brand.projectEnvVar] ?? config.activeProject ?? null
  // No env-var equivalent: the project id is always derived from the slug at
  // `project use` time and persisted into the config alongside it.
  const activeProjectId = config.activeProjectId ?? null

  return {
    token,
    apiBase,
    activeOrg,
    activeProject,
    activeProjectId,
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
export function assertTokenScope(
  ctx: CliContext,
  targetOrgSlug?: string | null,
  brand?: Brand,
): void {
  const target = targetOrgSlug ?? ctx.activeOrg
  if (!ctx.scopeOrgSlug || !target) return
  if (ctx.scopeOrgSlug !== target) {
    throw new TokenScopeMismatchError(ctx.scopeOrgSlug, target, brand)
  }
}

/**
 * Require an active org slug. Throws if none is set.
 */
export function requireActiveOrg(ctx: CliContext, brand: Brand): string {
  if (!ctx.activeOrg) {
    throw new Error(`No active org. Run \`${brand.name} org use <slug>\` or pass \`--org\`.`)
  }
  return ctx.activeOrg
}

/**
 * Require an active project slug. Throws if none is set.
 */
export function requireActiveProject(ctx: CliContext, brand: Brand): string {
  if (!ctx.activeProject) {
    throw new Error(
      `No active project. Run \`${brand.name} project use <slug>\` or pass \`--project\`.`,
    )
  }
  return ctx.activeProject
}

/**
 * Require the active project's ULID. Throws if none is set.
 *
 * Older configs (and current kodena configs) only persist the slug, so the
 * recovery path is to re-run `project use` — which now refreshes both fields.
 */
export function requireActiveProjectId(ctx: CliContext, brand: Brand): string {
  if (!ctx.activeProjectId) {
    throw new Error(
      `No active project id. Re-run \`${brand.name} project use <slug>\` to refresh.`,
    )
  }
  return ctx.activeProjectId
}
