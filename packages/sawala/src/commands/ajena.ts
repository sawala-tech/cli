import { Command } from 'commander'
import { writeFile } from 'node:fs/promises'
import { SAWALA_BRAND, apiFetch, loadContext, requireActiveOrg, requireActiveProject } from '@sawala/auth'
import { confirmOrThrow, resolveInputPayload } from '../lib/io'

/**
 * Ajena FLOW — "flow as code".
 *
 * A FLOW is a saved automation: one trigger (an inbound email, a WhatsApp
 * message, or a cron schedule) followed by steps that run in dependency order.
 * Until now the only way to change one was the visual node editor in the
 * dashboard, so a config tweak could not be scripted, diffed, or code-reviewed.
 * These commands make a flow a JSON artifact you can pull, edit in your own
 * editor, validate, and push back:
 *
 *     sawala ajena flow pull <id> -o flow.json
 *     $EDITOR flow.json
 *     sawala ajena flow validate -f flow.json
 *     sawala ajena flow push <id> -f flow.json
 *
 * Two things to know about the artifact (a "FlowDocument"):
 *
 *  • It is SECRET-FREE. An extract_document step's PDF passwords are stored
 *    encrypted and never exported — a pulled document shows only
 *    `passwordCount`/`hasPassword`. Pushing a document with those password
 *    fields absent KEEPS the stored passwords, so the ordinary edit-and-push
 *    round-trip neither leaks a secret nor destroys one. Changing a password is
 *    an explicit opt-in (`passwords: ["new"]`) in the pushed JSON.
 *  • `schemaVersion` declares the contract it was written against. The server
 *    accepts an absent or older version and refuses a newer one.
 *
 * Unlike the Kontena/Datana commands, no projectId appears in the URL: Ajena
 * derives {org, project} from the CLI token's own scope (the gateway resolves
 * and forwards it), so scope can never be widened by anything in the pushed
 * body. A flow id belonging to another org simply resolves to 404.
 *
 * Paths go through the gateway's CLI-only surface (`/cli/ajena/*`), which is
 * reachable by a koda_… CLI token and by nothing else — no browser, no SDK.
 */

const FLOWS = '/cli/ajena/api/admin/flows'
const FLOW_RUNS = '/cli/ajena/api/admin/flow-runs'

interface FlowStep {
  id: string
  kind: string
  name: string
  dependsOn: string[]
  config: Record<string, unknown>
}

interface FlowDocument {
  schemaVersion?: number
  flowId?: string
  name: string
  description: string
  enabled: boolean
  trigger: { type: string; channel?: string; expr?: string; [k: string]: unknown }
  steps: FlowStep[]
}

interface StepConfigError {
  stepId: string
  path: string
  message: string
}

interface ValidateResponse {
  valid: boolean
  errors: StepConfigError[]
}

interface RunSummary {
  runId: string
  flowName: string
  status: string
  triggerType: string
  startedAt: string
}

// A one-line description of what fires a flow, for the list view.
function triggerLabel(t: FlowDocument['trigger'] | undefined): string {
  if (!t || typeof t !== 'object') return '?'
  if (t.type === 'cron') return `cron ${String(t.expr ?? '')}`.trim()
  if (t.type === 'channel_inbound') return `${String(t.channel ?? '')} inbound`.trim()
  return String(t.type ?? '?')
}

async function ctxWithScope() {
  const ctx = await loadContext(SAWALA_BRAND)
  requireActiveOrg(ctx, SAWALA_BRAND)
  // Ajena scopes flows to (org, project). apiFetch sends the active project as
  // x-project-id; the gateway resolves the slug to its real id. Without one,
  // ajena answers 400 "No active project" — fail here with the friendlier
  // message the other commands use.
  requireActiveProject(ctx, SAWALA_BRAND)
  return ctx
}

function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n')
}

// Render `{stepId, path, message}[]` as one line each, e.g.
//   s3  functionPath  must start with '/'
function printErrors(errors: StepConfigError[]): void {
  for (const e of errors) {
    const where = e.stepId ? `step ${e.stepId}` : 'flow'
    const path = e.path ? ` ${e.path}` : ''
    process.stderr.write(`${where}${path}: ${e.message}\n`)
  }
}

