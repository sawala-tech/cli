import {
  KODENA_BRAND,
  TOKEN_PATTERN,
  type Credentials,
  credentialsPath as credentialsPathShared,
  readCredentials as readCredentialsShared,
  writeCredentials as writeCredentialsShared,
  deleteCredentials as deleteCredentialsShared,
} from '@sawala/auth'

export { TOKEN_PATTERN }
export type { Credentials }

export function credentialsPath(): string {
  return credentialsPathShared(KODENA_BRAND)
}

/**
 * Read and validate the credentials file. Returns null if the file does not
 * exist; throws if the file exists but is unreadable or malformed.
 */
export async function readCredentials(): Promise<Credentials | null> {
  return readCredentialsShared(KODENA_BRAND)
}

/**
 * Write credentials atomically with mode 0600.
 */
export async function writeCredentials(creds: Credentials): Promise<void> {
  return writeCredentialsShared(KODENA_BRAND, creds)
}

/**
 * Delete the credentials file, if present. Idempotent.
 */
export async function deleteCredentials(): Promise<void> {
  return deleteCredentialsShared(KODENA_BRAND)
}
