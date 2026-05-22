import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { zodParser, type ToolDefinition, type ToolInputSchema } from './types'

interface AssetRow {
  id: string
  originalName: string | null
  mimeType: string
  size: number
  status: string
  publicUrl: string | null
  createdAt: string
  [k: string]: unknown
}

interface AssetListResponse {
  items: AssetRow[]
  hasMore: boolean
  nextCursor: string | null
}

const inputZod = z
  .object({
    kind: z.enum(['image', 'pdf', 'video', 'audio', 'all']).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
    projectId: z.string().optional(),
  })
  .strict()

type Input = z.infer<typeof inputZod>

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: ['image', 'pdf', 'video', 'audio', 'all'],
      description:
        'Filter by asset kind. `image` matches `image/*`, `pdf` matches ' +
        '`application/pdf`, `video` matches `video/*`, `audio` matches ' +
        '`audio/*`. `all` (or omit) returns every kind.',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      description: 'Page size (default 25, max 100). The Berkasna API caps at 100.',
    },
    cursor: {
      type: 'string',
      description: 'Opaque cursor returned by a previous page.',
    },
    projectId: {
      type: 'string',
      description:
        'Optional project filter. By default this tool returns assets across ' +
        'the entire active org; pass an explicit project id to scope down.',
    },
  },
  additionalProperties: false,
}

function kindToMimeCategory(kind: Input['kind']): string | null {
  if (kind === undefined || kind === 'all') return null
  if (kind === 'pdf') return 'application/pdf'
  return kind
}

export const berkasnaListAssetsTool: ToolDefinition<Input> = {
  name: 'sawala_berkasna_list_assets',
  description:
    'List Berkasna assets in the active org. In Sawala, an *asset* is an ' +
    'uploaded file (image, PDF, video, audio, etc.) tracked by Berkasna, the ' +
    'file/media metadata service. This tool returns *metadata only* — it does ' +
    'NOT download bytes. To fetch an asset\'s actual content, GET its ' +
    '`publicUrl` (served from https://berkasna.sawala.cloud). Berkasna ' +
    'routes are org-scoped; the active project from the CLI context is sent ' +
    'as a header but is NOT used as a filter unless you pass `projectId` ' +
    'explicitly.',
  inputSchema,
  annotations: { title: 'List Berkasna assets', readOnlyHint: true },
  parseInput: zodParser(inputZod),
  async handle(input: Input, ctx: CliContext) {
    const limit = input.limit ?? 25
    const mimeCategory = kindToMimeCategory(input.kind)

    const params = new URLSearchParams()
    params.set('limit', String(limit))
    if (input.cursor) params.set('cursor', input.cursor)
    if (mimeCategory) params.set('mimeCategory', mimeCategory)
    if (input.projectId) params.set('projectId', input.projectId)

    const result = await apiFetch<AssetListResponse>(
      ctx,
      `/cli/berkasna/assets?${params.toString()}`,
    )

    return {
      activeOrg: ctx.activeOrg,
      activeProject: ctx.activeProject,
      assets: result.items.map((a) => ({
        id: a.id,
        originalName: a.originalName,
        mimeType: a.mimeType,
        size: a.size,
        status: a.status,
        publicUrl: a.publicUrl,
        createdAt: a.createdAt,
      })),
      pagination: {
        limit,
        hasMore: result.hasMore,
        nextCursor: result.nextCursor,
      },
    }
  },
}
