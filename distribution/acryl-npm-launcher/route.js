// Which part of `acryl` the words on the command line ask for. Pure: cli.js runs what this decides, and the test reads it without starting anything.
//
//   acryl, acryl --tui            ACRYL Control Center in this terminal (a bare `acryl` without a terminal prints the help instead)
//   acryl --gui, acryl --web      ACRYL Control Center in a window, in the browser (`--update` first)
//   acryl --help, -h, help        the help          acryl --version, -v       this package's version
//   acryl apps | model | store    the list of apps, the model key, the store's Blends
//   acryl ade [...]               ACRYL ADE         acryl desktop             the earlier ACRYL desktop installer
//   anything else                 the terminal coding agent with those words (`acryl -p "..."`)
// The short commands forwarded to the part that owns them (new, make, plugin, blends, update) are decided before this, by forward.js.
import { controlCenterArgs } from './control-center.js'

/** @returns {{ kind: string, [key: string]: unknown }} */
export function routeArgs(args, { terminal }) {
  const [first, ...rest] = args
  if (args.length === 0) return terminal ? { kind: 'tui' } : { kind: 'help' }
  if (args.length === 1 && (first === '--version' || first === '-v')) return { kind: 'version' }
  if (first === '--help' || first === '-h' || first === 'help') return { kind: 'help' }
  if (first === '--tui' || first === '--cli') {
    if (rest.length > 0) return { kind: 'error', message: `acryl ${first} takes no other words (${rest.join(' ')})` }
    return terminal ? { kind: 'tui' } : { kind: 'error', message: 'acryl --tui needs a terminal; to open ACRYL Control Center in a window run: acryl --gui' }
  }
  if (first === '--gui' || first === '--web' || first === 'web') {
    const chosen = controlCenterArgs(first === 'web' ? ['--web', ...rest] : args)
    return chosen.error ? { kind: 'error', message: chosen.error } : { kind: 'control-center', surface: chosen.surface, update: chosen.update }
  }
  if (first === 'apps' || first === 'model' || first === 'store' || first === 'desktop') return { kind: first, args: rest }
  if (first === 'ade' || first === 'code') return { kind: 'ade', args: rest }
  return { kind: 'agent', args }
}
