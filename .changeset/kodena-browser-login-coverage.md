---
"@sawala/kodena": minor
---

Browser-based `kodena login` plus full platform-coverage commands.

`kodena login` now opens a browser to authorize by default — no token to copy or paste; the freshly-minted token travels to the CLI over a back-channel and never passes through the browser. The previous manual flow is preserved as `kodena login --no-browser`, plus a new `--token <koda_…>` for non-interactive login, and the browser flow automatically falls back to manual paste when no browser/loopback is available.

New commands bring the CLI to parity with the Kodena platform API:

- `script get | rename | rehydrate | rm`
- `asset list | get | patch | rebuild`
- `domain set | status | rm` (attach an already-owned custom domain)
- `org handle [value]`
- `slug check <slug>`
