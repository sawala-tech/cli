import { describe, expect, it } from 'vitest'
import { createProgram } from '../src/cli'
import pkg from '../package.json'

describe('sawala CLI smoke', () => {
  it('exposes the package version via --version', async () => {
    const program = createProgram().exitOverride()
    let captured = ''
    program.configureOutput({
      writeOut: (s) => {
        captured += s
      },
    })
    try {
      await program.parseAsync(['node', 'sawala', '--version'])
    } catch (err) {
      const code = (err as { code?: string }).code
      expect(code).toBe('commander.version')
    }
    expect(captured.trim()).toBe(pkg.version)
  })

  it('renders --help without throwing an uncaught error', async () => {
    const program = createProgram().exitOverride()
    let captured = ''
    program.configureOutput({
      writeOut: (s) => {
        captured += s
      },
    })
    try {
      await program.parseAsync(['node', 'sawala', '--help'])
    } catch (err) {
      const code = (err as { code?: string }).code
      expect(code).toBe('commander.helpDisplayed')
    }
    expect(captured).toContain('Sawala umbrella CLI')
    expect(captured).toContain('Usage: sawala')
  })

  it('declares the program name as "sawala"', () => {
    const program = createProgram()
    expect(program.name()).toBe('sawala')
  })

  it('registers the login/logout/whoami/org/project subcommands', () => {
    const program = createProgram()
    const names = program.commands.map((c) => c.name())
    expect(names).toContain('login')
    expect(names).toContain('logout')
    expect(names).toContain('whoami')
    expect(names).toContain('org')
    expect(names).toContain('project')
  })
})
