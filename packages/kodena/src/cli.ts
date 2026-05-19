import { Command } from 'commander'
import pkg from '../package.json'
import { createDeployCommand } from './commands/deploy'
import { createLoginCommand } from './commands/login'
import { createLogoutCommand } from './commands/logout'
import { createOrgCommand } from './commands/org'
import { createProjectCommand } from './commands/project'
import { createWhoamiCommand } from './commands/whoami'

export function createProgram(): Command {
  const program = new Command()
  program
    .name('kodena')
    .description('Deploy Cloudflare Worker bundles to Kodena.')
    .version(pkg.version, '-v, --version', 'output the current CLI version')

  program.addCommand(createLoginCommand())
  program.addCommand(createLogoutCommand())
  program.addCommand(createWhoamiCommand())
  program.addCommand(createOrgCommand())
  program.addCommand(createProjectCommand())
  program.addCommand(createDeployCommand())

  return program
}

if (require.main === module) {
  createProgram()
    .parseAsync(process.argv)
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      process.stderr.write(message + '\n')
      process.exit(1)
    })
}
