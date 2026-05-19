import { describe, expect, it } from 'vitest'
import { createProgram } from '../src/cli'
import pkg from '../package.json'

describe('kodena CLI smoke', () => {
  it('exposes the package version via --version', async () => {
    const program = createProgram().exitOverride()
    let captured = ''
    program.configureOutput({
      writeOut: (s) => {
        captured += s
      },
    })
    try {
      await program.parseAsync(['node', 'kodena', '--version'])
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
      await program.parseAsync(['node', 'kodena', '--help'])
    } catch (err) {
      const code = (err as { code?: string }).code
      expect(code).toBe('commander.helpDisplayed')
    }
    expect(captured).toContain('Deploy Cloudflare Worker bundles to Kodena.')
    expect(captured).toContain('Usage: kodena')
  })

  it('declares the program name as "kodena"', () => {
    const program = createProgram()
    expect(program.name()).toBe('kodena')
  })
})
