import { Command } from 'commander'
import { spawn } from 'node:child_process'
import { hostname, platform } from 'node:os'
import prompts from 'prompts'
import {
  SAWALA_BRAND,
  TOKEN_PATTERN,
  browserLogin,
  resolveApiBase,
  updateConfig,
  writeCredentials,
} from '@sawala/auth'
import type { OrgSummary } from './org'
import type { ProjectRow } from './project'

const TOKENS_PAGE = 'https://sawala.cloud/dashboard/org/settings'
const DEFAULT_WEB_BASE = 'https://sawala.cloud'

interface MeResponse {
  id: string
  email: string | null
  displayName: string | null
  orgId: string | null
  orgSlug: string | null
  tokenScope: {
    tokenId: string
    scopeOrgId: string | null
    scopeOrgSlug: string | null
    label: string
  } | null
}

interface PaginatedProjects {
  items: ProjectRow[]
  nextCursor: string | null
}

interface ValidatedLogin {
  token: string
  me: MeResponse
  scopeOrgId: string | null
  scopeOrgSlug: string | null
}

export function createLoginCommand(): Command {
  return new Command('login')
    .description('Authenticate the CLI with Sawala. Opens a browser by default — no token to copy or paste.')
    .option('--no-browser', "Don't open a browser; paste a token minted in the dashboard instead.")
    .option('--token <koda_…>', 'Authenticate with this token non-interactively (no browser, no prompt).')
    .option('--web-base <url>', `Override the dashboard base URL (default: ${DEFAULT_WEB_BASE})`)
    .option('--api-base <url>', 'Override the API base URL (default: https://api.sawala.cloud)')
    .action(
      async (options: {
        browser?: boolean
        token?: string
        webBase?: string
        apiBase?: string
      }) => {
        const apiBase = resolveApiBase(SAWALA_BRAND, options.apiBase ?? null)
        const webBase = (options.webBase ?? DEFAULT_WEB_BASE).replace(/\/$/, '')

        let result: ValidatedLogin

        if (options.token) {
          // Non-interactive: a token was supplied directly.
          result = await validateToken(apiBase, String(options.token).trim())
        } else if (options.browser === false) {
          // Explicit manual paste (headless / restricted environments).
          result = await manualPaste(apiBase)
        } else {
          // Default: browser flow, with automatic fallback to manual paste if a
          // browser or loopback port isn't available.
          try {
            const browser = await browserLogin({
              apiBase,
              webBase,
              brand: 'sawala',
              label: `sawala CLI · ${hostname()}`,
              onUrl: (url) =>
                process.stdout.write(
                  `Opening your browser to authorize…\nIf it didn't open, visit:\n  ${url}\n`,
                ),
            })
            // Re-validate against /me so the printed identity and scope come from
            // the server, consistent with the paste path.
            result = await validateToken(apiBase, browser.token)
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            process.stdout.write(
              `Browser login unavailable (${message}). Falling back to manual paste.\n`,
            )
            result = await manualPaste(apiBase)
          }
        }

        await finishLogin(apiBase, result)
      },
    )
}

