export const DEPLOY_CURRENT_PROJECT_NAME = 'deploy-current-project'

/**
 * Walk-through prompt: confirm active context, verify slug, check
 * for a built `.open-next/worker.js` in the user's CWD, then call
 * `kodena_deploy_script`.
 *
 * The MCP host renders this in its slash/prompt picker so the user
 * can kick off the flow without typing the multi-step instruction
 * themselves.
 */
export function buildDeployCurrentProjectMessages(args: {
  slug: string | undefined
}): Array<{ role: 'user'; content: { type: 'text'; text: string } }> {
  const slugLine = args.slug
    ? `Deploy to the script slug \`${args.slug}\`. Do not ask which slug.`
    : 'If the user has not named a slug, ask which one before doing anything else.'

  const body = [
    'You are deploying the current project to Kodena. Follow these steps in order; ' +
      'stop and ask the user if any step uncovers something unexpected.',
    '',
    slugLine,
    '',
    '1. Call `resources/read` for `kodena://config` and confirm `config.activeOrg` is set. ' +
      'If `credentials.token` is `"(none)"`, tell the user to run `kodena login` and stop.',
    '2. Call `kodena_list_scripts`. Verify the target slug appears in the list. If not, ' +
      'ask the user whether to call `kodena_create_script` first (do not create silently).',
    '3. Check that `./.open-next/worker.js` exists in the project root (the file path the ' +
      'agent\'s shell would use). If missing, tell the user to run the OpenNext build first ' +
      '(`npx @opennextjs/cloudflare build`) and stop.',
    '4. Call `kodena_deploy_script` with `slug`, `workerEntryPath: "./.open-next/worker.js"`, ' +
      'and `assetsDir: "./.open-next/assets"` if that directory exists. Use `dryRun: true` ' +
      'first to confirm bundle size with the user, then call again with `dryRun: false` once ' +
      'they approve.',
    '5. Report the live tenant URL from the deploy response.',
    '',
    'If anything throws an MCP error, surface the error code and message exactly. Do not ' +
      'attempt to retry on -32001 (Unauthenticated) or -32003 (Forbidden) — those are user-' +
      'fixable, not retryable.',
  ].join('\n')

  return [{ role: 'user', content: { type: 'text', text: body } }]
}
