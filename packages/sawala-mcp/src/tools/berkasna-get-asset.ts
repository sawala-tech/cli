import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { zodParser, type ToolDefinition, type ToolInputSchema } from './types'

interface AssetRow {
  id: string
  orgId: string
  filename: string
  mimeType: string
  size: number
  status: string
  fileHash: string | null
  r2Key: string
  url: string
  createdAt: string
  updatedAt: string
  [k: string]: unknown
}

const inputZod = z
  .object({
    id: z.string().min(1),
  })
  .strict()

type Input = z.infer<typeof inputZod>

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      description: 'Asset ULID. Berkasna assets are identified by id only (no slug).',
    },
  },
  required: ['id'],
  additionalProperties: false,
}

export const berkasnaGetAssetTool: ToolDefinition<Input> = {
  name: 'sawala_berkasna_get_asset',
  description:
    'Fetch one Berkasna asset by ULID. In Sawala, an *asset* is an uploaded ' +
    'file (image, PDF, video, audio, etc.) tracked by Berkasna, the file/media ' +
    'metadata service. This tool returns *metadata only* — it does NOT download ' +
    "bytes. To fetch the actual content, GET the asset's `url` (served " +
    'from https://berkasna.sawala.cloud).',
  inputSchema,
  annotations: { title: 'Get Berkasna asset', readOnlyHint: true },
  parseInput: zodParser(inputZod),
  async handle(input: Input, ctx: CliContext) {
    return await apiFetch<AssetRow>(
      ctx,
      `/cli/berkasna/assets/${encodeURIComponent(input.id)}`,
    )
  },
}
