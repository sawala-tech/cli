import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  assertSafeDest,
  installSkills,
  listBundledSkills,
  resolveTargetDirs,
  uninstallSkills,
} from '../src/lib/skills'

let fixture: string
let sandbox: string

beforeEach(() => {
  // A fake bundled-skills directory, so the tests never touch the real package.
  fixture = mkdtempSync(join(tmpdir(), 'sawala-skills-fixture-'))
  for (const name of ['alpha-skill', 'beta-skill']) {
    mkdirSync(join(fixture, name), { recursive: true })
    writeFileSync(
      join(fixture, name, 'SKILL.md'),
      `---\nname: ${name}\ndescription: Fixture skill ${name}.\n---\n\nBody.\n`,
    )
  }
  process.env['SAWALA_SKILLS_DIR'] = fixture
  sandbox = mkdtempSync(join(tmpdir(), 'sawala-skills-sandbox-'))
})

afterEach(() => {
  delete process.env['SAWALA_SKILLS_DIR']
})

describe('listBundledSkills', () => {
  it('reads name and description from frontmatter', async () => {
    const all = await listBundledSkills()
    expect(all.map((s) => s.name)).toEqual(['alpha-skill', 'beta-skill'])
    expect(all[0]?.description).toBe('Fixture skill alpha-skill.')
  })
})

describe('resolveTargetDirs', () => {
  const cwd = '/repo'
  const home = '/home/dev'

  it('maps agents and codex to the same .agents/skills', () => {
    expect(resolveTargetDirs({ targets: ['agents'], cwd, home })).toEqual(['/repo/.agents/skills'])
    expect(resolveTargetDirs({ targets: ['codex'], cwd, home })).toEqual(['/repo/.agents/skills'])
  })

  it('maps claude and copilot to their own project directories', () => {
    expect(resolveTargetDirs({ targets: ['claude'], cwd, home })).toEqual(['/repo/.claude/skills'])
    expect(resolveTargetDirs({ targets: ['copilot'], cwd, home })).toEqual(['/repo/.github/skills'])
  })

  it('uses home-directory locations under --global, with copilot at ~/.copilot', () => {
    expect(resolveTargetDirs({ targets: ['agents'], global: true, cwd, home })).toEqual([
      '/home/dev/.agents/skills',
    ])
    expect(resolveTargetDirs({ targets: ['copilot'], global: true, cwd, home })).toEqual([
      '/home/dev/.copilot/skills',
    ])
  })

  it('expands `all` to three directories and de-duplicates overlapping targets', () => {
    expect(resolveTargetDirs({ targets: ['all'], cwd, home })).toEqual([
      '/repo/.agents/skills',
      '/repo/.claude/skills',
      '/repo/.github/skills',
    ])
    // agents and codex collapse to one entry.
    expect(resolveTargetDirs({ targets: ['agents', 'codex'], cwd, home })).toHaveLength(1)
  })

  it('never returns a path outside cwd or home — for every target', () => {
    for (const t of ['agents', 'claude', 'copilot', 'codex', 'all'] as const) {
      for (const isGlobal of [false, true]) {
        for (const dir of resolveTargetDirs({ targets: [t], global: isGlobal, cwd, home })) {
          expect(dir.startsWith(cwd) || dir.startsWith(home)).toBe(true)
        }
      }
    }
  })
})

