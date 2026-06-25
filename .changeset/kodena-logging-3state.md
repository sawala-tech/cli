---
"@sawala/kodena": minor
---

`kodena logging` is now 3-state: `kodena logging off|console|all <slug>` (replacing on|off). `off` = no capture, `console` = the script's console.* output, `all` = console output plus a per-request summary line. Sends the new `{ mode }` body to PATCH /kodena/scripts/:slug/logging.
