import { promises as fs } from 'node:fs'
import { Command } from 'commander'
import mimeTypes from 'mime-types'
import { apiFetch } from '../lib/api'
import { loadContext, requireActiveOrg, requireActiveProject } from '../lib/resolve'
import {
  addContextOptions,
  contextOptions,
  type ContextOptions,
} from '../lib/command-options'

const PATCH_FILE_MAX_BYTES = 10 * 1024 * 1024 // 10 MiB, matches the backend cap
const PATCH_AGGREGATE_MAX_BYTES = 25 * 1024 * 1024 // 25 MiB aggregate cap

// One file in a script's deployed asset bundle, as the backend's
// /assets/patch endpoint expects it (content is base64).
interface AssetFile {
  path: string
  content: string
  size: number
  mime?: string
}

// Loose manifest-entry shape — the stored manifest is rendered defensively
// since older deploys may omit some fields.
interface ManifestEntry {
  path: string
  mime?: string
  size?: number
}

interface ScriptDetailForAssets {
  kind: string
  assets_manifest_parsed?: ManifestEntry[]
}

type JsonOption = ContextOptions & { json?: boolean }
type GetOption = ContextOptions & { out?: string }
type PatchOption = ContextOptions & { file?: string[] }

export function createAssetCommand(): Command {
  const asset = new Command('asset').description("Inspect and patch a script's deployed asset bundle.")

  addContextOptions(
    asset
      .command('list')
      .argument('<slug>', 'The script slug whose asset bundle to list.')
      .description('List the files in the deployed asset bundle.')
      .option('--json', 'Print the raw manifest array.'),
  ).action(async (slug: string, opts: JsonOption) => {
    const ctx = await loadContext(contextOptions(opts))
    requireActiveOrg(ctx)
    requireActiveProject(ctx)
    const row = await apiFetch<ScriptDetailForAssets>(
      ctx,
      `/kodena/scripts/${encodeURIComponent(slug)}`,
    )
    const manifest = row.assets_manifest_parsed ?? []

    if (opts.json) {
      process.stdout.write(JSON.stringify(manifest, null, 2) + '\n')
      return
    }
    if (manifest.length === 0) {
      process.stdout.write(`No assets in '${slug}' (kind: ${row.kind}).\n`)
      return
    }
    for (const e of manifest) {
      const mime = e.mime ?? '—'
      const size = e.size != null ? `${e.size} B` : '—'
      process.stdout.write(`  ${e.path}  —  ${mime}  —  ${size}\n`)
    }
  })

  addContextOptions(
    asset
      .command('get')
      .argument('<slug>', 'The script slug.')
      .argument('<path>', 'The asset path inside the bundle, e.g. /index.html.')
      .description('Fetch one asset file. Writes to stdout, or to --out for binary.')
      .option('--out <file>', 'Write the bytes to this file instead of stdout.'),
  ).action(async (slug: string, path: string, opts: GetOption) => {
    const ctx = await loadContext(contextOptions(opts))
    requireActiveOrg(ctx)
    requireActiveProject(ctx)

    const normalized = path.startsWith('/') ? path : '/' + path
    // The proxy streams raw bytes (not JSON), so call fetch directly with the
    // same auth/scoping headers apiFetch would attach.
    const url =
      `${ctx.apiBase}/kodena/scripts/${encodeURIComponent(slug)}/assets/proxy` +
      `?path=${encodeURIComponent(normalized)}`
    const headers: Record<string, string> = { Authorization: `Bearer ${ctx.token}` }
    if (ctx.activeOrg) headers['x-org-id'] = ctx.activeOrg
    if (ctx.activeProject) headers['x-project-id'] = ctx.activeProject

    const res = await fetch(url, { headers })
    if (!res.ok) {
      let detail = `HTTP ${res.status}`
      try {
        const body = (await res.json()) as { error?: string }
        if (body.error) detail = body.error
      } catch {
        /* non-JSON error body */
      }
      throw new Error(`Could not fetch ${normalized} from ${slug}: ${detail}`)
    }

    const buf = Buffer.from(await res.arrayBuffer())
    if (opts.out) {
      await fs.writeFile(opts.out, buf)
      process.stdout.write(`Wrote ${buf.byteLength} bytes to ${opts.out}.\n`)
      return
    }

    // Guard against dumping binary into a terminal. Allow it when piped (so
    // `kodena asset get … > file` works) or when the content is clearly text.
    const contentType = res.headers.get('content-type') ?? ''
    const isText = /^text\/|application\/(json|xml|javascript)|\+xml|svg/.test(contentType)
    if (process.stdout.isTTY && !isText) {
      throw new Error(
        `${normalized} is ${contentType || 'binary'}; refusing to print to a terminal. ` +
          `Re-run with --out <file>.`,
      )
    }
    process.stdout.write(buf)
  })

  addContextOptions(
    asset
      .command('patch')
      .argument('[slug]', 'The script slug.')
      .argument('[path]', 'Asset path inside the bundle (must start with /).')
      .argument('[localPath]', 'Local file to upload at that path.')
      .description('Replace one or more files in the bundle without redeploying.')
      .option(
        '--file <path=localPath>',
        'Additional file to patch (repeatable).',
        (val: string, prev: string[] = []) => [...prev, val],
      ),
  ).action(async (slug: string | undefined, path: string | undefined, localPath: string | undefined, opts: PatchOption) => {
    if (!slug) throw new Error('Usage: kodena asset patch <slug> <path> <localPath> [--file path=localPath ...]')
    const ctx = await loadContext(contextOptions(opts))
    requireActiveOrg(ctx)
    requireActiveProject(ctx)

    // Collect the positional file plus any --file path=localPath pairs.
    const pairs: Array<{ path: string; localPath: string }> = []
    if (path && localPath) pairs.push({ path, localPath })
    for (const f of opts.file ?? []) {
      const eq = f.indexOf('=')
      if (eq < 1) throw new Error(`--file expects path=localPath, got '${f}'.`)
      pairs.push({ path: f.slice(0, eq), localPath: f.slice(eq + 1) })
    }
    if (pairs.length === 0) {
      throw new Error('No files to patch. Pass <path> <localPath> or one or more --file path=localPath.')
    }

    const assets: AssetFile[] = []
    let total = 0
    for (const p of pairs) {
      if (!p.path.startsWith('/')) throw new Error(`Asset path must start with "/": got '${p.path}'.`)
      let buf: Buffer
      try {
        buf = await fs.readFile(p.localPath)
      } catch (err) {
        throw new Error(`Cannot read ${p.localPath}: ${(err as Error).message}`)
      }
      if (buf.byteLength > PATCH_FILE_MAX_BYTES) {
        throw new Error(`${p.localPath} is ${buf.byteLength} bytes; per-file cap is 10 MiB.`)
      }
      total += buf.byteLength
      if (total > PATCH_AGGREGATE_MAX_BYTES) {
        throw new Error('Patch aggregate exceeds 25 MiB.')
      }
      const mime = mimeTypes.lookup(p.localPath)
      const file: AssetFile = { path: p.path, content: buf.toString('base64'), size: buf.byteLength }
      if (mime) file.mime = mime
      assets.push(file)
    }

    await apiFetch(ctx, `/kodena/scripts/${encodeURIComponent(slug)}/assets/patch`, {
      method: 'POST',
      body: { assets },
    })
    process.stdout.write(`Patched ${assets.length} file(s) into ${slug}: ${assets.map((a) => a.path).join(', ')}.\n`)
  })

  addContextOptions(
    asset
      .command('rebuild')
      .argument('<slug>', 'The script slug whose manifest to rebuild.')
      .description('Rebuild the asset manifest from the stored objects.'),
  ).action(async (slug: string, opts: ContextOptions) => {
    const ctx = await loadContext(contextOptions(opts))
    requireActiveOrg(ctx)
    requireActiveProject(ctx)
    await apiFetch(ctx, `/kodena/scripts/${encodeURIComponent(slug)}/assets/rebuild-manifest`, {
      method: 'POST',
    })
    process.stdout.write(`Rebuilt asset manifest for ${slug}.\n`)
  })

  return asset
}
