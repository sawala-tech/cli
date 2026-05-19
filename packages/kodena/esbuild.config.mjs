import { build } from 'esbuild'
import { chmodSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outfile = resolve(__dirname, 'dist/cli.js')

mkdirSync(resolve(__dirname, 'dist'), { recursive: true })

await build({
  entryPoints: [resolve(__dirname, 'src/cli.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile,
  banner: { js: '#!/usr/bin/env node' },
  sourcemap: 'inline',
  minify: false,
  legalComments: 'none',
})

chmodSync(outfile, 0o755)
console.log(`built ${outfile}`)
