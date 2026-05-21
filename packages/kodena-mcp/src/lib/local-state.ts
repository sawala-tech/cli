/**
 * Re-exports the CLI's local-state readers so the kodena://config
 * resource can show the user what the server sees, no token leaks.
 */
export { readCredentials } from '../../../kodena/src/lib/credentials'
export type { Credentials } from '../../../kodena/src/lib/credentials'
export { readConfig } from '../../../kodena/src/lib/config'
export type { Config } from '../../../kodena/src/lib/config'
