import { promises as fs } from 'node:fs'
import { join, posix, relative, sep } from 'node:path'
import mimeTypes from 'mime-types'

const WORKER_MODULE_MAX_BYTES = 10 * 1024 * 1024
const ASSETS_AGGREGATE_MAX_BYTES = 100 * 1024 * 1024
const VAR_VALUE_MAX_BYTES = 8 * 1024
const VAR_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/

export interface AssetFile {
  /** Path inside the assets bundle, starting with `/`. */
  path: string
  /** Standard base64-encoded file contents. */
  content: string
  /** Decoded byte length. */
  size: number
  /** MIME type inferred from extension; omitted when unknown. */
  mime?: string
}

export interface WorkerBundle {
  kind: 'worker-bundle'
  scriptContent: string
  assets: AssetFile[]
  vars?: Record<string, string>
  compatibilityFlags?: Array<'nodejs_compat' | 'nodejs_als'>
  compatibilityDate?: string
}

export interface BundleStats {
  workerBytes: number
  assetCount: number
  assetsTotalBytes: number
}

/**
 * Read the worker entry as base64. Throws if the file is missing or exceeds
 * the 10 MiB cap.
 */
export async function readWorkerEntry(path: string): Promise<{ content: string; size: number }> {
  let buf: Buffer
  try {
    buf = await fs.readFile(path)
  } catch (err) {
    throw new Error(`Cannot read worker entry at ${path}: ${(err as Error).message}`)
  }
  if (buf.byteLength > WORKER_MODULE_MAX_BYTES) {
    throw new Error(
      `Worker module is ${buf.byteLength} bytes; max ${WORKER_MODULE_MAX_BYTES} (10 MiB).`,
    )
  }
  return { content: buf.toString('base64'), size: buf.byteLength }
}

/**
 * Walk `assetsDir` recursively. Each file becomes an AssetFile whose `path`
 * is the file's POSIX-style relative path under `assetsDir`, prefixed with
 * `/`. The aggregate (decoded) byte count must not exceed 100 MiB.
 */
export async function walkAssets(assetsDir: string): Promise<AssetFile[]> {
  let entries: string[]
  try {
    entries = await fs.readdir(assetsDir, { recursive: true })
  } catch (err) {
    throw new Error(`Cannot read assets dir at ${assetsDir}: ${(err as Error).message}`)
  }

  const assets: AssetFile[] = []
  let totalBytes = 0

  for (const entry of entries) {
    const abs = join(assetsDir, entry)
    const stat = await fs.stat(abs)
    if (!stat.isFile()) continue

    const buf = await fs.readFile(abs)
    totalBytes += buf.byteLength
    if (totalBytes > ASSETS_AGGREGATE_MAX_BYTES) {
      throw new Error(
        `Assets aggregate exceeds ${ASSETS_AGGREGATE_MAX_BYTES} bytes (100 MiB).`,
      )
    }

    // Normalise the path to POSIX-style, leading slash, no leading dot.
    const rel = relative(assetsDir, abs).split(sep).join(posix.sep)
    const path = '/' + rel

    const mime = mimeTypes.lookup(entry)
    const asset: AssetFile = {
      path,
      content: buf.toString('base64'),
      size: buf.byteLength,
    }
    if (mime) asset.mime = mime
    assets.push(asset)
  }

  if (assets.length === 0) {
    throw new Error(`No assets found under ${assetsDir} — worker-bundle deploys require at least one asset.`)
  }

  return assets
}

/**
 * Validate `vars` against the backend's regex/size constraints. Throws on
 * the first failure so the CLI can surface a sharp message before sending
 * the deploy request.
 */
export function validateVars(vars: Record<string, string> | undefined): void {
  if (!vars) return
  for (const [k, v] of Object.entries(vars)) {
    if (!VAR_KEY_PATTERN.test(k)) {
      throw new Error(
        `vars key '${k}' must match /^[A-Z][A-Z0-9_]*$/ (uppercase letter, then uppercase letters / digits / underscores).`,
      )
    }
    if (Buffer.byteLength(v, 'utf8') > VAR_VALUE_MAX_BYTES) {
      throw new Error(
        `vars value for '${k}' exceeds ${VAR_VALUE_MAX_BYTES} bytes (8 KiB).`,
      )
    }
  }
}

/** Summarise a bundle for the CLI's progress output. */
export function summarise(bundle: WorkerBundle): BundleStats {
  return {
    workerBytes: base64DecodedLength(bundle.scriptContent),
    assetCount: bundle.assets.length,
    assetsTotalBytes: bundle.assets.reduce((sum, a) => sum + a.size, 0),
  }
}

function base64DecodedLength(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return (b64.length / 4) * 3 - padding
}
