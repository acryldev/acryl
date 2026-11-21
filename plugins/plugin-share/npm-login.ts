/**
 * The person's own npm, for a publish: who is signed in (`npm whoami`) and the publish itself, both through the `npm` on this computer and its configuration
 * (`.npmrc`). Nothing here reads or stores a token; a missing npm or login is reported with what to do.
 */
import { spawnSync } from 'node:child_process'
import { type NpmPublishPort, npmCli } from '@acryldev/plugin-hub-core'

/** The registry's login and the publish, as the plan and the confirmed publish use them. */
export interface NpmPort extends NpmPublishPort {
  /** The account the person's npm is signed in as on `registry`. @throws naming `npm login` when it is not signed in. */
  login(registry: string): string
}

/** Why `npm whoami` failed, in words: not signed in (with the command), or what npm said without its pointer to a log file. */
export function whoamiProblem(stderr: string, registry: string): string {
  const said = stderr
    .split('\n')
    .map((line) => line.replace(/^npm error\s*/u, '').trim())
    .filter((line) => line !== '' && !/^npm (notice|warn)|A complete log of this run/iu.test(line))
  const signedOut =
    /ENEEDAUTH|E401|E403|need auth|Unauthorized|not logged in/iu.test(stderr) || said.length === 0
  return signedOut
    ? `npm whoami failed: you are not signed in to npm on ${registry} (sign in with: npm login --registry ${registry})`
    : `npm whoami failed: ${said.slice(0, 2).join(' ')} (sign in with: npm login --registry ${registry})`
}

export function npmWithLogin(): NpmPort {
  return {
    ...npmCli(),
    login(registry) {
      // On Windows npm is a .cmd file, which Node runs only through a shell; the arguments are ours, never the person's text.
      const result = spawnSync('npm', ['whoami', '--registry', registry], {
        encoding: 'utf8',
        shell: process.platform === 'win32',
        env: { ...process.env, npm_config_update_notifier: 'false' },
      })
      if (result.error !== undefined)
        throw new Error(
          'npm is not available here: install Node.js (https://nodejs.org), which includes npm, and sign in with: npm login',
        )
      const account = (result.stdout ?? '').trim()
      if (result.status !== 0 || account === '') {
        throw new Error(whoamiProblem(result.stderr ?? '', registry))
      }
      return account
    },
  }
}
