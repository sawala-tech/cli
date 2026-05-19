import { Command } from 'commander'
import { credentialsPath, deleteCredentials } from '../lib/credentials'

export function createLogoutCommand(): Command {
  return new Command('logout')
    .description('Delete the locally-stored CLI token (does not revoke it on the server).')
    .action(async () => {
      await deleteCredentials()
      process.stdout.write(`Removed ${credentialsPath()}.\n`)
      process.stdout.write(
        'To revoke this token server-side, visit https://sawala.cloud/dashboard/org/settings and use the CLI tokens tab.\n',
      )
    })
}
