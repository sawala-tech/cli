import { existsSync } from 'node:fs'
import { cp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'

/**
 * Which agent's skills directory to write to.
 *
 * The SKILL.md format is a cross-vendor standard, but the discovery directory
 * is not — and the directories only partially overlap:
 *
 *   Codex          .agents/skills   (and NOTHING else — not .codex, not .claude)
 *   Copilot        .agents/skills | .github/skills | .claude/skills
 *   Claude Code    .claude/skills
 *
 * `agents` is therefore the default: it is the one directory Codex and Copilot
 * both read. `codex` is accepted as a synonym so a user who types what they
 * mean gets what they meant instead of an error.
 */
export type SkillTarget = 'agents' | 'claude' | 'copilot' | 'codex' | 'all'

export const SKILL_TARGETS: readonly SkillTarget[] = [
  'agents',
  'claude',
  'copilot',
  'codex',
  'all',
]

export interface BundledSkill {
  /** Directory name; equals the `name:` in the skill's frontmatter. */
  name: string
  /** Parsed from frontmatter. */
  description: string
  /** Absolute path inside the installed package. */
  dir: string
}

/**
 * Where the bundled skills live at runtime.
 *
 * The published bundle is a single CommonJS file at `dist/cli.js`, so
 * `__dirname` is `<package>/dist` and the skills sit one level up. The env
 * override exists so tests can point at a fixture without touching the real
 * package.
 */
export function bundledSkillsDir(): string {
  const override = process.env['SAWALA_SKILLS_DIR']
  if (override && override.length > 0) return resolve(override)

  // Published: __dirname is <package>/dist, so skills sit one level up.
  // From source (tests, npm link): __dirname is <package>/src/lib, so they sit
  // two levels up. Prefer the published layout and fall back, so the error
  // message names the location a real install would use.
  const published = resolve(__dirname, '..', 'skills')
  if (existsSync(published)) return published
  const fromSource = resolve(__dirname, '..', '..', 'skills')
  if (existsSync(fromSource)) return fromSource
  return published
}

/** Read `name` and `description` out of a SKILL.md frontmatter block. */
function parseFrontmatter(raw: string): { name?: string; description?: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return {}
  const front = m[1] ?? ''
  const name = front.match(/^name:\s*(.+)$/m)?.[1]?.trim()
  // A description may wrap onto continuation lines; stop at the next top-level key.
  const description = front
    .match(/^description:\s*([\s\S]*?)(?=\n[a-z-]+:|$)/m)?.[1]
    ?.trim()
    .replace(/\s+/g, ' ')
  return { ...(name ? { name } : {}), ...(description ? { description } : {}) }
}

export async function listBundledSkills(): Promise<BundledSkill[]> {
  const root = bundledSkillsDir()
  let entries: string[]
  try {
    entries = await readdir(root)
  } catch {
    throw new Error(
      `No bundled skills found at ${root}. This build of @sawala/cli looks incomplete — reinstall the package.`,
    )
  }

  const skills: BundledSkill[] = []
  for (const entry of entries.sort()) {
    const dir = join(root, entry)
    if (!(await stat(dir)).isDirectory()) continue
    let raw: string
    try {
      raw = await readFile(join(dir, 'SKILL.md'), 'utf8')
    } catch {
      continue
    }
    const { name, description } = parseFrontmatter(raw)
    skills.push({ name: name ?? entry, description: description ?? '', dir })
  }
  return skills
}

/**
 * Map targets to the absolute skills directories they write to.
 *
 * This is the single place the vendor table is encoded, so a vendor changing
 * its discovery path is a one-line change with a failing test to prove it.
 */
export function resolveTargetDirs(opts: {
  targets: SkillTarget[]
  global?: boolean
  cwd: string
  home: string
}): string[] {
  const { targets, global: isGlobal, cwd, home } = opts
  const base = isGlobal ? home : cwd

  const dirs = new Set<string>()
  for (const t of targets) {
    switch (t) {
      case 'agents':
        dirs.add(join(base, '.agents', 'skills'))
        break
      case 'codex':
        dirs.add(join(base, '.agents', 'skills'))
        // Sources disagree on where Codex reads *personal* skills: its own docs
        // say ~/.agents/skills, while installs in the wild put them in
        // ~/.codex/skills ($CODEX_HOME/skills). We could not verify which is
        // live. Writing both is cheap and cannot fail silently; picking one and
        // being wrong means --global installs into a directory nothing reads.
        // Project-level is not in doubt — .agents/skills is well attested.
        if (isGlobal) dirs.add(join(home, '.codex', 'skills'))
        break
      case 'claude':
        dirs.add(join(base, '.claude', 'skills'))
        break
      case 'copilot':
        // Copilot reads .github/skills in a repo, but ~/.copilot/skills globally.
        dirs.add(isGlobal ? join(home, '.copilot', 'skills') : join(cwd, '.github', 'skills'))
        break
      case 'all':
        dirs.add(join(base, '.agents', 'skills'))
        dirs.add(join(base, '.claude', 'skills'))
        dirs.add(isGlobal ? join(home, '.copilot', 'skills') : join(cwd, '.github', 'skills'))
        if (isGlobal) dirs.add(join(home, '.codex', 'skills'))
        break
      default: {
        const bad: never = t
        throw new Error(
          `Unknown target '${String(bad)}'. Valid targets: ${SKILL_TARGETS.join(', ')}.`,
        )
      }
    }
  }
  return [...dirs]
}

/** True when `child` is inside `parent` (or is `parent`). */
function isInside(parent: string, child: string): boolean {
  const p = resolve(parent)
  const c = resolve(child)
  return c === p || c.startsWith(p.endsWith(sep) ? p : p + sep)
}

/**
 * Reject a destination outside both the working directory and the home
 * directory. Writing agent instructions into an arbitrary path is not
 * something to do by accident.
 */
export function assertSafeDest(dest: string, cwd: string, home: string): void {
  if (isInside(cwd, dest) || isInside(home, dest)) return
  throw new Error(
    `Refusing to write outside your working directory or home directory: ${resolve(dest)}. ` +
      'Pass --force if you really mean it.',
  )
}

/** Resolve requested names against the bundled set. Never joins input into a path. */
async function selectSkills(names: string[] | undefined): Promise<BundledSkill[]> {
  const all = await listBundledSkills()
  if (!names || names.length === 0) return all

  const byName = new Map(all.map((s) => [s.name, s]))
  const chosen: BundledSkill[] = []
  for (const requested of names) {
    const hit = byName.get(requested)
    if (!hit) {
      throw new Error(
        `Unknown skill '${requested}'. Available: ${all.map((s) => s.name).join(', ')}.`,
      )
    }
    chosen.push(hit)
  }
  return chosen
}

export async function installSkills(opts: {
  names?: string[]
  dests: string[]
  force?: boolean
  dryRun?: boolean
}): Promise<{ written: string[]; skipped: string[] }> {
  const chosen = await selectSkills(opts.names)
  const written: string[] = []
  const skipped: string[] = []

  for (const dest of opts.dests) {
    for (const skill of chosen) {
      const target = join(dest, skill.name)
      const exists = await stat(target).then(
        () => true,
        () => false,
      )
      if (exists && !opts.force) {
        skipped.push(target)
        continue
      }
      if (opts.dryRun) {
        written.push(target)
        continue
      }
      await mkdir(dest, { recursive: true })
      if (exists) await rm(target, { recursive: true, force: true })
      await cp(skill.dir, target, { recursive: true })
      written.push(target)
    }
  }
  return { written, skipped }
}

export async function uninstallSkills(opts: {
  names: string[]
  dests: string[]
}): Promise<{ removed: string[] }> {
  const chosen = await selectSkills(opts.names)
  const removed: string[] = []
  for (const dest of opts.dests) {
    for (const skill of chosen) {
      const target = join(dest, skill.name)
      const exists = await stat(target).then(
        () => true,
        () => false,
      )
      if (!exists) continue
      await rm(target, { recursive: true, force: true })
      removed.push(target)
    }
  }
  return { removed }
}

export const SKILLS_HOME = homedir
