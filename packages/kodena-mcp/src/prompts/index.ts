import { McpError } from '@modelcontextprotocol/sdk/types.js'
import { KodenaErrorCode } from '../lib/errors'
import {
  buildDeployCurrentProjectMessages,
  DEPLOY_CURRENT_PROJECT_NAME,
} from './deploy-current-project'

export const ALL_PROMPTS = [
  {
    name: DEPLOY_CURRENT_PROJECT_NAME,
    description:
      'Walk the agent through deploying the current project to a Kodena script. ' +
      'Confirms the active org, checks the slug exists, looks for a built ' +
      '.open-next/worker.js, and calls kodena_deploy_script with a dry-run gate.',
    arguments: [
      {
        name: 'slug',
        description: 'Optional script slug to deploy to. If omitted, the agent will ask.',
        required: false,
      },
    ],
  },
] as const

export const listPromptsHandler = async () => ({
  prompts: ALL_PROMPTS.map((p) => ({
    name: p.name,
    description: p.description,
    arguments: p.arguments,
  })),
})

export async function getPromptHandler(request: {
  params: { name: string; arguments?: Record<string, string> | undefined }
}): Promise<{
  description: string
  messages: Array<{ role: 'user'; content: { type: 'text'; text: string } }>
}> {
  const { name, arguments: args } = request.params

  if (name === DEPLOY_CURRENT_PROJECT_NAME) {
    return {
      description: ALL_PROMPTS[0].description,
      messages: buildDeployCurrentProjectMessages({ slug: args?.['slug'] }),
    }
  }

  throw new McpError(
    KodenaErrorCode.InvalidInput,
    `Unknown prompt '${name}'. Call prompts/list to see what's available.`,
  )
}
