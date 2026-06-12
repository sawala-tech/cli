import { promises as fs } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { Command } from 'commander'
import prompts from 'prompts'
import {
  extractTemplateSubtree,
  fetchTemplatesIndex,
  findTemplate,
  generateKodenaConfig,
  isStandalone,
  standaloneTemplates,
  type TemplateIndexEntry,
  type TemplatesIndex,
} from '../lib/templates'

export function createTemplateCommand(): Command {
  const template = new Command('template').description(
    'Browse and scaffold Kodena starter templates.',
  )

  template
    .command('list')
    .description('List the starter templates you can scaffold with `kodena init`.')
    .option('--ref <git-ref>', 'Read the index from this branch or tag of kodena-templates.')
    .action(async (opts: { ref?: string }) => {
      const index = await fetchTemplatesIndex(opts.ref ? { ref: opts.ref } : {})
      // Only standalone templates can be scaffolded + deployed unattended;
      // templates that need a provisioned backend (Kontena/Formulir) are
      // hidden from the CLI until that path exists.
      const templates = standaloneTemplates(index)
      if (templates.length === 0) {
        process.stdout.write('No standalone templates are available yet.\n')
        return
      }
      for (const t of templates) {
        process.stdout.write(`  ${t.slug}  —  ${t.displayName}\n`)
        if (t.description) process.stdout.write(`      ${t.description}\n`)
      }
    })

  // `kodena template init` is the same command exposed top-level as `kodena init`.
  template.addCommand(createInitCommand())

  return template
}

interface InitOptions {
  ref?: string
  slug?: string
  force?: boolean
}

export function createInitCommand(): Command {
  return new Command('init')
    .description('Scaffold a local project from a Kodena starter template.')
    .argument('[slug]', 'Template slug (omit to choose interactively).')
    .argument('[dir]', 'Target directory (default: the template slug).')
    .option('--ref <git-ref>', 'Scaffold from this branch or tag of kodena-templates.')
    .option('--slug <script-slug>', "Override the generated kodena.json 'slug' (default: dir name).")
    .option('--force', 'Write into the target dir even if it is non-empty.')
    .action(async (slugArg: string | undefined, dirArg: string | undefined, opts: InitOptions) => {
      const index = await fetchTemplatesIndex(opts.ref ? { ref: opts.ref } : {})
      const ref = opts.ref ?? index.ref

      // 1. Resolve which template: explicit arg, else interactive picker.
      const available = standaloneTemplates(index)
      let picked: TemplateIndexEntry | undefined
      if (slugArg) {
        const match = findTemplate(index, slugArg)
        if (match && !isStandalone(match)) {
          // The slug exists but needs a provisioned backend — the CLI can't
          // scaffold it unattended yet. Don't lay down a project that won't build.
          throw new Error(
            `Template '${slugArg}' needs a provisioned backend (${match.requires?.join(', ')}) ` +
              `and isn't supported by \`kodena init\` yet. ` +
              `Standalone templates: ${available.map((t) => t.slug).join(', ') || '(none)'}.`,
          )
        }
        picked = match
        if (!picked) {
          throw new Error(
            `Template '${slugArg}' not found. Available: ${available.map((t) => t.slug).join(', ') || '(none)'}.`,
          )
        }
      } else {
        const chosen = await pickTemplateInteractively(index)
        if (!chosen) {
          process.stdout.write('Cancelled.\n')
          return
        }
        picked = chosen
      }

      // 2. Resolve + guard the target directory.
      const destDir = resolve(process.cwd(), dirArg ?? picked.slug)
      await assertWritableDir(destDir, Boolean(opts.force))

      // 3. Download + extract the chosen template's subtree.
      process.stdout.write(`→ Scaffolding '${picked.slug}' into ${destDir} (ref: ${ref})\n`)
      const count = await extractTemplateSubtree({ templatePath: picked.path, destDir, ref })
      process.stdout.write(`✓ Wrote ${count} files\n`)

      // 4. Generate kodena.json from the template's manifest.
      const scriptSlug = opts.slug ?? basename(destDir)
      const cfg = await generateKodenaConfig(destDir, scriptSlug)
      const cfgPath = join(destDir, 'kodena.json')
      await fs.writeFile(cfgPath, JSON.stringify(cfg, null, 2) + '\n')
      process.stdout.write(`✓ Generated ${cfgPath} (slug: ${scriptSlug})\n`)

      // 5. Next steps.
      const cdTarget = dirArg ?? picked.slug
      process.stdout.write(
        `\nNext steps:\n  cd ${cdTarget}\n  npm install\n  kodena deploy --build\n`,
      )
    })
}

/**
 * Ensure `dir` is safe to scaffold into: create it when missing, allow an
 * empty existing dir, and refuse a non-empty one unless `force` was passed.
 */
async function assertWritableDir(dir: string, force: boolean): Promise<void> {
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    await fs.mkdir(dir, { recursive: true })
    return
  }
  if (entries.length > 0 && !force) {
    throw new Error(
      `Target directory ${dir} is not empty. Re-run with --force to scaffold into it anyway.`,
    )
  }
}

/**
 * Present the index as a `prompts` selector, pre-selecting the entry flagged
 * `default: true` (falling back to the first template). Mirrors how
 * `kodena org use` pre-selects the active org. Errors in a non-TTY with a
 * "pass a slug" message; returns null when the user cancels.
 */
async function pickTemplateInteractively(
  index: TemplatesIndex,
): Promise<TemplateIndexEntry | null> {
  if (!process.stdout.isTTY) {
    throw new Error(
      'No template slug given and not running interactively. Pass one: `kodena init <slug>`.',
    )
  }
  // Offer only templates the CLI can scaffold + deploy unattended.
  const templates = standaloneTemplates(index)
  if (templates.length === 0) {
    throw new Error('No standalone templates are available to scaffold yet.')
  }
  const defaultIdx = templates.findIndex((t) => t.default)
  const { picked } = await prompts({
    type: 'select',
    name: 'picked',
    message: 'Pick a template to scaffold',
    choices: templates.map((t) => ({
      title: `${t.slug} — ${t.displayName}`,
      value: t.slug,
    })),
    initial: defaultIdx >= 0 ? defaultIdx : 0,
  })
  if (!picked) return null
  return findTemplate(index, String(picked)) ?? null
}
