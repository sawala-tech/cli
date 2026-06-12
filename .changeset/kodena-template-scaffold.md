---
'@sawala/kodena': minor
---

Add `kodena init` and `kodena template list` to scaffold a local project from a
Kodena starter template. `kodena init [slug] [dir]` downloads the chosen
template's source from the public `kodena-templates` repo, writes it into the
target directory, and generates a ready-to-deploy `kodena.json`; omit the slug
to pick interactively (the recommended template is pre-selected).

Only standalone templates (ones that deploy with no backend) are offered by the
CLI. Templates that require a provisioned Kontena CMS project are hidden until a
provisioning path exists; they remain available via the hosted site builder.
