---
'@sawala/kodena': patch
---

Fix `kodena script list`: scope it to the active project.

Kodena scripts are project-scoped, but `script list` only required an active
org and never sent the project context — so the backend rejected the request
with `tenant-headers-missing`. The command now requires an active project
(`kodena project use <slug>` or `--project`) and sends `x-project-id`.
