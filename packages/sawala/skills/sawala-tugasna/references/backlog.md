# The Tugasna backlog

A **backlog item** is a project-level item that sits on no board. Placing it
puts it into a board's column; unplacing returns it to the backlog. The item
keeps its id throughout — placement changes where it appears, not what it is.

## Commands

    sawala tugasna backlog list                    # unplaced items only
    sawala tugasna backlog create -d '{"title":"Investigate flaky test"}'
    sawala tugasna backlog get <itemId>            # works for board items too
    sawala tugasna backlog update <itemId> -d '{…}'    # PATCH
    sawala tugasna backlog children <itemId>       # sub-items
    sawala tugasna backlog place <itemId> -d '{"boardId":"b1","statusId":"s1"}'
    sawala tugasna backlog unplace <itemId>

Create body: `{ title, description?, parentId? }`. Passing `parentId` makes the
new item a **sub-item** of that item; `backlog children <itemId>` lists them.

## `backlog get` vs `item get`

Both address items, but they are scoped differently:

- `backlog get <itemId>` is **project-scoped** and resolves any item, whether
  it is on a board or in the backlog. Use it when you have an item id and do
  not know where it lives.
- `item get <boardId> <itemId>` is **board-scoped** and needs the board id.

The same applies to `backlog update` versus `item update` — the backlog form
needs no board id. Prefer the backlog form when you are working from an item
id alone.

## Placing

    sawala tugasna backlog place <itemId> -d '{"boardId":"b1","statusId":"s1","position":0}'

`boardId` and `statusId` are both required; `position` is optional and 0-based
(omit it to append). Get valid status ids from `sawala tugasna board get <boardId>`,
which returns the board with its statuses.

`unplace <itemId>` removes the item from its board and returns it to the
backlog. It does not delete anything — the item, its comments, and its
sub-items all survive.

## A worked flow

    # 1. capture the work with no board decision yet
    sawala tugasna backlog create -d '{"title":"Rate-limit the webhook"}'
    # → prints the created item, including its id

    # 2. find the target column
    sawala tugasna board get b_01J...          # read .statuses[].id

    # 3. put it on the board, top of the column
    sawala tugasna backlog place i_01J... -d '{"boardId":"b_01J...","statusId":"s_01J...","position":0}'

    # 4. later, move it along
    sawala tugasna item move b_01J... i_01J... -d '{"statusId":"s_done","position":0}'