describe('installSkills', () => {
  it('installs all bundled skills when no names are given', async () => {
    const dest = join(sandbox, '.agents', 'skills')
    const { written } = await installSkills({ dests: [dest] })
    expect(written).toHaveLength(2)
    expect(existsSync(join(dest, 'alpha-skill', 'SKILL.md'))).toBe(true)
  })

  it('writes nothing under --dry-run', async () => {
    const dest = join(sandbox, '.agents', 'skills')
    const { written } = await installSkills({ dests: [dest], dryRun: true })
    expect(written).toHaveLength(2)
    expect(existsSync(dest)).toBe(false)
  })

  // NEGATIVE TEST 1 — an unknown name is rejected and nothing is written.
  it('rejects a name that is not a bundled skill, and writes nothing', async () => {
    const dest = join(sandbox, '.agents', 'skills')
    await expect(
      installSkills({ names: ['../../../etc/cron.d'], dests: [dest] }),
    ).rejects.toThrow(/Unknown skill/)
    expect(existsSync(dest)).toBe(false)
  })

  // NEGATIVE TEST 2 — an existing folder is never silently clobbered.
  it('refuses to overwrite without --force and leaves the file byte-identical', async () => {
    const dest = join(sandbox, '.agents', 'skills')
    mkdirSync(join(dest, 'alpha-skill'), { recursive: true })
    const mine = join(dest, 'alpha-skill', 'SKILL.md')
    writeFileSync(mine, 'MY OWN SKILL')

    const { written, skipped } = await installSkills({ names: ['alpha-skill'], dests: [dest] })
    expect(written).toHaveLength(0)
    expect(skipped).toEqual([join(dest, 'alpha-skill')])
    expect(readFileSync(mine, 'utf8')).toBe('MY OWN SKILL')

    await installSkills({ names: ['alpha-skill'], dests: [dest], force: true })
    expect(readFileSync(mine, 'utf8')).toContain('name: alpha-skill')
  })
})

// NEGATIVE TEST 3 — a destination outside cwd and home is refused.
describe('assertSafeDest', () => {
  it('refuses a path outside both the working directory and home', () => {
    expect(() => assertSafeDest('/etc/cron.d', '/repo', '/home/dev')).toThrow(
      /Refusing to write outside/,
    )
  })

  it('allows paths inside either', () => {
    expect(() => assertSafeDest('/repo/.agents/skills', '/repo', '/home/dev')).not.toThrow()
    expect(() => assertSafeDest('/home/dev/.claude/skills', '/repo', '/home/dev')).not.toThrow()
  })

  it('is not fooled by a sibling with a shared prefix', () => {
    expect(() => assertSafeDest('/repo-evil/skills', '/repo', '/home/dev')).toThrow()
  })
})

describe('uninstallSkills', () => {
  it('removes only bundled skill names, leaving anything else alone', async () => {
    const dest = join(sandbox, '.agents', 'skills')
    await installSkills({ dests: [dest] })
    mkdirSync(join(dest, 'my-own-skill'), { recursive: true })
    writeFileSync(join(dest, 'my-own-skill', 'SKILL.md'), 'mine')

    const { removed } = await uninstallSkills({ names: ['alpha-skill'], dests: [dest] })
    expect(removed).toEqual([join(dest, 'alpha-skill')])
    expect(existsSync(join(dest, 'beta-skill'))).toBe(true)
    expect(existsSync(join(dest, 'my-own-skill'))).toBe(true)
  })

  // NEGATIVE TEST 4 — uninstall cannot be pointed at an arbitrary name either.
  it('rejects an unknown name rather than deleting the path', async () => {
    const dest = join(sandbox, '.agents', 'skills')
    await expect(uninstallSkills({ names: ['my-own-skill'], dests: [dest] })).rejects.toThrow(
      /Unknown skill/,
    )
  })
})

describe('the real bundled skills', () => {
  it('every shipped skill has a name matching its directory', async () => {
    delete process.env['SAWALA_SKILLS_DIR']
    const all = await listBundledSkills()
    expect(all.length).toBeGreaterThan(0)
    for (const s of all) {
      expect(s.dir.endsWith(s.name)).toBe(true)
      expect(s.description.length).toBeGreaterThan(0)
      expect(s.description.length).toBeLessThanOrEqual(1024)
    }
    // sawala-cli-dev is internal and must never be published.
    expect(all.map((s) => s.name)).not.toContain('sawala-cli-dev')
    expect(homedir()).toBeTruthy()
  })
})
