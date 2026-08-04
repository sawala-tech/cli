# Agent Skills for the Sawala CLI

Each subdirectory here is an [Agent Skill](https://agentskills.io) — a
`SKILL.md` with `name` + `description` frontmatter that an agent loads on
demand when a task matches the description.

## Why `.agents/skills/` and not `.claude/skills/`

The `SKILL.md` format is a cross-vendor standard, but the directory each tool
looks in is not:

| Tool | Reads |
|---|---|
| OpenAI Codex | `.agents/skills/` **only** — not `.codex/skills`, not `.claude/skills` |
| GitHub Copilot | `.agents/skills/`, `.github/skills/`, or `.claude/skills/` |
| Claude Code | `.claude/skills/` |

`.agents/skills/` is the only directory Codex and Copilot both read, so it is
canonical here. `.claude/skills` is a relative symlink to it, which covers
Claude Code without a second copy. There is no `.github/skills/` — Copilot
already reads `.agents/skills/`.

On Windows without Developer Mode, Git may materialise the symlink as a text
file. If that happens, copy `.agents/skills/` to `.claude/skills/` and add the
copy to `.gitignore`.

## What ships to customers

Every skill here except `sawala-cli-dev` is published inside the `@sawala/cli`
npm package and installed by `sawala skills install`. `sawala-cli-dev`
documents how to contribute to *this monorepo* and is meaningless to a
customer, so it stays here only.

## If you add a command or an MCP tool

`scripts/check-skills-coverage.mjs` fails the build when a CLI command group or
an MCP tool name appears nowhere in these files. It also validates each skill
against the Agent Skills spec (name pattern, `name` matching the directory,
description length, body under 500 lines, no dangling relative links).

Run it with `npm run check:skills`.
