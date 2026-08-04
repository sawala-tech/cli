#!/usr/bin/env node
// Guards the Agent Skills in .agents/skills/ against drifting behind the code.
//
// Three checks, all failing the build:
//   1. Coverage  — every MCP tool name and every CLI command group is mentioned
//                  somewhere in the skills corpus.
//   2. Spec      — each skill satisfies the Agent Skills spec (agentskills.io):
//                  name pattern, name === directory, description length, body
//                  size, and no dangling relative links.
//   3. Secrets   — no credential-shaped string is committed in a skill.
//
// Coverage deliberately tests *mention*, not correctness: no script can judge
// whether a description is accurate, and a stricter rule would just be gamed by
// pasting names into a footer. Mention is enough to force the author to open the
// skill and think.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SKILLS_DIR = join(ROOT, '.agents', 'skills')

const MCP_PACKAGES = ['sawala-mcp', 'kodena-mcp']
const CLI_PACKAGES = ['sawala', 'kodena']

// Agent Skills spec limits.
const NAME_RE = /^(?!-)(?!.*--)[a-z0-9-]{1,64}(?<!-)$/
const MAX_DESCRIPTION = 1024
const MAX_BODY_LINES = 500

// Credential shapes that must never appear in a skill. `koda_` + 32 chars of
// [A-Z2-7] is the real Sawala CLI token format (TOKEN_PATTERN in @sawala/auth).
const SECRET_RES = [
  { label: 'Sawala CLI token', re: /koda_[A-Z2-7]{32}/ },
  { label: 'OpenAI-style key', re: /\bsk-[A-Za-z0-9]{16,}/ },
  { label: 'Authorization header', re: /Bearer\s+[A-Za-z0-9._-]{20,}/ },
  { label: 'long hex run', re: /\b[0-9a-f]{32,}\b/ },
]

const fail = []
// Header lines are printed but not counted as problems.
let headings = 0

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

// ── gather the skills corpus ────────────────────────────────────────────────
if (!existsSync(SKILLS_DIR)) {
  console.error(`No skills directory at ${SKILLS_DIR}`)
  process.exit(1)
}

const skillDirs = readdirSync(SKILLS_DIR).filter((d) =>
  statSync(join(SKILLS_DIR, d)).isDirectory(),
)

const corpusFiles = walk(SKILLS_DIR).filter((f) => f.endsWith('.md'))
const corpus = corpusFiles.map((f) => readFileSync(f, 'utf8')).join('\n')

// ── 1. coverage ─────────────────────────────────────────────────────────────
// MCP tool names are declared on the exported ToolDefinition as
// `name: 'sawala_…'` / `name: 'kodena_…'`. The prefix keeps us from matching
// the `name` keys that appear inside inputSchema property maps.
const toolNames = []
for (const pkg of MCP_PACKAGES) {
  const dir = join(ROOT, 'packages', pkg, 'src', 'tools')
  if (!existsSync(dir)) continue
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.ts') || file === 'index.ts' || file === 'types.ts') continue
    const src = readFileSync(join(dir, file), 'utf8')
    for (const m of src.matchAll(/name:\s*'((?:sawala|kodena)_[a-z0-9_]+)'/g)) {
      toolNames.push({ name: m[1], pkg })
    }
  }
}

// Command groups are the filenames under each CLI package's src/commands/.
const commandGroups = []
for (const pkg of CLI_PACKAGES) {
  const dir = join(ROOT, 'packages', pkg, 'src', 'commands')
  if (!existsSync(dir)) continue
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.ts')) continue
    commandGroups.push({ name: file.replace(/\.ts$/, ''), pkg })
  }
}

function suggest(name, pkg) {
  const stem = name.replace(/^(sawala|kodena)_/, '').split('_')[0]
  const guesses = [`sawala-${stem}`, `${stem}-deploy`, stem]
  const hit = guesses.find((g) => skillDirs.includes(g))
  if (hit) return `.agents/skills/${hit}/SKILL.md`
  return pkg.startsWith('kodena')
    ? '.agents/skills/kodena-deploy/SKILL.md'
    : '.agents/skills/sawala-cli/SKILL.md'
}

