---
"@sawala/cli": patch
---

ajena flow: FlowDocument steps now carry an optional per-step `enabled` flag. A step with `enabled: false` is skipped at run time (its config retained), so `sawala ajena flow pull`/`push` round-trip a disabled step and you can toggle one step off without editing the rest of the flow.
