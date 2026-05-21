import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'

export const SCRIPT_MANIFEST_URI_TEMPLATE = 'kodena://scripts/{slug}/manifest'
const MANIFEST_URI_PATTERN = /^kodena:\/\/scripts\/([a-z0-9][a-z0-9-]*)\/manifest$/

/**
 * Try to parse `kodena://scripts/<slug>/manifest` and return the slug.
 * Returns null if the URI does not match the template.
 */
export function parseScriptManifestUri(uri: string): { slug: string } | null {
  const match = MANIFEST_URI_PATTERN.exec(uri)
  if (!match || match[1] === undefined) return null
  return { slug: match[1] }
}

/**
 * Fetch the script row at `/kodena/scripts/:slug` and return the
 * subset that constitutes the asset manifest snapshot. Whatever
 * exact field layout the backend returns is forwarded as-is —
 * the resource is a read-only window.
 */
export async function readScriptManifest(slug: string, ctx: CliContext): Promise<unknown> {
  return apiFetch(ctx, `/kodena/scripts/${encodeURIComponent(slug)}`)
}
