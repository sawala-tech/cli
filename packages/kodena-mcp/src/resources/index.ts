import { McpError } from '@modelcontextprotocol/sdk/types.js'
import { loadContext } from '../lib/auth'
import { KodenaErrorCode, toMcpError } from '../lib/errors'
import { buildConfigSnapshot, CONFIG_URI } from './config'
import {
  parseScriptManifestUri,
  readScriptManifest,
  SCRIPT_MANIFEST_URI_TEMPLATE,
} from './script-manifest'

/**
 * Static resources advertised by `resources/list`. Dynamic per-slug
 * manifests live behind the resource template (resources/templates/list).
 */
export const STATIC_RESOURCES = [
  {
    uri: CONFIG_URI,
    name: 'Kodena config',
    description:
      'Merged view of ~/.kodena/credentials + ~/.kodena/config + env overrides, with ' +
      'the bearer token redacted. Use this to confirm the server\'s active org, project, ' +
      'and token scope without making a network call.',
    mimeType: 'application/json',
  },
] as const

export const RESOURCE_TEMPLATES = [
  {
    uriTemplate: SCRIPT_MANIFEST_URI_TEMPLATE,
    name: 'Script manifest',
    description:
      'Read-only snapshot of a deployed script\'s row, including its asset manifest. ' +
      'Replace {slug} with the script slug (e.g. kodena://scripts/my-blog/manifest).',
    mimeType: 'application/json',
  },
] as const

export const listResourcesHandler = async () => ({
  resources: STATIC_RESOURCES.map((r) => ({
    uri: r.uri,
    name: r.name,
    description: r.description,
    mimeType: r.mimeType,
  })),
})

export const listResourceTemplatesHandler = async () => ({
  resourceTemplates: RESOURCE_TEMPLATES.map((t) => ({
    uriTemplate: t.uriTemplate,
    name: t.name,
    description: t.description,
    mimeType: t.mimeType,
  })),
})

export async function readResourceHandler(request: {
  params: { uri: string }
}): Promise<{
  contents: Array<{ uri: string; mimeType: string; text: string }>
}> {
  const { uri } = request.params

  try {
    if (uri === CONFIG_URI) {
      const snapshot = await buildConfigSnapshot()
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(snapshot, null, 2),
          },
        ],
      }
    }

    const manifestMatch = parseScriptManifestUri(uri)
    if (manifestMatch) {
      const ctx = await loadContext()
      const manifest = await readScriptManifest(manifestMatch.slug, ctx)
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(manifest, null, 2),
          },
        ],
      }
    }

    throw new McpError(
      KodenaErrorCode.NotFound,
      `Unknown resource '${uri}'. Call resources/list and resources/templates/list to see what's available.`,
    )
  } catch (err) {
    throw toMcpError(err)
  }
}
