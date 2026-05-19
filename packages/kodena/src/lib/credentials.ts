import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { kodenaConfigDir } from './paths'

export const TOKEN_PATTERN = /^koda_[A-Z2-7]{32}$/

const CredentialsSchema = z.object({
  token: z.string().regex(TOKEN_PATTERN),
  apiBase: z.string().url(),
  savedAt: z.string(),
  scopeOrgId: z.string().nullable(),
  scopeOrgSlug: z.string().nullable(),
})

export type Credentials = z.infer<typeof CredentialsSchema>

export function credentialsPath(): string {
  return join(kodenaConfigDir(), 'credentials')
}

/**
 * Read and validate the credentials file. Returns null if the file does not
 * exist; throws if the file exists but is unreadable or malformed.
 */
export async function readCredentials(): Promise<Credentials | null> {
  const path = credentialsPath()
  let raw: string
  try {
    raw = await fs.readFile(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`credentials file is not valid JSON: ${path}`)
  }
  const result = CredentialsSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(
      `credentials file at ${path} failed validation: ${result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    )
  }
  return result.data
}

/**
 * Write credentials atomically with mode 0600.
 *
 * Sequence: write to a temp file in the same directory, fsync, then rename
 * over the target. Rename within a single directory is atomic on POSIX, so
 * no partial-write state ever appears at the target path. The temp file is
 * created with mode 0600 from the start, so even mid-write the secret is not
 * world-readable.
 */
export async function writeCredentials(creds: Credentials): Promise<void> {
  const path = credentialsPath()
  await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`
  const body = JSON.stringify(creds, null, 2) + '\n'
  const handle = await fs.open(tmp, 'w', 0o600)
  try {
    await handle.writeFile(body)
    await handle.sync()
  } finally {
    await handle.close()
  }
  await fs.rename(tmp, path)
}

/**
 * Delete the credentials file, if present. Idempotent.
 */
export async function deleteCredentials(): Promise<void> {
  const path = credentialsPath()
  try {
    await fs.unlink(path)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
}
