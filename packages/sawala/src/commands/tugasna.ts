import { Command } from 'commander'
import {
  SAWALA_BRAND,
  apiFetch,
  loadContext,
  requireActiveOrg,
  requireActiveProject,
  requireActiveProjectId,
} from '@sawala/auth'
import { readFile, writeFile } from 'node:fs/promises'
import { confirmOrThrow, resolveInputPayload } from '../lib/io'

/**
 * Tugasna is the work-tracking product in the Sawala suite: boards with
 * ordered statuses (columns), items placed on those boards, a project-level
 * backlog of unplaced items, and per-item comments. This CLI surface covers
 * the dashboard/CLI bearer surface forwarded via the gateway's
 * `/cli/tugasna/*` prefix.
 *
 * Tugasna is project-scoped: the worker resolves `:projId` in the URL path as
 * the project's stable ULID — not its slug. So every URL below is built from
 * `ctx.activeProjectId`, which `sawala project use <slug>` persists alongside
 * the slug.
 *
 * This is the core-CRUD pass: boards (+ statuses, archive), board items
 * (+ move), the backlog (+ place/unplace), comments, plus reads for tags and
 * the timeline. Labels, custom fields, checklists and assignee-labels are left
 * for a follow-up.
 */

interface BoardRow {
  id: string
  slug: string
  name: string
  archivedAt?: number | null
  [k: string]: unknown
}

interface ItemRow {
  id: string
  title: string
  statusId?: string | null
  [k: string]: unknown
}

interface CanvasRow {
  id: string
  title: string
  content?: string
  revision: number
  [k: string]: unknown
}

interface TagRow {
  id: string
  name: string
  [k: string]: unknown
}

function projectBase(projectId: string): string {
  return `/cli/tugasna/projects/${encodeURIComponent(projectId)}`
}

function boardsBase(projectId: string): string {
  return `${projectBase(projectId)}/boards`
}

function boardItemsBase(projectId: string, boardId: string): string {
  return `${boardsBase(projectId)}/${encodeURIComponent(boardId)}/items`
}

function statusesBase(projectId: string, boardId: string): string {
  return `${boardsBase(projectId)}/${encodeURIComponent(boardId)}/statuses`
}

function commentsBase(projectId: string, itemId: string): string {
  return `${projectBase(projectId)}/items/${encodeURIComponent(itemId)}/comments`
}

function canvasesBase(projectId: string): string {
  return `${projectBase(projectId)}/canvases`
}

function canvasBase(projectId: string, canvasId: string): string {
  return `${canvasesBase(projectId)}/${encodeURIComponent(canvasId)}`
}

function itemCanvasesBase(projectId: string, itemId: string): string {
  return `${projectBase(projectId)}/items/${encodeURIComponent(itemId)}/canvases`
}

function canvasFoldersBase(projectId: string): string {
  return `${projectBase(projectId)}/canvas-folders`
}

/** Read raw UTF-8 text from stdin — the markdown counterpart to readJsonInput. */
async function readStdinText(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer))
  }
  return Buffer.concat(chunks).toString('utf8')
}

function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n')
}

// Every write command resolves org + project the same way; centralise it so
// each action stays a couple of lines.
async function projectContext(): Promise<{ ctx: Awaited<ReturnType<typeof loadContext>>; projectId: string; activeProject: string }> {
  const ctx = await loadContext(SAWALA_BRAND)
  requireActiveOrg(ctx, SAWALA_BRAND)
  const activeProject = requireActiveProject(ctx, SAWALA_BRAND)
  const projectId = requireActiveProjectId(ctx, SAWALA_BRAND)
  return { ctx, projectId, activeProject }
}

