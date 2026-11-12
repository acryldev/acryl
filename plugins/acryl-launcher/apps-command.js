// `acryl apps`: the terminal's own account of the list the launcher shows, so every launcher button has a command a person can type.
//   acryl apps                 list the apps on this machine
//   acryl apps add <folder>    put an app's folder in the list
//   acryl apps remove <id>     take an app out of the list (the folder stays)
import { addApp, inspectApp, readApps, removeApp } from './apps-registry.js'

/** Run it; `out` and `err` get lines. Returns the exit code. */
export function runAppsCommand(argv, { home, cwd, out = () => {}, err = () => {} }) {
  const [verb = 'list', ...rest] = argv
  try {
    if (verb === 'list') {
      const apps = readApps(home)
      if (apps.length === 0) out('No apps yet. Make one with: acryl new <name>   or add a folder: acryl apps add <folder>')
      for (const app of apps) out(`${app.id}  ${inspectApp(app).state}  ${app.blend || '-'}  ${app.path}`)
      return 0
    }
    if (verb === 'add') {
      if (rest.length === 0) { err('acryl apps add needs the app folder, for example: acryl apps add ./shop'); return 2 }
      const { entry, added } = addApp(home, { path: rest[0].startsWith('/') || /^[a-z]:[\\/]/iu.test(rest[0]) ? rest[0] : `${cwd}/${rest[0]}` })
      out(added ? `Added ${entry.id}: ${entry.path}` : `${entry.id} is already in the list: ${entry.path}`)
      return 0
    }
    if (verb === 'remove') {
      if (rest.length === 0) { err('acryl apps remove needs the app id (see: acryl apps)'); return 2 }
      if (!removeApp(home, rest[0])) { err(`no app "${rest[0]}" in the list (see: acryl apps)`); return 1 }
      out(`Removed ${rest[0]} from the list. Its folder is untouched.`)
      return 0
    }
    err(`acryl apps: unknown "${verb}". Use: acryl apps [add <folder> | remove <id>]`)
    return 2
  } catch (cause) {
    err(`acryl apps: ${cause instanceof Error ? cause.message : String(cause)}`)
    return 1
  }
}
