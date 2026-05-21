import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * KODENA_MCP_READ_ONLY=1 is read once at module load. Each test resets
 * the module cache and re-imports tools/index under the desired env so
 * the filter logic runs against fresh state.
 */
async function loadToolsModule(env: { readOnly: boolean }): Promise<{
  ALL_TOOLS: ReadonlyArray<{ name: string; annotations: { readOnlyHint?: boolean } }>
  TOOLS_BY_NAME: ReadonlyMap<string, unknown>
  isReadOnlyMode: () => boolean
}> {
  vi.resetModules()
  if (env.readOnly) {
    process.env['KODENA_MCP_READ_ONLY'] = '1'
  } else {
    delete process.env['KODENA_MCP_READ_ONLY']
  }
  return import('../src/tools')
}

describe('isReadOnlyMode', () => {
  let prior: string | undefined

  beforeEach(() => {
    prior = process.env['KODENA_MCP_READ_ONLY']
  })

  afterEach(() => {
    if (prior === undefined) delete process.env['KODENA_MCP_READ_ONLY']
    else process.env['KODENA_MCP_READ_ONLY'] = prior
    vi.resetModules()
  })

  it('returns false by default', async () => {
    const { isReadOnlyMode } = await loadToolsModule({ readOnly: false })
    expect(isReadOnlyMode()).toBe(false)
  })

  it('returns true when KODENA_MCP_READ_ONLY=1', async () => {
    const { isReadOnlyMode } = await loadToolsModule({ readOnly: true })
    expect(isReadOnlyMode()).toBe(true)
  })

  it('off → tools/list exposes all 18 tools', async () => {
    const { ALL_TOOLS } = await loadToolsModule({ readOnly: false })
    expect(ALL_TOOLS).toHaveLength(18)
  })

  it('on → tools/list exposes only the 8 read-only tools', async () => {
    const { ALL_TOOLS } = await loadToolsModule({ readOnly: true })
    expect(ALL_TOOLS).toHaveLength(8)
    for (const tool of ALL_TOOLS) {
      expect(tool.annotations.readOnlyHint).toBe(true)
    }
  })

  it('on → write/destructive tools are unreachable via TOOLS_BY_NAME', async () => {
    const { TOOLS_BY_NAME } = await loadToolsModule({ readOnly: true })
    expect(TOOLS_BY_NAME.has('kodena_create_script')).toBe(false)
    expect(TOOLS_BY_NAME.has('kodena_deploy_script')).toBe(false)
    expect(TOOLS_BY_NAME.has('kodena_delete_script')).toBe(false)
    // Read tools still present.
    expect(TOOLS_BY_NAME.has('kodena_whoami')).toBe(true)
    expect(TOOLS_BY_NAME.has('kodena_list_scripts')).toBe(true)
  })
})