const missingTools = toolNames.filter((t) => !corpus.includes(t.name))
const missingGroups = commandGroups.filter((g) => {
  // A group counts as covered when its name appears as a word anywhere.
  return !new RegExp(`\\b${g.name}\\b`, 'i').test(corpus)
})

if (missingTools.length || missingGroups.length) {
  fail.push('MISSING from all skills:')
  headings++
  for (const t of missingTools) {
    fail.push(`  ${t.name.padEnd(38)} (suggest: ${suggest(t.name, t.pkg)})`)
  }
  for (const g of missingGroups) {
    fail.push(`  ${(g.pkg + ' ' + g.name).padEnd(38)} (suggest: ${suggest(g.name, g.pkg)})`)
  }
}

// ── 2. spec conformance ─────────────────────────────────────────────────────
for (const dir of skillDirs) {
  const skillMd = join(SKILLS_DIR, dir, 'SKILL.md')
  if (!existsSync(skillMd)) {
    fail.push(`${dir}: no SKILL.md (the filename must be exactly SKILL.md)`)
    continue
  }
  const raw = readFileSync(skillMd, 'utf8')
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!m) {
    fail.push(`${dir}/SKILL.md: no YAML frontmatter delimited by --- lines`)
    continue
  }
  const [, front, body] = m

  const nameMatch = front.match(/^name:\s*(.+)$/m)
  const descMatch = front.match(/^description:\s*([\s\S]*?)(?=\n[a-z-]+:|$)/m)

  if (!nameMatch) fail.push(`${dir}/SKILL.md: frontmatter has no \`name\``)
  else {
    const name = nameMatch[1].trim()
    if (!NAME_RE.test(name)) {
      fail.push(
        `${dir}/SKILL.md: name '${name}' breaks the spec (1-64 chars, [a-z0-9-], no leading/trailing/doubled hyphen)`,
      )
    }
    if (name !== dir) {
      fail.push(`${dir}/SKILL.md: name '${name}' must match its directory '${dir}'`)
    }
  }

  if (!descMatch) fail.push(`${dir}/SKILL.md: frontmatter has no \`description\``)
  else {
    const desc = descMatch[1].trim()
    if (desc.length === 0) fail.push(`${dir}/SKILL.md: description is empty`)
    if (desc.length > MAX_DESCRIPTION) {
      fail.push(`${dir}/SKILL.md: description is ${desc.length} chars (max ${MAX_DESCRIPTION})`)
    }
  }

  const bodyLines = body.split('\n').length
  if (bodyLines > MAX_BODY_LINES) {
    fail.push(
      `${dir}/SKILL.md: body is ${bodyLines} lines (max ${MAX_BODY_LINES}) — move detail into references/`,
    )
  }

  // Relative markdown links must resolve. A dangling references/ pointer is a
  // skill that dead-ends mid-task.
  for (const link of raw.matchAll(/\]\((?!https?:|#)([^)]+)\)/g)) {
    const target = link[1].split('#')[0]
    if (!target) continue
    if (target.startsWith('../')) {
      fail.push(
        `${dir}/SKILL.md: link '${target}' points outside the skill — skills install individually, so it would dangle`,
      )
      continue
    }
    if (!existsSync(resolve(join(SKILLS_DIR, dir), target))) {
      fail.push(`${dir}/SKILL.md: dangling link '${target}'`)
    }
  }
}

// ── 3. secret scan ──────────────────────────────────────────────────────────
for (const file of corpusFiles) {
  const src = readFileSync(file, 'utf8')
  for (const { label, re } of SECRET_RES) {
    if (re.test(src)) {
      fail.push(`${file.replace(ROOT + '/', '')}: looks like it contains a ${label}`)
    }
  }
}

// ── report ──────────────────────────────────────────────────────────────────
if (fail.length) {
  console.error(fail.join('\n'))
  console.error(
    `\n${fail.length - headings} problem(s). Add the name to a skill, fix the spec violation, or remove the secret.`,
  )
  process.exit(1)
}

console.log(
  `skills coverage: ${toolNames.length}/${toolNames.length} MCP tools, ` +
    `${commandGroups.length}/${commandGroups.length} command groups mentioned across ${skillDirs.length} skills.`,
)