// Dry-run validate a document server-side. Returns the response so callers can
// decide whether to continue (push --check) or just report (validate).
async function validateDocument(ctx: Awaited<ReturnType<typeof ctxWithScope>>, body: unknown): Promise<ValidateResponse> {
  return apiFetch<ValidateResponse>(ctx, `${FLOWS}/validate`, { method: 'POST', body })
}

export function createAjenaCommand(): Command {
  const ajena = new Command('ajena').description('Ajena commands (FLOW automations as code).')

  const flow = new Command('flow').description(
    'Manage FLOW automations as JSON (list, get, pull, push, create, delete, validate, run).',
  )

  // Service-root shortcut, matching `sawala datana list`.
  ajena
    .command('list')
    .description('Shortcut for `sawala ajena flow list`.')
    .action(listFlows)

  flow
    .command('list')
    .description('List flows in the active project.')
    .action(listFlows)

  flow
    .command('get <id>')
    .description('Fetch one flow as a FlowDocument (pretty-printed to stdout).')
    .action(async (id: string) => {
      const ctx = await ctxWithScope()
      printJson(await apiFetch<FlowDocument>(ctx, `${FLOWS}/${encodeURIComponent(id)}`))
    })

  flow
    .command('pull <id>')
    .description(
      'Write a flow to a file for editing (same document as `get`, aimed at a file). ' +
        'Secrets are never exported; pushing it back with the password fields absent keeps them.',
    )
    .option('-o, --out <path>', "Write to this path instead of stdout. Use '-' for stdout.")
    .action(async (id: string, opts: { out?: string }) => {
      const ctx = await ctxWithScope()
      const doc = await apiFetch<FlowDocument>(ctx, `${FLOWS}/${encodeURIComponent(id)}`)
      const text = JSON.stringify(doc, null, 2) + '\n'
      if (!opts.out || opts.out === '-') {
        process.stdout.write(text)
        return
      }
      await writeFile(opts.out, text, 'utf8')
      // To stderr, so `pull -o` stays quiet on stdout for scripts.
      process.stderr.write(`Wrote ${opts.out} (${doc.steps?.length ?? 0} steps).\n`)
    })

  flow
    .command('push <id>')
    .description(
      'Replace a flow with the FlowDocument from --file/--data (PUT semantics — the ' +
        'whole document is replaced). extract_document passwords are preserved when absent.',
    )
    .option('-f, --file <path>', "Read the FlowDocument from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline FlowDocument JSON.')
    .option('--check', 'Validate server-side first and refuse to push if invalid.')
    .option('--dry-run', 'Print what would be sent without writing.')
    .action(async (id: string, opts: { file?: string; data?: string; check?: boolean; dryRun?: boolean }) => {
      const ctx = await ctxWithScope()
      const body = await resolveInputPayload(opts)

      if (opts.check) {
        const result = await validateDocument(ctx, body)
        if (!result.valid) {
          printErrors(result.errors)
          throw new Error(`Refusing to push: ${result.errors.length} validation error(s).`)
        }
      }
      if (opts.dryRun) {
        printJson({ wouldSend: { method: 'PUT', path: `${FLOWS}/${id}`, body } })
        return
      }
      printJson(await apiFetch<FlowDocument>(ctx, `${FLOWS}/${encodeURIComponent(id)}`, { method: 'PUT', body }))
    })

  flow
    .command('create')
    .description('Create a new flow from a FlowDocument. Prints the created document (with its new id).')
    .option('-f, --file <path>', "Read the FlowDocument from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline FlowDocument JSON.')
    .option('--check', 'Validate server-side first and refuse to create if invalid.')
    .option('--dry-run', 'Print what would be sent without writing.')
    .action(async (opts: { file?: string; data?: string; check?: boolean; dryRun?: boolean }) => {
      const ctx = await ctxWithScope()
      const body = await resolveInputPayload(opts)

      if (opts.check) {
        const result = await validateDocument(ctx, body)
        if (!result.valid) {
          printErrors(result.errors)
          throw new Error(`Refusing to create: ${result.errors.length} validation error(s).`)
        }
      }
      if (opts.dryRun) {
        printJson({ wouldSend: { method: 'POST', path: FLOWS, body } })
        return
      }
      printJson(await apiFetch<FlowDocument>(ctx, FLOWS, { method: 'POST', body }))
    })

  flow
    .command('delete <id>')
    .description('Delete a flow. Requires --yes or a TTY for confirmation.')
    .option('-y, --yes', 'Skip the confirmation prompt.')
    .action(async (id: string, opts: { yes?: boolean }) => {
      const ctx = await ctxWithScope()
      if (!opts.yes) await confirmOrThrow(`Delete flow '${id}'?`)
      printJson(await apiFetch<unknown>(ctx, `${FLOWS}/${encodeURIComponent(id)}`, { method: 'DELETE' }))
    })

  flow
    .command('validate')
    .description(
      'Check a FlowDocument without saving it. Reports each problem as ' +
        '"step <id> <key>: <message>" and exits non-zero when invalid.',
    )
    .option('-f, --file <path>', "Read the FlowDocument from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline FlowDocument JSON.')
    .action(async (opts: { file?: string; data?: string }) => {
      const ctx = await ctxWithScope()
      const body = await resolveInputPayload(opts)
      const result = await validateDocument(ctx, body)
      if (result.valid) {
        process.stdout.write('Valid.\n')
        return
      }
      printErrors(result.errors)
      // Non-zero exit (cli.ts maps a thrown Error to exit 1) so `validate` is
      // usable as a pre-commit / CI gate.
      throw new Error(`Invalid FlowDocument: ${result.errors.length} error(s).`)
    })

  // ── run + runs: push → run → inspect a trace, without leaving the terminal ──

  flow
    .command('run <id>')
    .description('Run a flow now. Prints the new runId.')
    .option('-f, --file <path>', "Read the trigger input JSON from path. Use '-' for stdin.")
    .option('-d, --data <json>', 'Inline trigger input JSON.')
    .action(async (id: string, opts: { file?: string; data?: string }) => {
      const ctx = await ctxWithScope()
      // Input is optional here (unlike create/push), so don't demand one.
      const input = opts.file || opts.data ? await resolveInputPayload(opts) : null
      printJson(await apiFetch<{ runId: string }>(ctx, `${FLOWS}/${encodeURIComponent(id)}/run`, {
        method: 'POST',
        body: { input },
      }))
    })

  flow
    .command('runs')
    .description('List recent runs (Jobs), newest first.')
    .option('--flow <id>', 'Only runs of this flow.')
    .option('--status <status>', 'queued | running | succeeded | failed | cancelled.')
    .action(async (opts: { flow?: string; status?: string }) => {
      const ctx = await ctxWithScope()
      const params = new URLSearchParams()
      if (opts.flow) params.set('flowId', opts.flow)
      if (opts.status) params.set('status', opts.status)
      const qs = params.toString()
      const result = await apiFetch<{ runs: RunSummary[] }>(ctx, `${FLOW_RUNS}${qs ? `?${qs}` : ''}`)
      if (result.runs.length === 0) {
        process.stdout.write('No runs.\n')
        return
      }
      for (const r of result.runs) {
        process.stdout.write(
          `${r.runId.padEnd(38)} ${r.status.padEnd(10)} ${r.startedAt.padEnd(26)} ${r.flowName}\n`,
        )
      }
    })

  flow
    .command('run-get <runId>')
    .description('Fetch one run including its full step-by-step trace.')
    .action(async (runId: string) => {
      const ctx = await ctxWithScope()
      printJson(await apiFetch<unknown>(ctx, `${FLOW_RUNS}/${encodeURIComponent(runId)}`))
    })

  ajena.addCommand(flow)
  return ajena
}

async function listFlows(): Promise<void> {
  const ctx = await ctxWithScope()
  const result = await apiFetch<{ flows: FlowDocument[] }>(ctx, FLOWS)
  if (result.flows.length === 0) {
    process.stdout.write('No flows in the active project.\n')
    return
  }
  for (const f of result.flows) {
    const state = f.enabled ? 'enabled' : 'disabled'
    process.stdout.write(
      `${String(f.flowId ?? '').padEnd(38)} ${state.padEnd(9)} ${triggerLabel(f.trigger).padEnd(18)} ${f.name}\n`,
    )
  }
}
