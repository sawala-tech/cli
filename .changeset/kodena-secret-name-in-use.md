---
"@sawala/kodena": patch
---

`kodena secret put` now gives an actionable error when the name is already a plaintext var. Instead of surfacing Cloudflare's raw `Binding name … already in use`, it explains that the name is currently a `var` and must be converted by redeploying with `kodena deploy --secret KEY=value` (after which `secret put` can rotate it).
