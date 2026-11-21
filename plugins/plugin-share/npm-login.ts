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
        const last =
          (result.stderr ?? '')
            .trim()
            .split('\n')
            .filter((line) => !/^npm (notice|warn)/iu.test(line))
            .at(-1) ?? 'not signed in'
        throw new Error(
          `npm whoami failed: ${last} (sign in with: npm login --registry ${registry})`,
        )
      }
      return account
    },
  }
}
