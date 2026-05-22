---
'@sawala/cli': patch
'@sawala/mcp': patch
---

Ship the missing READMEs.

The first releases of `@sawala/cli@0.1.0` and `@sawala/mcp@0.1.0`
declared `README.md` in their `files` array but had no such file in the
package, so the published tarballs contained only `package.json` + `dist/`.
This patch adds the actual README documents and re-publishes both
packages so the npmjs.com listings show proper documentation.
