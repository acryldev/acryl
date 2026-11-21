/**
 * What a child of the Electron main process inherits. On Linux Chromium opens its DevTools port (`--remote-debugging-port`), its sockets and its files without
 * close-on-exec, and Node's spawn passes every such descriptor on: a started app's host kept the port bound after the app that was started with it had quit
 * (found on Linux: a `sleep` started from Electron main held 20 descriptors, among them Chromium's sockets). macOS closes everything but the standard streams
 * when it starts a process, and a Windows socket is not inherited, so only Linux needs this. The same text is in plugins/launcher-desktop/src/runner.ts (the
 * two packages share no code); keep them equal.
 */
import { existsSync } from 'node:fs'

/** bash's `exec 12>&-` closes a descriptor of any number (dash accepts one digit only); the command then replaces bash, so the process id and group stay the child's own. */
const CLOSE_AND_RUN =
  // biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter expansion, not a JavaScript template
  'for f in /proc/self/fd/*; do n=${f##*/}; if [ "$n" -gt 2 ]; then eval "exec $n>&-"; fi; done; exec "$@"'

export const BASH = '/bin/bash'

/** The program and arguments to spawn so the child holds no descriptor above 2: the command itself where that is already so, or where bash is not there. */
export function withoutInheritedDescriptors(
  program: string,
  args: readonly string[],
  platform: NodeJS.Platform = process.platform,
  hasBash: boolean = existsSync(BASH),
): { readonly program: string; readonly args: readonly string[] } {
  if (platform !== 'linux' || !hasBash) return { program, args }
  return { program: BASH, args: ['-c', CLOSE_AND_RUN, 'acryl-spawn', program, ...args] }
}
