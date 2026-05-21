import { describe, expect, it } from 'vitest'
import { getPromptHandler, listPromptsHandler } from '../src/prompts'
import { KodenaErrorCode } from '../src/lib/errors'

describe('listPromptsHandler', () => {
  it('advertises deploy-current-project with an optional slug argument', async () => {
    const result = await listPromptsHandler()
    expect(result.prompts).toHaveLength(1)
    const prompt = result.prompts[0]!
    expect(prompt.name).toBe('deploy-current-project')
    expect(prompt.arguments).toEqual([
      { name: 'slug', description: expect.any(String), required: false },
    ])
  })
})

describe('getPromptHandler', () => {
  it('returns a single user message with the deploy walk-through', async () => {
    const result = await getPromptHandler({
      params: { name: 'deploy-current-project', arguments: {} },
    })
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0]?.role).toBe('user')
    const text = result.messages[0]!.content.text
    expect(text).toMatch(/kodena_list_scripts/)
    expect(text).toMatch(/kodena_deploy_script/)
    expect(text).toMatch(/kodena:\/\/config/)
    expect(text).toMatch(/\.open-next\/worker\.js/)
  })

  it('embeds the provided slug in the walk-through', async () => {
    const result = await getPromptHandler({
      params: { name: 'deploy-current-project', arguments: { slug: 'my-blog' } },
    })
    expect(result.messages[0]?.content.text).toMatch(/`my-blog`/)
    // The "has not named a slug" branch text only appears when no slug is given.
    expect(result.messages[0]?.content.text).not.toMatch(/has not named a slug/)
  })

  it('falls back to "ask which slug" when none is provided', async () => {
    const result = await getPromptHandler({
      params: { name: 'deploy-current-project', arguments: {} },
    })
    expect(result.messages[0]?.content.text).toMatch(/has not named a slug/)
  })

  it('throws -32602 for unknown prompts', async () => {
    await expect(
      getPromptHandler({ params: { name: 'nope', arguments: {} } }),
    ).rejects.toMatchObject({ code: KodenaErrorCode.InvalidInput })
  })
})
