---
"@sawala/cli": minor
"@sawala/kodena": patch
---

Add no-paste browser login to the `sawala` CLI.

`sawala login` now opens the dashboard `/cli-login` page by default and
receives the minted token over a loopback back-channel — no token to copy or
paste — falling back to manual paste when no browser or loopback port is
available. Adds `--token` (non-interactive) and `--web-base`; `--no-browser`
now selects the paste flow.

The shared browser-login helper now sends a `brand` signal to the authorize
page so it can show the matching name and command; `kodena login` passes
`brand: 'kodena'` to keep its existing copy unchanged.
