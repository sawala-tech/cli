import { Command } from 'commander'
import { SAWALA_BRAND, credentialsPath, deleteCredentials } from '@sawala/auth'

export function createLogoutCommand(): Command {
  return new Command('logout')
    .description('Delete the locally-stored CLI token (does not revoke it on the server).')
    .action(async () => {
      await deleteCredentials(SAWALA_BRAND)
      process.stdout.write(`Removed ${credentialsPath(SAWALA_BRAND)}.\n`)
      process.stdout.write(
        'To revoke this token server-side, visit https://sawala.cloud/dashboard/org/settings and use the CLI tokens tab.\n',
      )
    })
}