export function createTugasnaCommand(): Command {
  const tugasna = new Command('tugasna').description(
    'Tugasna work-tracking commands (boards, items, backlog, comments).',
  )

  // ── boards ──────────────────────────────────────────────────────────────
  const board = new Command('board').description(
    'Manage Tugasna boards (list, get, create, update, delete, archive) and their statuses.',
  )

  board
    .command('list')
    .description('List boards in the active project. --archived shows only archived boards.')
    .option('--archived', 'List archived boards instead of active ones.')
    .action(async (opts: { archived?: boolean }) => {
      const { ctx, projectId, activeProject } = await projectContext()
      const qs = opts.archived ? '?archived=true' : ''
      const rows = await apiFetch<BoardRow[]>(ctx, `${boardsBase(projectId)}${qs}`)
      if (rows.length === 0) {
        process.stdout.write(`No ${opts.archived ? 'archived ' : ''}boards in '${activeProject}'.\n`)
        return
      }
      for (const b of rows) {
        process.stdout.write(`${b.id.padEnd(38)} ${b.slug.padEnd(24)} ${b.name}\n`)
      }
    })

  board
    .command('get <boardId>')
    .description('Fetch one board with its statuses, fields and labels.')
    .action(async (boardId: string) => {
      const { ctx, projectId } = await projectContext()
      printJson(await apiFetch<unknown>(ctx, `${boardsBase(projectId)}/${encodeURIComponent(boardId)}`))
    })

  board
    .command('create')
    .description('Create a board (seeds default statuses). Body: { name, description?, color?, startDate?, endDate? }.')
    .option('-f, --file <path>', "Read JSON body from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline JSON body.')
    .option('--dry-run', 'Validate and print the payload without writing.')
    .action(async (opts: { file?: string; data?: string; dryRun?: boolean }) => {
      const { ctx, projectId } = await projectContext()
      const body = await resolveInputPayload(opts)
      if (opts.dryRun) {
        printJson({ wouldSend: { method: 'POST', body } })
        return
      }
      printJson(await apiFetch<unknown>(ctx, boardsBase(projectId), { method: 'POST', body }))
    })

  board
    .command('update <boardId>')
    .description('Update a board (PATCH). Body: any subset of { name, description, color, startDate, endDate }.')
    .option('-f, --file <path>', "Read JSON body from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline JSON body.')
    .option('--dry-run', 'Validate and print the payload without writing.')
    .action(async (boardId: string, opts: { file?: string; data?: string; dryRun?: boolean }) => {
      const { ctx, projectId } = await projectContext()
      const body = await resolveInputPayload(opts)
      if (opts.dryRun) {
        printJson({ wouldSend: { method: 'PATCH', body } })
        return
      }
      printJson(
        await apiFetch<unknown>(ctx, `${boardsBase(projectId)}/${encodeURIComponent(boardId)}`, {
          method: 'PATCH',
          body,
        }),
      )
    })

  board
    .command('delete <boardId>')
    .description('Delete a board and everything on it. Requires --yes or a TTY for confirmation.')
    .option('-y, --yes', 'Skip the confirmation prompt.')
    .action(async (boardId: string, opts: { yes?: boolean }) => {
      const { ctx, projectId } = await projectContext()
      if (!opts.yes) {
        await confirmOrThrow(`Delete board '${boardId}' and all its items?`)
      }
      printJson(
        await apiFetch<unknown>(ctx, `${boardsBase(projectId)}/${encodeURIComponent(boardId)}`, {
          method: 'DELETE',
        }),
      )
    })

  board
    .command('archive <boardId>')
    .description('Archive a board (hides it from the default list).')
    .action(async (boardId: string) => {
      const { ctx, projectId } = await projectContext()
      printJson(
        await apiFetch<unknown>(ctx, `${boardsBase(projectId)}/${encodeURIComponent(boardId)}/archive`, {
          method: 'POST',
        }),
      )
    })

  board
    .command('unarchive <boardId>')
    .description('Unarchive a board.')
    .action(async (boardId: string) => {
      const { ctx, projectId } = await projectContext()
      printJson(
        await apiFetch<unknown>(ctx, `${boardsBase(projectId)}/${encodeURIComponent(boardId)}/unarchive`, {
          method: 'POST',
        }),
      )
    })

  // board status ───────────────────────────────────────────────────────────
  const status = new Command('status').description(
    'Manage a board’s statuses/columns (create, update, delete, reorder).',
  )

  status
    .command('create <boardId>')
    .description('Add a status/column. Body: { name, color? }.')
    .option('-f, --file <path>', "Read JSON body from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline JSON body.')
    .option('--dry-run', 'Validate and print the payload without writing.')
    .action(async (boardId: string, opts: { file?: string; data?: string; dryRun?: boolean }) => {
      const { ctx, projectId } = await projectContext()
      const body = await resolveInputPayload(opts)
      if (opts.dryRun) {
        printJson({ wouldSend: { method: 'POST', body } })
        return
      }
      printJson(await apiFetch<unknown>(ctx, statusesBase(projectId, boardId), { method: 'POST', body }))
    })

  status
    .command('update <boardId> <statusId>')
    .description('Update a status/column (PATCH). Body: any subset of { name, color }.')
    .option('-f, --file <path>', "Read JSON body from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline JSON body.')
    .option('--dry-run', 'Validate and print the payload without writing.')
    .action(async (boardId: string, statusId: string, opts: { file?: string; data?: string; dryRun?: boolean }) => {
      const { ctx, projectId } = await projectContext()
      const body = await resolveInputPayload(opts)
      if (opts.dryRun) {
        printJson({ wouldSend: { method: 'PATCH', body } })
        return
      }
      printJson(
        await apiFetch<unknown>(ctx, `${statusesBase(projectId, boardId)}/${encodeURIComponent(statusId)}`, {
          method: 'PATCH',
          body,
        }),
      )
    })

  status
    .command('delete <boardId> <statusId>')
    .description('Delete a status/column. Requires --yes or a TTY for confirmation.')
    .option('-y, --yes', 'Skip the confirmation prompt.')
    .action(async (boardId: string, statusId: string, opts: { yes?: boolean }) => {
      const { ctx, projectId } = await projectContext()
      if (!opts.yes) {
        await confirmOrThrow(`Delete status '${statusId}' from board '${boardId}'?`)
      }
      printJson(
        await apiFetch<unknown>(ctx, `${statusesBase(projectId, boardId)}/${encodeURIComponent(statusId)}`, {
          method: 'DELETE',
        }),
      )
    })

  status
    .command('reorder <boardId>')
    .description('Reorder a board’s statuses. Body: { statusIds: [id, …] } in the desired order.')
    .option('-f, --file <path>', "Read JSON body from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline JSON body.')
    .option('--dry-run', 'Validate and print the payload without writing.')
    .action(async (boardId: string, opts: { file?: string; data?: string; dryRun?: boolean }) => {
      const { ctx, projectId } = await projectContext()
      const body = await resolveInputPayload(opts)
      if (opts.dryRun) {
        printJson({ wouldSend: { method: 'POST', body } })
        return
      }
      printJson(
        await apiFetch<unknown>(ctx, `${statusesBase(projectId, boardId)}/reorder`, { method: 'POST', body }),
      )
    })

  board.addCommand(status)
  tugasna.addCommand(board)

  // ── items (board-scoped) ─────────────────────────────────────────────────
  const item = new Command('item').description(
    'Manage items on a board (list, get, create, update, delete, move).',
  )

  item
    .command('list <boardId>')
    .description('List items on a board. --status filters by status id; --assignee by assignee.')
    .option('--status <statusId>', 'Filter by status/column id.')
    .option('--assignee <assignee>', 'Filter by assignee membership.')
    .action(async (boardId: string, opts: { status?: string; assignee?: string }) => {
      const { ctx, projectId } = await projectContext()
      const params = new URLSearchParams()
      if (opts.status) params.set('status', opts.status)
      if (opts.assignee) params.set('assignee', opts.assignee)
      const qs = params.toString() ? `?${params.toString()}` : ''
      const rows = await apiFetch<ItemRow[]>(ctx, `${boardItemsBase(projectId, boardId)}${qs}`)
      if (rows.length === 0) {
        process.stdout.write(`No items on board '${boardId}'.\n`)
        return
      }
      for (const i of rows) {
        process.stdout.write(`${i.id.padEnd(38)} ${(i.statusId ?? '').padEnd(38)} ${i.title}\n`)
      }
    })

  item
    .command('get <boardId> <itemId>')
    .description('Fetch one item on a board.')
    .action(async (boardId: string, itemId: string) => {
      const { ctx, projectId } = await projectContext()
      printJson(
        await apiFetch<unknown>(
          ctx,
          `${boardItemsBase(projectId, boardId)}/${encodeURIComponent(itemId)}`,
        ),
      )
    })

  item
    .command('create <boardId>')
    .description('Create an item on a board. Body: { title, description?, statusId?, assignees?, startDate?, dueDate? }. Dates are epoch-ms numbers, not date strings.')
    .option('-f, --file <path>', "Read JSON body from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline JSON body.')
    .option('--dry-run', 'Validate and print the payload without writing.')
    .action(async (boardId: string, opts: { file?: string; data?: string; dryRun?: boolean }) => {
      const { ctx, projectId } = await projectContext()
      const body = await resolveInputPayload(opts)
      if (opts.dryRun) {
        printJson({ wouldSend: { method: 'POST', body } })
        return
      }
      printJson(await apiFetch<unknown>(ctx, boardItemsBase(projectId, boardId), { method: 'POST', body }))
    })

  item
    .command('update <boardId> <itemId>')
    .description('Update an item (PATCH). Body: any subset of { title, description, startDate, dueDate }. Dates are epoch-ms numbers (or null to clear).')
    .option('-f, --file <path>', "Read JSON body from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline JSON body.')
    .option('--dry-run', 'Validate and print the payload without writing.')
    .action(async (boardId: string, itemId: string, opts: { file?: string; data?: string; dryRun?: boolean }) => {
      const { ctx, projectId } = await projectContext()
      const body = await resolveInputPayload(opts)
      if (opts.dryRun) {
        printJson({ wouldSend: { method: 'PATCH', body } })
        return
      }
      printJson(
        await apiFetch<unknown>(
          ctx,
          `${boardItemsBase(projectId, boardId)}/${encodeURIComponent(itemId)}`,
          { method: 'PATCH', body },
        ),
      )
    })

  item
    .command('delete <boardId> <itemId>')
    .description('Delete an item. Requires --yes or a TTY for confirmation.')
    .option('-y, --yes', 'Skip the confirmation prompt.')
    .action(async (boardId: string, itemId: string, opts: { yes?: boolean }) => {
      const { ctx, projectId } = await projectContext()
      if (!opts.yes) {
        await confirmOrThrow(`Delete item '${itemId}' from board '${boardId}'?`)
      }
      printJson(
        await apiFetch<unknown>(
          ctx,
          `${boardItemsBase(projectId, boardId)}/${encodeURIComponent(itemId)}`,
          { method: 'DELETE' },
        ),
      )
    })

  item
    .command('move <boardId> <itemId>')
    .description('Move/reorder an item within or across statuses. Body: { statusId, position } (both required; position is a 0-based index).')
    .option('-f, --file <path>', "Read JSON body from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline JSON body.')
    .option('--dry-run', 'Validate and print the payload without writing.')
    .action(async (boardId: string, itemId: string, opts: { file?: string; data?: string; dryRun?: boolean }) => {
      const { ctx, projectId } = await projectContext()
      const body = await resolveInputPayload(opts)
      if (opts.dryRun) {
        printJson({ wouldSend: { method: 'POST', body } })
        return
      }
      printJson(
        await apiFetch<unknown>(
          ctx,
          `${boardItemsBase(projectId, boardId)}/${encodeURIComponent(itemId)}/move`,
          { method: 'POST', body },
        ),
      )
    })

  tugasna.addCommand(item)

  // ── backlog (project-scoped, unplaced items) ─────────────────────────────
  const backlog = new Command('backlog').description(
    'Manage the project backlog pool (list, create, get, update, children, place, unplace).',
  )

  backlog
    .command('list')
    .description('List the project backlog (unplaced items).')
    .action(async () => {
      const { ctx, projectId } = await projectContext()
      printJson(await apiFetch<unknown>(ctx, `${projectBase(projectId)}/backlog`))
    })

  backlog
    .command('create')
    .description('Create a backlog item (project-level, no board). Body: { title, description?, parentId? }.')
    .option('-f, --file <path>', "Read JSON body from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline JSON body.')
    .option('--dry-run', 'Validate and print the payload without writing.')
    .action(async (opts: { file?: string; data?: string; dryRun?: boolean }) => {
      const { ctx, projectId } = await projectContext()
      const body = await resolveInputPayload(opts)
      if (opts.dryRun) {
        printJson({ wouldSend: { method: 'POST', body } })
        return
      }
      printJson(await apiFetch<unknown>(ctx, `${projectBase(projectId)}/items`, { method: 'POST', body }))
    })

  backlog
    .command('get <itemId>')
    .description('Fetch one item by id (project-scoped, board or backlog).')
    .action(async (itemId: string) => {
      const { ctx, projectId } = await projectContext()
      printJson(
        await apiFetch<unknown>(ctx, `${projectBase(projectId)}/items/${encodeURIComponent(itemId)}`),
      )
    })

  backlog
    .command('update <itemId>')
    .description('Update a project item (PATCH). Body: any subset of the item fields.')
    .option('-f, --file <path>', "Read JSON body from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline JSON body.')
    .option('--dry-run', 'Validate and print the payload without writing.')
    .action(async (itemId: string, opts: { file?: string; data?: string; dryRun?: boolean }) => {
      const { ctx, projectId } = await projectContext()
      const body = await resolveInputPayload(opts)
      if (opts.dryRun) {
        printJson({ wouldSend: { method: 'PATCH', body } })
        return
      }
      printJson(
        await apiFetch<unknown>(ctx, `${projectBase(projectId)}/items/${encodeURIComponent(itemId)}`, {
          method: 'PATCH',
          body,
        }),
      )
    })

  backlog
    .command('children <itemId>')
    .description('List the child items of an item (sub-items).')
    .action(async (itemId: string) => {
      const { ctx, projectId } = await projectContext()
      printJson(
        await apiFetch<unknown>(
          ctx,
          `${projectBase(projectId)}/items/${encodeURIComponent(itemId)}/children`,
        ),
      )
    })

  backlog
    .command('place <itemId>')
    .description('Place a backlog item onto a board. Body: { boardId, statusId, position? } (boardId and statusId required).')
    .option('-f, --file <path>', "Read JSON body from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline JSON body.')
    .option('--dry-run', 'Validate and print the payload without writing.')
    .action(async (itemId: string, opts: { file?: string; data?: string; dryRun?: boolean }) => {
      const { ctx, projectId } = await projectContext()
      const body = await resolveInputPayload(opts)
      if (opts.dryRun) {
        printJson({ wouldSend: { method: 'POST', body } })
        return
      }
      printJson(
        await apiFetch<unknown>(
          ctx,
          `${projectBase(projectId)}/items/${encodeURIComponent(itemId)}/place`,
          { method: 'POST', body },
        ),
      )
    })

  backlog
    .command('unplace <itemId>')
    .description('Return a placed item to the backlog (removes it from its board).')
    .action(async (itemId: string) => {
      const { ctx, projectId } = await projectContext()
      printJson(
        await apiFetch<unknown>(
          ctx,
          `${projectBase(projectId)}/items/${encodeURIComponent(itemId)}/unplace`,
          { method: 'POST' },
        ),
      )
    })

  tugasna.addCommand(backlog)

  // ── comments (item-scoped) ───────────────────────────────────────────────
  const comment = new Command('comment').description(
    'Manage comments on an item (list, create, update, delete).',
  )

  comment
    .command('list <itemId>')
    .description('List comments on an item.')
    .action(async (itemId: string) => {
      const { ctx, projectId } = await projectContext()
      printJson(await apiFetch<unknown>(ctx, commentsBase(projectId, itemId)))
    })

  comment
    .command('create <itemId>')
    .description('Add a comment to an item. Body: { text } (the comment text; add { parentId } to reply).')
    .option('-f, --file <path>', "Read JSON body from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline JSON body.')
    .option('--dry-run', 'Validate and print the payload without writing.')
    .action(async (itemId: string, opts: { file?: string; data?: string; dryRun?: boolean }) => {
      const { ctx, projectId } = await projectContext()
      const body = await resolveInputPayload(opts)
      if (opts.dryRun) {
        printJson({ wouldSend: { method: 'POST', body } })
        return
      }
      printJson(await apiFetch<unknown>(ctx, commentsBase(projectId, itemId), { method: 'POST', body }))
    })

  comment
    .command('update <itemId> <commentId>')
    .description('Edit a comment (PATCH). Body: { text }.')
    .option('-f, --file <path>', "Read JSON body from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline JSON body.')
    .option('--dry-run', 'Validate and print the payload without writing.')
    .action(async (itemId: string, commentId: string, opts: { file?: string; data?: string; dryRun?: boolean }) => {
      const { ctx, projectId } = await projectContext()
      const body = await resolveInputPayload(opts)
      if (opts.dryRun) {
        printJson({ wouldSend: { method: 'PATCH', body } })
        return
      }
      printJson(
        await apiFetch<unknown>(
          ctx,
          `${commentsBase(projectId, itemId)}/${encodeURIComponent(commentId)}`,
          { method: 'PATCH', body },
        ),
      )
    })

  comment
    .command('delete <itemId> <commentId>')
    .description('Delete a comment. Requires --yes or a TTY for confirmation.')
    .option('-y, --yes', 'Skip the confirmation prompt.')
    .action(async (itemId: string, commentId: string, opts: { yes?: boolean }) => {
      const { ctx, projectId } = await projectContext()
      if (!opts.yes) {
        await confirmOrThrow(`Delete comment '${commentId}' on item '${itemId}'?`)
      }
      printJson(
        await apiFetch<unknown>(
          ctx,
          `${commentsBase(projectId, itemId)}/${encodeURIComponent(commentId)}`,
          { method: 'DELETE' },
        ),
      )
    })

  tugasna.addCommand(comment)

  // ── canvas (project-scoped documents) ────────────────────────────────────
  //
  // A canvas is a long-form markdown document that belongs to the PROJECT, not
  // to a task: tasks and boards reference one, and it outlives all of them.
  //
  // `pull` and `push` are the only commands in this file whose payload is RAW
  // TEXT rather than JSON, and that is the whole point of storing a canvas as
  // markdown — it can be pulled to a .md file, edited with ordinary tools (or
  // read by a coding agent as a specification), and pushed back.
  const canvas = new Command('canvas').description(
    'Project documents (list, pull/push markdown, link to tasks, history, folders).',
  )

  canvas
    .command('list')
    .description("List the project's documents.")
    .option('--q <text>', 'Filter by title.')
    .option('--folder <folderId>', "Folder id, or 'root' for unfiled documents.")
    .option('--archived', 'Include archived documents.')
    .option('--limit <n>', 'Maximum rows (default 50, max 200).')
    .action(async (opts: { q?: string; folder?: string; archived?: boolean; limit?: string }) => {
      const { ctx, projectId } = await projectContext()
      const params = new URLSearchParams()
      if (opts.q) params.set('q', opts.q)
      if (opts.folder) params.set('folderId', opts.folder)
      if (opts.archived) params.set('includeArchived', 'true')
      if (opts.limit) params.set('limit', opts.limit)
      const qs = params.toString()
      printJson(await apiFetch<unknown>(ctx, `${canvasesBase(projectId)}${qs ? `?${qs}` : ''}`))
    })

  canvas
    .command('create')
    .description('Create a document. Body: { title?, content?, folderId? }.')
    .option('--title <title>', 'Shorthand for { title }.')
    .option('-f, --file <path>', "Read JSON body from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline JSON body.')
    .option('--dry-run', 'Validate and print the payload without writing.')
    .action(async (opts: { title?: string; file?: string; data?: string; dryRun?: boolean }) => {
      const { ctx, projectId } = await projectContext()
      const body =
        opts.file || opts.data
          ? await resolveInputPayload(opts)
          : { title: opts.title ?? 'Untitled' }
      if (opts.dryRun) {
        printJson({ wouldSend: { method: 'POST', body } })
        return
      }
      printJson(await apiFetch<unknown>(ctx, canvasesBase(projectId), { method: 'POST', body }))
    })

  canvas
    .command('get <canvasId>')
    .description('Print one document as JSON, including its content.')
    .action(async (canvasId: string) => {
      const { ctx, projectId } = await projectContext()
      printJson(await apiFetch<unknown>(ctx, canvasBase(projectId, canvasId)))
    })

  canvas
    .command('pull <canvasId>')
    .description('Write a document to a markdown file (or stdout when -o is omitted).')
    .option('-o, --out <path>', 'Destination file. Omit to write to stdout.')
    .action(async (canvasId: string, opts: { out?: string }) => {
      const { ctx, projectId } = await projectContext()
      const doc = await apiFetch<CanvasRow>(ctx, canvasBase(projectId, canvasId))
      const content = doc.content ?? ''
      if (opts.out) {
        await writeFile(opts.out, content, 'utf8')
      } else {
        process.stdout.write(content.endsWith('\n') ? content : `${content}\n`)
      }
      // Metadata goes to STDERR so a pipeline capturing stdout receives only
      // the document itself.
      process.stderr.write(`${doc.id}  rev ${doc.revision}  ${doc.title}\n`)
    })

  canvas
    .command('push <canvasId>')
    .description('Write a markdown file back to a document (PUT).')
    .option('-f, --file <path>', "Markdown file to send. Use '-' for stdin.")
    .option('--title <title>', 'Also rename the document.')
    .option('--revision <n>', 'Base revision. Omit to read the current one first.')
    .option('--force', 'Overwrite unconditionally, ignoring concurrent edits.')
    .option('--dry-run', 'Validate and print the payload without writing.')
    .action(
      async (
        canvasId: string,
        opts: {
          file?: string
          title?: string
          revision?: string
          force?: boolean
          dryRun?: boolean
        },
      ) => {
        const { ctx, projectId } = await projectContext()
        if (!opts.file) throw new Error('Provide the markdown to push with -f <path> (or -f -).')
        // Raw text, deliberately NOT resolveInputPayload — that parses JSON.
        const content = opts.file === '-' ? await readStdinText() : await readFile(opts.file, 'utf8')

        let expectedRevision: number | undefined
        if (!opts.force) {
          if (opts.revision !== undefined) {
            expectedRevision = Number(opts.revision)
          } else {
            // Read the current revision so an unattended push is still guarded
            // against a concurrent edit rather than silently clobbering it.
            const current = await apiFetch<CanvasRow>(ctx, canvasBase(projectId, canvasId))
            expectedRevision = current.revision
          }
        }
        const body = {
          content,
          ...(opts.title ? { title: opts.title } : {}),
          ...(expectedRevision !== undefined ? { expectedRevision } : {}),
        }
        if (opts.dryRun) {
          printJson({ wouldSend: { method: 'PUT', body } })
          return
        }
        printJson(
          await apiFetch<unknown>(ctx, canvasBase(projectId, canvasId), { method: 'PUT', body }),
        )
      },
    )

  canvas
    .command('move <canvasId>')
    .description('File a document into a folder.')
    .option('--folder <folderId>', 'Target folder id.')
    .option('--root', 'Move to the project root instead.')
    .action(async (canvasId: string, opts: { folder?: string; root?: boolean }) => {
      const { ctx, projectId } = await projectContext()
      if (!opts.folder && !opts.root) throw new Error('Pass --folder <folderId> or --root.')
      const body = { folderId: opts.root ? null : opts.folder }
      printJson(
        await apiFetch<unknown>(ctx, canvasBase(projectId, canvasId), { method: 'PATCH', body }),
      )
    })

  canvas
    .command('link <itemId> <canvasId>')
    .description('Reference a document from a task.')
    .action(async (itemId: string, canvasId: string) => {
      const { ctx, projectId } = await projectContext()
      printJson(
        await apiFetch<unknown>(ctx, itemCanvasesBase(projectId, itemId), {
          method: 'POST',
          body: { canvasId },
        }),
      )
    })

  canvas
    .command('unlink <itemId> <canvasId>')
    .description("Remove a task's reference. The DOCUMENT IS NOT DELETED.")
    .option('-y, --yes', 'Skip the confirmation prompt.')
    .action(async (itemId: string, canvasId: string, opts: { yes?: boolean }) => {
      const { ctx, projectId } = await projectContext()
      if (!opts.yes) {
        await confirmOrThrow(
          `Remove the reference to '${canvasId}' from item '${itemId}'? The document stays in the project.`,
        )
      }
      printJson(
        await apiFetch<unknown>(
          ctx,
          `${itemCanvasesBase(projectId, itemId)}/${encodeURIComponent(canvasId)}`,
          { method: 'DELETE' },
        ),
      )
    })

  canvas
    .command('links <canvasId>')
    .description('Show which tasks and boards reference a document.')
    .action(async (canvasId: string) => {
      const { ctx, projectId } = await projectContext()
      printJson(await apiFetch<unknown>(ctx, `${canvasBase(projectId, canvasId)}/links`))
    })

  canvas
    .command('history <canvasId>')
    .description('List past revisions, newest first.')
    .action(async (canvasId: string) => {
      const { ctx, projectId } = await projectContext()
      printJson(await apiFetch<unknown>(ctx, `${canvasBase(projectId, canvasId)}/versions`))
    })

  canvas
    .command('restore <canvasId> <versionId>')
    .description('Restore a past revision. Written as a NEW revision; history is kept.')
    .option('-y, --yes', 'Skip the confirmation prompt.')
    .action(async (canvasId: string, versionId: string, opts: { yes?: boolean }) => {
      const { ctx, projectId } = await projectContext()
      if (!opts.yes) {
        await confirmOrThrow(`Restore version '${versionId}' of canvas '${canvasId}'?`)
      }
      printJson(
        await apiFetch<unknown>(
          ctx,
          `${canvasBase(projectId, canvasId)}/versions/${encodeURIComponent(versionId)}/restore`,
          { method: 'POST', body: {} },
        ),
      )
    })

  canvas
    .command('delete <canvasId>')
    .description('Delete a document, its history AND every reference to it.')
    .option('-y, --yes', 'Skip the confirmation prompt.')
    .action(async (canvasId: string, opts: { yes?: boolean }) => {
      const { ctx, projectId } = await projectContext()
      if (!opts.yes) {
        // Say how many references would go with it — deleting a document is
        // not the same as unlinking one, and the prompt should show that.
        let referenced = ''
        try {
          const links = await apiFetch<{ items?: unknown[]; boards?: unknown[] }>(
            ctx,
            `${canvasBase(projectId, canvasId)}/links`,
          )
          const n = (links.items?.length ?? 0) + (links.boards?.length ?? 0)
          if (n > 0) referenced = ` It is referenced ${n} time(s); those references go too.`
        } catch {
          // A failed lookup must not block the confirmation itself.
        }
        await confirmOrThrow(`Delete canvas '${canvasId}' and all its history?${referenced}`)
      }
      printJson(await apiFetch<unknown>(ctx, canvasBase(projectId, canvasId), { method: 'DELETE' }))
    })

  canvas
    .command('folders')
    .description("Print the project's folder tree, flat, as JSON.")
    .action(async () => {
      const { ctx, projectId } = await projectContext()
      printJson(await apiFetch<unknown>(ctx, canvasFoldersBase(projectId)))
    })

  const folder = new Command('folder').description('Manage canvas folders (max 3 levels).')

  folder
    .command('create <name>')
    .description('Create a folder.')
    .option('--parent <folderId>', 'Nest inside this folder.')
    .action(async (name: string, opts: { parent?: string }) => {
      const { ctx, projectId } = await projectContext()
      const body = { name, ...(opts.parent ? { parentId: opts.parent } : {}) }
      printJson(await apiFetch<unknown>(ctx, canvasFoldersBase(projectId), { method: 'POST', body }))
    })

  folder
    .command('rename <folderId> <name>')
    .description('Rename a folder.')
    .action(async (folderId: string, name: string) => {
      const { ctx, projectId } = await projectContext()
      printJson(
        await apiFetch<unknown>(
          ctx,
          `${canvasFoldersBase(projectId)}/${encodeURIComponent(folderId)}`,
          { method: 'PATCH', body: { name } },
        ),
      )
    })

  folder
    .command('move <folderId>')
    .description('Re-parent a folder. Refused on a cycle or past 3 levels.')
    .option('--parent <folderId>', 'New parent.')
    .option('--root', 'Move to the project root instead.')
    .action(async (folderId: string, opts: { parent?: string; root?: boolean }) => {
      const { ctx, projectId } = await projectContext()
      if (!opts.parent && !opts.root) throw new Error('Pass --parent <folderId> or --root.')
      printJson(
        await apiFetch<unknown>(
          ctx,
          `${canvasFoldersBase(projectId)}/${encodeURIComponent(folderId)}`,
          { method: 'PATCH', body: { parentId: opts.root ? null : opts.parent } },
        ),
      )
    })

  folder
    .command('delete <folderId>')
    .description('Delete a folder. Its contents MOVE UP one level; nothing is deleted.')
    .option('-y, --yes', 'Skip the confirmation prompt.')
    .action(async (folderId: string, opts: { yes?: boolean }) => {
      const { ctx, projectId } = await projectContext()
      if (!opts.yes) {
        await confirmOrThrow(
          `Delete folder '${folderId}'? Documents and sub-folders inside it move up one level; nothing is deleted.`,
        )
      }
      printJson(
        await apiFetch<unknown>(
          ctx,
          `${canvasFoldersBase(projectId)}/${encodeURIComponent(folderId)}`,
          { method: 'DELETE' },
        ),
      )
    })

  canvas.addCommand(folder)
  tugasna.addCommand(canvas)

  // ── tags (project-scoped, read) ──────────────────────────────────────────
  const tag = new Command('tag').description('Read Tugasna project tags.')

  tag
    .command('list')
    .description('List tags defined in the active project.')
    .action(async () => {
      const { ctx, projectId, activeProject } = await projectContext()
      const rows = await apiFetch<TagRow[]>(ctx, `${projectBase(projectId)}/tags`)
      if (rows.length === 0) {
        process.stdout.write(`No tags in '${activeProject}'.\n`)
        return
      }
      for (const t of rows) {
        process.stdout.write(`${t.id.padEnd(38)} ${t.name}\n`)
      }
    })

  tugasna.addCommand(tag)

  // ── timeline (project-scoped, read) ──────────────────────────────────────
  tugasna
    .command('timeline')
    .description('Show the project timeline (items with start/due dates).')
    .action(async () => {
      const { ctx, projectId } = await projectContext()
      printJson(await apiFetch<unknown>(ctx, `${projectBase(projectId)}/timeline`))
    })

  return tugasna
}
