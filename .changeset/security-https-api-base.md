---
"@sawala/kodena": patch
"@sawala/cli": patch
"@sawala/mcp": patch
---

Security: reject non-https API base URLs. The CLI attaches the long-lived auth
token to every request, so `--api-base`, the `*_API_BASE` env var, and a stored
`credentials.apiBase` must now resolve to `https://` (`http://` is allowed only
for localhost / loopback). A tampered or misconfigured cleartext base is refused
with a clear error instead of silently transmitting the token in the clear.
