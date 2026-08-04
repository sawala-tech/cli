import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { Command } from 'commander'
import {
  assertSafeDest,
  installSkills,
  listBundledSkills,
  resolveTargetDirs,
  SKILL_TARGETS,
  uninstallSkills,
  type SkillTarget,
} from '../lib/skills'

function collectTarget(val: string, prev: SkillTarget[] = []): SkillTarget[] {
  if (!(SKILL_TARGETS as readonly string[]).includes(val)) {
    throw new Error(`Unknown target '${val}'. Valid targets: ${SKILL_TARGETS.join(', ')}.`)
  }
  prev.push(val as SkillTarget)
  return prev
}

interface DestOptions {
  target?: SkillTarget[]
  global?: boolean
  dir?: string
  force?: boolean
}

function destsFor(opts: DestOptions): string[] {
  const cwd = process.cwd()
  const home = homedir()

  if (opts.dir) {
    if (opts.target?.length || opts.global) {
      throw new Error('Pass either --dir or --target/--global, not both.')
    }
    const dest = resolve(opts.dir)
    if (!opts.force) assertSafeDest(dest, cwd, home)
    return [dest]
  }

  const targets = opts.target?.length ? opts.target : (['agents'] as SkillTarget[])
  const dests = resolveTargetDirs({
    targets,
    ...(opts.global ? { global: true } : {}),
    cwd,
    home,
  })
  for (const d of dests) if (!opts.force) assertSafeDest(d, cwd, home)
  return dests
}

export function createSkillsCommand(): Command {
  const skills = new Command('skills').description(
    'Install the Sawala Agent Skills into your agent so it knows how to drive these tools.',
  )

  skills
    .command('list')
    .description('List the skills bundled with this CLI.')
    .action(async () => {
      const all = await listBundledSkills()
      const width = Math.max(...all.map((s) => s.name.length))
      for (const s of all) {
        const summary = s.description.length > 96 ? s.description.slice(0, 93) + '…' : s.description
        process.stdout.write(`${s.name.padEnd(width)}  ${summary}\n`)
      }
    })

  skills
    .command('install [names...]')
    .description(
      'Copy skills into your agent\'s skills directory. Defaults to all skills, ' +
        'target `agents` (.agents/skills — read by Codex and Copilot).',
    )
    .option(
      '--target <target>',
      `Where to write: ${SKILL_TARGETS.join(' | ')}. Repeatable. Default: agents.`,
      collectTarget,
      [],
    )
    .option('--global', 'Install into your home directory instead of the current directory.')
    .option('--dir <path>', 'Write to this exact directory instead of a target mapping.')
    .option('--force', 'Overwrite existing skill folders.')
    .option('--dry-run', 'Print what would be written without writing.')
    .action(async (names: string[], opts: DestOptions & { dryRun?: boolean }) => {
      const dests = destsFor(opts)
      const result = await installSkills({
        ...(names.length ? { names } : {}),
        dests,
        ...(opts.force ? { force: true } : {}),
        ...(opts.dryRun ? { dryRun: true } : {}),
      })

      for (const p of result.written) {
        process.stdout.write(`${opts.dryRun ? 'would write' : 'wrote'} ${join(p, 'SKILL.md')}\n`)
      }
      if (result.skipped.length > 0) {
        for (const p of result.skipped) {
          process.stderr.write(`exists, skipped: ${p}\n`)
        }
        throw new Error(
          `${result.skipped.length} skill(s) already installed. Re-run with --force to overwrite.`,
        )
      }

      // `.agents/skills` covers Codex and Copilot but not Claude Code. Suggest;
      // never act — writing a second copy is the drift problem in miniature.
      const wroteAgentsOnly =
        !opts.dir && dests.length === 1 && dests[0]?.endsWith(join('.agents', 'skills'))
      if (wroteAgentsOnly && !opts.dryRun && existsSync(join(process.cwd(), '.claude'))) {
        process.stdout.write(
          '\nThis directory has a .claude/ — Claude Code reads .claude/skills, not .agents/skills.\n' +
            'Either re-run with --target all, or link them:\n' +
            '  ln -s ../.agents/skills .claude/skills\n',
        )
      }
    })

  skills
    .command('uninstall <names...>')
    .description('Remove previously installed skills.')
    .option(
      '--target <target>',
      `Where to remove from: ${SKILL_TARGETS.join(' | ')}. Repeatable. Default: agents.`,
      collectTarget,
      [],
    )
    .option('--global', 'Operate on your home directory instead of the current directory.')
    .option('--dir <path>', 'Operate on this exact directory.')
    .option('--force', 'Allow a directory outside the cwd/home.')
    .action(async (names: string[], opts: DestOptions) => {
      const dests = destsFor(opts)
      const { removed } = await uninstallSkills({ names, dests })
      if (removed.length === 0) {
        process.stdout.write('Nothing to remove.\n')
        return
      }
      for (const p of removed) process.stdout.write(`removed ${p}\n`)
    })

  return skills
}
