/**
 * Re-exports the CLI's bundle utilities so the deploy + patch-assets
 * MCP tools use identical caps, MIME inference, and base64 encoding.
 * Importing via relative path mirrors lib/api-client.ts; the workspace
 * symlink gives the bundler line-of-sight to the source.
 */
export {
  readWorkerEntry,
  summarise,
  validateVars,
  walkAssets,
} from '../../../kodena/src/lib/bundle'
export type { AssetFile, BundleStats, WorkerBundle } from '../../../kodena/src/lib/bundle'
