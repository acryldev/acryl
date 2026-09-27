/**
 * acryl-app-save: keep an app in its own git repository from inside the app (spec 036, persistence-and-registries.md), for users who never open a terminal.
 *
 *   /app save [message]                          commit the app, and push it when it has a remote
 *   /app connect [public|private] [repository]   create the app's repository through the user's own gh login (private unless the app says public)
 *
 * One swappable Cordis plugin: disable its row and the commands go; nothing else changes. Human-typed only: saving sends the user's work to a remote, so it is the
 * user's decision; the agent may suggest it, never run it. The rules (a secret check on every save, a private app never reaching a public remote, no token ever
 * handled) are @acryl/app-persistence's. Requires: `commands`. Reads the optional `appInstance` service: outside an app the commands say so and do nothing.
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { connectRemote, gitCli, githubHosting, saveApp } from '@acryl/app-persistence'

export const name = 'acryl-app-save'
export const inject = ['commands']

/** The app folder when this process runs an app (its home has blend.yaml), else undefined. */
export function appFolder(instance) {
  const home = instance?.home
  return typeof home === 'string' && existsSync(join(home, 'blend.yaml')) ? home : undefined
}

/** The command's behaviour, apart from Cordis: testable with any git and hosting ports. */
export function runAppCommand(rawInput, app, ports = { git: gitCli, hosting: githubHosting }) {
  if (app === undefined) return { kind: 'error', text: 'This is not an app created with acryl new, so it has no repository of its own to save to.' }
  const [verb = '', ...rest] = String(rawInput ?? '').trim().split(/\s+/u).filter(Boolean)
  const manifestText = readFileSync(join(app, 'blend.yaml'), 'utf8')
  try {
    if (verb === 'save') {
      const result = saveApp({ manifestText, message: rest.join(' ') || `Save ${new Date().toISOString().slice(0, 16).replace('T', ' ')}` }, ports.git(app), ports.hosting(app))
      if (result.status === 'saved') return { kind: 'success', text: `Saved ${result.commit.slice(0, 8)}${result.pushed ? ` and pushed to ${result.remote}` : '. It has no remote yet: type /app connect to create a private GitHub repository for it.'}` }
      if (result.status === 'nothing-to-save') return { kind: 'success', text: 'Nothing to save: no changes since the last save.' }
      return { kind: 'error', text: `Not saved: ${result.reason}${(result.secrets ?? []).map(found => `\n- ${found.path}${found.line > 0 ? `:${found.line}` : ''} (${found.kind})`).join('')}` }
    }
    if (verb === 'connect') {
      const visibility = rest[0] === 'public' || rest[0] === 'private' ? rest.shift() : undefined
      const result = connectRemote({ manifestText, name: rest[0] ?? basename(app), ...(visibility === undefined ? {} : { visibility }) }, ports.git(app), ports.hosting(app))
      return result.status === 'connected'
        ? { kind: 'success', text: `${result.created ? 'Created' : 'Connected'} the ${result.visibility} repository ${result.remote}. Type /app save to push the app to it.` }
        : { kind: 'error', text: `Not connected: ${result.reason}` }
    }
  } catch (cause) {
    return { kind: 'error', text: String(cause?.message ?? cause) }
  }
  return { kind: 'error', text: 'Usage: /app save [message], or /app connect [public|private] [repository name].' }
}

export function apply(ctx) {
  ctx.effect(() => ctx.commands.register({
    name: 'app',
    description: 'Save this app to its own git repository, or connect it to one (private unless the app says public)',
    input: { hint: 'save [message] | connect [public|private] [repository name]' },
    async handler(invocation) {
      return runAppCommand(invocation?.rawInput, appFolder(ctx.get('appInstance')))
    },
  }), 'acryl-app-save: /app command')
}
