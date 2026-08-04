---
"@sawala/cli": patch
---

`sawala skills install --target codex --global` now writes to both `~/.agents/skills` and `~/.codex/skills`. Codex's documentation names the first while real installs use the second, and rather than pick one and risk a global install landing where nothing reads it, both are written. Project-level installs are unchanged — `.agents/skills` is well attested there.

The `sawala-cli` skill's description now also mentions listing uploaded files, assets, and media, and reading forms and submissions. It absorbs the Formulir and Berkasna surfaces, but previously named them only as products — so "list my files" or "read the form submissions" matched nothing unless the user happened to say "Berkasna" or "Formulir".
