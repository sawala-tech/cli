---
"@sawala/kodena-mcp": patch
---

Fix `kodena_set_custom_domain`: send `{ hostname }` to the backend instead of `{ domain }`. The Kodena `POST /custom-domain` route reads `body.hostname`, so the previous body was rejected with `MISSING_HOSTNAME` and attaching a custom domain via MCP never worked. The tool's `domain` input is unchanged; it now maps to `hostname` on the wire.
