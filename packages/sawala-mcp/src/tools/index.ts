import type { ToolDefinition } from './types'
import { berkasnaGetAssetTool } from './berkasna-get-asset'
import { berkasnaListAssetsTool } from './berkasna-list-assets'
import { formulirGetFormTool } from './formulir-get-form'
import { formulirGetSubmissionTool } from './formulir-get-submission'
import { formulirListFormsTool } from './formulir-list-forms'
import { formulirListSubmissionsTool } from './formulir-list-submissions'
import { kontenaCreateEntryTool } from './kontena-create-entry'
import { kontenaCreateSchemaTool } from './kontena-create-schema'
import { kontenaDeleteEntryTool } from './kontena-delete-entry'
import { kontenaDeleteSchemaTool } from './kontena-delete-schema'
import { kontenaGetEntryTool } from './kontena-get-entry'
import { kontenaGetSchemaTool } from './kontena-get-schema'
import { kontenaListEntriesTool } from './kontena-list-entries'
import { kontenaListSchemasTool } from './kontena-list-schemas'
import { kontenaPublishEntryTool } from './kontena-publish-entry'
import { kontenaUnpublishEntryTool } from './kontena-unpublish-entry'
import { kontenaUpdateEntryTool } from './kontena-update-entry'
import { kontenaUpdateSchemaTool } from './kontena-update-schema'
import { whoamiTool } from './whoami'

/**
 * Every tool the server registers. The order is the order `tools/list`
 * returns and the order hosts surface in their UI.
 */
export const ALL_TOOLS: ReadonlyArray<ToolDefinition<unknown>> = [
  whoamiTool,
  kontenaListSchemasTool,
  kontenaGetSchemaTool,
  kontenaCreateSchemaTool,
  kontenaUpdateSchemaTool,
  kontenaDeleteSchemaTool,
  kontenaListEntriesTool,
  kontenaGetEntryTool,
  kontenaCreateEntryTool,
  kontenaUpdateEntryTool,
  kontenaDeleteEntryTool,
  kontenaPublishEntryTool,
  kontenaUnpublishEntryTool,
  formulirListFormsTool,
  formulirGetFormTool,
  formulirListSubmissionsTool,
  formulirGetSubmissionTool,
  berkasnaListAssetsTool,
  berkasnaGetAssetTool,
] as ReadonlyArray<ToolDefinition<unknown>>

export const TOOLS_BY_NAME: ReadonlyMap<string, ToolDefinition<unknown>> = new Map(
  ALL_TOOLS.map((t) => [t.name, t]),
)
