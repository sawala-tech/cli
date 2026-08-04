---
"@sawala/cli": minor
---

New `sawala skills` command: install the Sawala Agent Skills into your AI coding agent so it knows how to drive these tools correctly.

`sawala skills install` copies eight skills — orientation plus one per product (Kontena, Datana, Tugasna, Sebar, Akuna, Ajena, Kodena) — into your project. They carry the things that are not in `--help`: that a collection or schema `update` is a PUT replacement so adding a field means pull-append-push, that a Datana boolean filter silently returns zero rows, that Tugasna dates are epoch-millisecond numbers, that `sebar broadcast create` sends immediately with no undo, and that `akuna isolate` is effectively one-way.

Skills are an open cross-vendor format, so one install serves Claude Code, GitHub Copilot, and OpenAI Codex. The default target is `.agents/skills/`, which Codex and Copilot both read; pass `--target all` to also write `.claude/skills/` and `.github/skills/`, or `--global` to install into your home directory. `sawala skills list` shows what is bundled and `sawala skills uninstall` removes them again. Installing never overwrites an existing skill folder without `--force`, and `--dry-run` prints what it would write.