// Validate a token against GET /cli/organization/me and read its server-side
// scope. Throws with a clear message if the token is rejected. The request is
// built manually because loadContext() would try to read the credentials file
// we are about to write.
async function validateToken(apiBase: string, token: string): Promise<ValidatedLogin> {
  const res = await fetch(`${apiBase}/cli/organization/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(
      `Token rejected by ${apiBase}/cli/organization/me (HTTP ${res.status}). ` +
        `Mint a fresh token at ${TOKENS_PAGE} and retry.`,
    )
  }
  const me = (await res.json()) as MeResponse
  return {
    token,
    me,
    scopeOrgId: me.tokenScope?.scopeOrgId ?? null,
    scopeOrgSlug: me.tokenScope?.scopeOrgSlug ?? null,
  }
}

// Legacy manual flow: open the tokens page, prompt for a pasted token, validate.
async function manualPaste(apiBase: string): Promise<ValidatedLogin> {
  process.stdout.write(
    `Open ${TOKENS_PAGE} in your browser, open the 'CLI tokens' tab, mint a token, and paste it here.\n`,
  )
  if (process.stdout.isTTY) openInBrowser(TOKENS_PAGE)

  const { token } = await prompts({
    type: 'password',
    name: 'token',
    message: 'Token (koda_…)',
    validate: (v: string) =>
      TOKEN_PATTERN.test(v.trim())
        ? true
        : "Doesn't look right — should be koda_ + 32 letters/digits.",
  })
  if (!token) throw new Error('Login cancelled.')

  return validateToken(apiBase, String(token).trim())
}

// Persist credentials, then interactively pick the active org and project.
async function finishLogin(apiBase: string, result: ValidatedLogin): Promise<void> {
  const { token, me, scopeOrgId, scopeOrgSlug } = result

  await writeCredentials(SAWALA_BRAND, {
    token,
    apiBase,
    savedAt: new Date().toISOString(),
    scopeOrgId,
    scopeOrgSlug,
  })
  process.stdout.write(`Logged in as ${me.email ?? me.id}.\n`)

  // Pick the active org.
  const orgsRes = await fetch(`${apiBase}/cli/organization/me/orgs`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const orgs = orgsRes.ok ? ((await orgsRes.json()) as OrgSummary[]) : []
  const allowedOrgs = scopeOrgSlug ? orgs.filter((o) => o.slug === scopeOrgSlug) : orgs

  let activeOrg: string | null = null
  if (allowedOrgs.length === 1) {
    activeOrg = allowedOrgs[0]!.slug
    process.stdout.write(`Active org: ${activeOrg}\n`)
  } else if (allowedOrgs.length > 1) {
    const { picked } = await prompts({
      type: 'select',
      name: 'picked',
      message: 'Pick an active organisation',
      choices: allowedOrgs.map((o) => ({ title: `${o.slug} — ${o.name}`, value: o.slug })),
      initial: 0,
    })
    if (picked) {
      activeOrg = String(picked)
      process.stdout.write(`Active org: ${activeOrg}\n`)
    }
  } else if (scopeOrgSlug) {
    activeOrg = scopeOrgSlug
    process.stdout.write(`Active org: ${activeOrg} (from token scope)\n`)
  } else {
    process.stdout.write(
      "No organisations found. Set one later with `sawala org use <slug>` once your access is granted.\n",
    )
  }

  // Pick the active project (only if we have an active org).
  let activeProject: string | null = null
  let activeProjectId: string | null = null
  if (activeOrg) {
    const projRes = await fetch(`${apiBase}/cli/organization/projects?limit=100`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-org-id': activeOrg,
      },
    })
    if (projRes.ok) {
      const { items } = (await projRes.json()) as PaginatedProjects
      if (items.length === 1) {
        activeProject = items[0]!.slug
        activeProjectId = items[0]!.id
        process.stdout.write(`Active project: ${activeProject}\n`)
      } else if (items.length > 1) {
        const { picked } = await prompts({
          type: 'select',
          name: 'picked',
          message: 'Pick an active project',
          choices: items.map((p) => ({ title: `${p.slug} — ${p.name}`, value: p.slug })),
          initial: 0,
        })
        if (picked) {
          activeProject = String(picked)
          const match = items.find((p) => p.slug === activeProject)
          activeProjectId = match?.id ?? null
          process.stdout.write(`Active project: ${activeProject}\n`)
        }
      } else {
        process.stdout.write(
          "No projects yet — run `sawala project use <slug>` once you have one.\n",
        )
      }
    }
  }

  await updateConfig(SAWALA_BRAND, { activeOrg, activeProject, activeProjectId })
}

function openInBrowser(url: string): void {
  const opener =
    platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'start' : 'xdg-open'
  try {
    spawn(opener, [url], { detached: true, stdio: 'ignore' }).unref()
  } catch {
    // Non-fatal: the URL is also printed to stdout above.
  }
}
