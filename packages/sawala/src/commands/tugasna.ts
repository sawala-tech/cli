import { Command } from 'commander'
import {
  SAWALA_BRAND,
  apiFetch,
  loadContext,
  requireActiveOrg,
  requireActiveProject,
  requireActiveProjectId,
} from '@sawala/auth'
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
