---
name: sawala-tugasna
description: Manage Tugasna work tracking from the Sawala CLI — boards, statuses, items, comments, tags, the timeline, and the backlog. Use when creating or updating a board or task, moving an item between columns, reordering statuses, commenting on work, or working with backlog items and their placement.
metadata:
  sawala-cli-version: "0.13.0"
---

# Tugasna — boards, items, backlog

Tugasna is the work tracker. A **board** holds **statuses** (columns) which
hold **items**. A project also has a **backlog** of items that are not on any
board yet. All of it is project-scoped.

`sawala tugasna` is the largest group in the CLI — 30 subcommands across
`board`, `status`, `item`, `backlog`, `comment`, `tag`, and `timeline`. There
are **no MCP tools for Tugasna**; shell out to the CLI.

Read `sawala-cli` first for scope and `--yes` conventions.

## Two things that differ from Kontena and Datana

**`update` is a PATCH, not a PUT replacement.** Send only the keys you want to
change. There is no pull-append-push dance here, and sending a full document
is unnecessary (though harmless).

**Dates are epoch-millisecond numbers, not ISO strings.** `startDate`,
`dueDate`, and `endDate` all take a number like `1785801600000`. Pass `null`
to clear one on update. An ISO string will be rejected or stored wrong.

## Boards

    sawala tugasna board list [--archived]
    sawala tugasna board get <boardId>          # includes statuses, fields, labels
    sawala tugasna board create -d '{"name":"Q3 Launch"}'
    sawala tugasna board update <boardId> -d '{"color":"#ff0000"}'    # PATCH
    sawala tugasna board archive <boardId>
    sawala tugasna board unarchive <boardId>
    sawala tugasna board delete <boardId> [-y]

Create body: `{ name, description?, color?, startDate?, endDate? }`. Creating a
board **seeds default statuses**, so you rarely need to create columns by hand.

`board list` shows active boards only; `--archived` shows archived ones
*instead*, not as well. An item someone "can't find" is often on an archived
board.

> `board delete` removes the board **and everything on it**. Prefer `archive`,
> and always surface a delete to the user rather than passing `-y` yourself.

## Statuses (columns)

    sawala tugasna status create <boardId> -d '{"name":"In Review"}'
    sawala tugasna status update <boardId> <statusId> -d '{"color":"#888"}'   # PATCH
    sawala tugasna status delete <boardId> <statusId> [-y]
    sawala tugasna status reorder <boardId> -d '{"statusIds":["s1","s2","s3"]}'

`reorder` takes the complete list of status ids in the desired order.

## Items

    sawala tugasna item list <boardId> [--status <statusId>] [--assignee <assignee>]
    sawala tugasna item get <boardId> <itemId>
    sawala tugasna item create <boardId> -f item.json
    sawala tugasna item update <boardId> <itemId> -d '{"title":"…"}'          # PATCH
    sawala tugasna item move <boardId> <itemId> -d '{"statusId":"s2","position":0}'
    sawala tugasna item delete <boardId> <itemId> [-y]

Create body: `{ title, description?, statusId?, assignees?, startDate?, dueDate? }`.
Omit `statusId` and the item lands in the board's first column.

`move` requires **both** `statusId` and `position`; `position` is a 0-based
index within the target column. Use it to reorder inside a column too — pass
the current `statusId` with a new `position`.

## Comments, tags, timeline

    sawala tugasna comment list <itemId>
    sawala tugasna comment create <itemId> -d '{"text":"Shipped."}'
    sawala tugasna comment update <itemId> <commentId> -d '{"text":"…"}'   # PATCH
    sawala tugasna comment delete <itemId> <commentId> [-y]
    sawala tugasna tag list
    sawala tugasna timeline

Reply to a comment by adding `{ "parentId": "<commentId>" }` to the create body.
`tag list` is read-only — tags are defined in the dashboard. `timeline` shows
items carrying start/due dates.

## Backlog

Backlog items are project-level and belong to no board until placed. See
[the backlog model](references/backlog.md) for placement, sub-items, and the
difference between `item` and `backlog` commands addressing the same item.
