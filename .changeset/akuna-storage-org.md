---
"@sawala/cli": minor
---

Add `sawala akuna storage status` and `sawala akuna storage isolate` — org-level data residency. `isolate` enables a dedicated database for the whole org (moves all BYO connections onto it, new BYO connections inherit it; managed stays shared); `status` shows current residency. Org-level counterpart to the per-connection `akuna connection isolate` primitive.
