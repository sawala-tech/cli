/**
 * Kodena starter templates — discovery + local scaffolding.
 *
 * Templates live in the public `sawala-tech/kodena-templates` repo, one
 * directory per template. This module reads a `templates.json` index from
 * that repo (the source of truth for *what templates exist*) and downloads a
 * single template's subtree from a GitHub tarball for `kodena init`.
 *
 * Both fetches hit public GitHub endpoints and need no authentication.
 */
import { createWriteStream, promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { createGunzip } from 'node:zlib'
import { extract } from 'tar-stream'
import { z } from 'zod'
import { KodenaConfigSchema, type KodenaConfig } from './config-file'

export const TEMPLATES_REPO = 'sawala-tech/kodena-templates'
const RAW = 'https://raw.githubusercontent.com'
const CODELOAD = 'https://codeload.github.com'

const TemplateIndexEntry = z.object({
  slug: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().default(''),
  path: z.string().min(1),
  buildKind: z.enum(['static', 'opennext']),
  default: z.boolean().optional(), // exactly one entry may mark itself as the picker default
})

const TemplatesIndex = z.object({
  ref: z.string().min(1).default('main'),
  templates: z.array(TemplateIndexEntry).min(1),
})

export type TemplateIndexEntry = z.infer<typeof TemplateIndexEntry>
export type TemplatesIndex = z.infer<typeof TemplatesIndex>

/**
 * Fetch and validate the template index (`templates.json`) from the public
 * kodena-templates repo. Throws with an actionable message on a network
 * failure, a non-2xx response, or a malformed index.
 */
export async function fetchTemplatesIndex(
  opts: { ref?: string; fetchImpl?: typeof fetch } = {},
): Promise<TemplatesIndex> {
  const ref = opts.ref ?? 'main'
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch
  const url = `${RAW}/${TEMPLATES_REPO}/${ref}/templates.json`

  let res: Response
  try {
    res = await fetchImpl(url)
  } catch (err) {
    throw new Error(`Could not reach the template index at ${url}: ${(err as Error).message}`)
  }
  if (!res.ok) {
    throw new Error(`Template index fetch failed (${res.status} ${res.statusText}) at ${url}`)
  }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new Error(`Template index at ${url} is not valid JSON`)
  }
  const parsed = TemplatesIndex.safeParse(body)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Template index at ${url} is malformed: ${issues}`)
  }
  return parsed.data
}

/** Find a template by its user-facing slug, or undefined when absent. */
export function findTemplate(index: TemplatesIndex, slug: string): TemplateIndexEntry | undefined {
  return index.templates.find((t) => t.slug === slug)
}

/**
 * Download the kodena-templates tarball for `ref` and write every file under
 * `<templatePath>/` into `destDir`, preserving the in-template layout.
 *
 * GitHub tarball entries are prefixed with a top-level `kodena-templates-<ref>/`
 * directory; we drop that first segment, then keep only entries inside
 * `templatePath`. Returns the number of files written. Throws when the subtree
 * is empty (a wrong slug/path for this ref).
 */
export async function extractTemplateSubtree(args: {
  templatePath: string
  destDir: string
  ref?: string
  fetchImpl?: typeof fetch
}): Promise<number> {
  const ref = args.ref ?? 'main'
  const fetchImpl = args.fetchImpl ?? globalThis.fetch
  const url = `${CODELOAD}/${TEMPLATES_REPO}/tar.gz/${ref}`

  let res: Response
  try {
    res = await fetchImpl(url)
  } catch (err) {
    throw new Error(`Could not reach the template download at ${url}: ${(err as Error).message}`)
  }
  if (!res.ok || !res.body) {
    throw new Error(`Template download failed (${res.status} ${res.statusText}) at ${url}`)
  }

  const wanted = `${args.templatePath}/`
  let written = 0
  const parser = extract()

  const pump = new Promise<void>((resolve, reject) => {
    parser.on('entry', (header, stream, next) => {
      // Drop the leading 'kodena-templates-<ref>/' segment GitHub adds.
      const rel = header.name.split('/').slice(1).join('/')
      if (header.type !== 'file' || !rel.startsWith(wanted)) {
        stream.on('end', next)
        stream.resume()
        return
      }
      const outPath = join(args.destDir, rel.slice(wanted.length))
      fs.mkdir(dirname(outPath), { recursive: true })
        .then(() => {
          const out = createWriteStream(outPath)
          out.on('error', reject)
          out.on('finish', () => {
            written++
            next()
          })
          stream.pipe(out)
        })
        .catch(reject)
    })
    parser.on('finish', resolve)
    parser.on('error', reject)
  })

  // res.body is a web ReadableStream; adapt it to a Node stream for piping.
  Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0])
    .pipe(createGunzip())
    .pipe(parser)
  await pump

  if (written === 0) {
    throw new Error(
      `Template path '${args.templatePath}' has no files at ref '${ref}'. ` +
        'Check the slug with `kodena template list`.',
    )
  }
  return written
}

/**
 * Subset of a template's `sawala-template.json` manifest we need to emit a
 * `kodena.json`. Unknown fields (seedDir, requiredSchemas, …) are ignored —
 * they drive the hosted site-builder, not a local deploy.
 */
const TemplateManifest = z
  .object({
    buildKind: z.enum(['static', 'opennext']),
    buildCommand: z.string().min(1),
    outputDir: z.string().min(1),
    compatibilityDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    compatibilityFlags: z.array(z.enum(['nodejs_compat', 'nodejs_als'])).optional(),
  })
  .passthrough()

/**
 * Read the scaffolded template's `sawala-template.json` from `destDir` and
 * derive a `kodena.json` so the next `kodena deploy` works with no edits.
 * Validates the result against the real `KodenaConfigSchema` so a bad manifest
 * fails loudly at scaffold time.
 */
export async function generateKodenaConfig(destDir: string, slug: string): Promise<KodenaConfig> {
  const manifestPath = join(destDir, 'sawala-template.json')
  let raw: unknown
  try {
    raw = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  } catch (err) {
    throw new Error(`Cannot read template manifest at ${manifestPath}: ${(err as Error).message}`)
  }
  const m = TemplateManifest.parse(raw)

  const cfg: KodenaConfig = {
    slug,
    build: {
      command: m.buildCommand,
      outputDir: m.outputDir,
      runByDefault: true,
      ...(m.buildKind === 'static' ? { static: true } : {}),
    },
    ...(m.compatibilityDate ? { compatibilityDate: m.compatibilityDate } : {}),
    ...(m.compatibilityFlags ? { compatibilityFlags: m.compatibilityFlags } : {}),
  }
  return KodenaConfigSchema.parse(cfg)
}
