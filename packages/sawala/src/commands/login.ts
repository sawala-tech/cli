import { Command } from 'commander'
import { spawn } from 'node:child_process'
import { platform } from 'node:os'
import prompts from 'prompts'
import {
  SAWALA_BRAND,
  TOKEN_PATTERN,
  resolveApiBase,
  updateConfig,
  writeCredentials,
} from '@sawala/auth'
import type { OrgSummary } from './org'
import type { ProjectRow } from './project'

const TOKENS_PAGE = 'https://sawala.cloud/dashboard/org/settings'

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

export function createLoginCommand(): Command {
  return new Command('login')
    .description('Authenticate the CLI with a Sawala token minted in the dashboard.')
    .option('--no-browser', "Don't try to open the dashboard in the user's browser.")
    .option('--api-base <url>', 'Override the API base URL (default: https://api.sawala.cloud)')
    .action(async (options: { browser?: boolean; apiBase?: string }) => {
      const apiBase = resolveApiBase(SAWALA_BRAND, options.apiBase ?? null)

      process.stdout.write(
        `Open ${TOKENS_PAGE} in your browser, open the 'CLI tokens' tab, mint a token, and paste it here.\n`,
      )

      if (options.browser !== false && process.stdout.isTTY) {
        openInBrowser(TOKENS_PAGE)
      }

      const { token } = await prompts({
        type: 'password',
        name: 'token',
        message: 'Token (koda_…)',
        validate: (v: string) =>
          TOKEN_PATTERN.test(v.trim())
            ? true
            : "Doesn't look right — should be koda_ + 32 letters/digits.",
      })
      if (!token) {
        throw new Error('Login cancelled.')
      }
      const trimmed = String(token).trim()

      // Validate via GET /cli/organization/me. Build the request manually
      // because loadContext() would try to read ~/.sawala/credentials —
      // the file we are about to write.
      const validateRes = await fetch(`${apiBase}/cli/organization/me`, {
        headers: { Authorization: `Bearer ${trimmed}` },
      })
      if (!validateRes.ok) {
        throw new Error(
          `Token rejected by ${apiBase}/cli/organization/me (HTTP ${validateRes.status}). ` +
            'Mint a fresh token at https://sawala.cloud/dashboard/org/settings and retry.',
        )
      }
      const me = (await validateRes.json()) as MeResponse

      const scopeOrgId = me.tokenScope?.scopeOrgId ?? null
      const scopeOrgSlug = me.tokenScope?.scopeOrgSlug ?? null

      await writeCredentials(SAWALA_BRAND, {
        token: trimmed,
        apiBase,
        savedAt: new Date().toISOString(),
        scopeOrgId,
        scopeOrgSlug,
      })
      process.stdout.write(`Logged in as ${me.email ?? me.id}.\n`)

      // Pick the active org.
      const orgsRes = await fetch(`${apiBase}/cli/organization/me/orgs`, {
        headers: { Authorization: `Bearer ${trimmed}` },
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
            Authorization: `Bearer ${trimmed}`,
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
    })
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
