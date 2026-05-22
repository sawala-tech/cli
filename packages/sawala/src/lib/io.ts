import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'

/**
 * Read a JSON payload from a file path, or from stdin when path === '-'.
 * Throws with a clear message on missing files or malformed JSON.
 */
export async function readJsonInput(path: string): Promise<unknown> {
  if (path === '-') {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer))
    }
    const raw = Buffer.concat(chunks).toString('utf8')
    try {
      return JSON.parse(raw)
    } catch (e) {
      throw new Error(`Invalid JSON on stdin: ${(e as Error).message}`)
    }
  }
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (e) {
    throw new Error(`Cannot read ${path}: ${(e as Error).message}`)
  }
  try {
    return JSON.parse(raw)
  } catch (e) {
    throw new Error(`Invalid JSON in ${path}: ${(e as Error).message}`)
  }
}

/**
 * Prompt on stdin for a yes/no answer. Resolves on a "y"/"yes" answer
 * and throws on anything else.
 *
 * Refuses to run when stdin is not a TTY — scripted callers must
 * short-circuit with --yes before invoking this helper.
 */
export async function confirmOrThrow(question: string): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error(
      'Refusing destructive operation without --yes (no TTY for confirmation prompt).',
    )
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  try {
    const answer = (await rl.question(`${question} [y/N]: `)).trim().toLowerCase()
    if (answer !== 'y' && answer !== 'yes') {
      throw new Error('Aborted by user.')
    }
  } finally {
    rl.close()
  }
}

/**
 * Resolve `--data <json>` or `--file <path>` (or `--file -` for stdin) into
 * a parsed payload. Exactly one of the two must be provided.
 */
export async function resolveInputPayload(opts: {
  data?: string
  file?: string
}): Promise<unknown> {
  if (opts.data && opts.file) {
    throw new Error('Pass either --data or --file, not both.')
  }
  if (opts.data) {
    try {
      return JSON.parse(opts.data)
    } catch (e) {
      throw new Error(`Invalid JSON in --data: ${(e as Error).message}`)
    }
  }
  if (opts.file) {
    return readJsonInput(opts.file)
  }
  throw new Error('Provide the request body via --file <path> or --data <json>.')
}
