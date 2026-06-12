---
'@sawala/kodena': minor
---

Add `kodena init` and `kodena template list` to scaffold a local project from a
Kodena starter template. `kodena init [slug] [dir]` downloads the chosen
template's source from the public `kodena-templates` repo, writes it into the
target directory, and generates a ready-to-deploy `kodena.json`; omit the slug
to pick interactively (the recommended template is pre-selected).
