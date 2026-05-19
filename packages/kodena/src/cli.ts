import { Command } from 'commander'
import pkg from '../package.json'

export function createProgram(): Command {
  const program = new Command()
  program
    .name('kodena')
    .description('Deploy Cloudflare Worker bundles to Kodena.')
    .version(pkg.version, '-v, --version', 'output the current CLI version')

  // Commands land in M2+: login, logout, whoami, org, project, deploy.

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
