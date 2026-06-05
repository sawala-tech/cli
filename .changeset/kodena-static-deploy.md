---
"@sawala/kodena": minor
---

`kodena deploy` can now deploy a pure static site as a `kind:'assets'` bundle. Pass `--static` (or set `"build": { "static": true }` in kodena.json); the CLI also auto-detects static when the resolved worker entry is missing. Use `--no-static` to force a worker-bundle. The static assets root is the build output directory itself (`build.assetsDir ?? build.outputDir ?? out`). Static sites no longer need a bespoke deploy script.
