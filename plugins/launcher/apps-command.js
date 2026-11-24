// `acryl apps`: the terminal's own account of the list the launcher shows, so every launcher button has a command a person can type.
//   acryl apps                 list the apps on this machine
//   acryl apps add <folder>    put an app's folder in the list
//   acryl apps remove <id>     take an app out of the list (the folder stays)
//   acryl apps add-to-applications <id>        make the app's launcher where this OS looks for apps (spec 052 D4)
//   acryl apps remove-from-applications <id>   delete exactly what that wrote
//   acryl apps reinstall [<id>]                 the app's packages again (every app without an id), from the shared Program when one fits (spec 052 T008)
//   acryl clean [--yes]                         remove the Programs no app uses, after saying what and how much and asking once (runCleanCommand)
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { runNpm } from './app-install.js'
import { planClean, reinstallApp, removePrograms } from './app-space.js'
import { addApp, inspectApp, readApps, removeApp } from './apps-registry.js'
import { addToApplications, readLaunchers, removeFromApplications } from './os-launchers.js'

/** Run it; `out` and `err` get lines. Returns the exit code (a promise of it for reinstall, which runs npm). */
export function runAppsCommand(argv, { home, cwd, out = () => {}, err = () => {}, node = process.execPath, platform = process.platform, npm = runNpm }) {
  const [verb = 'list', ...rest] = argv
  if (verb === 'reinstall') return reinstallApps(rest[0], { home, out, err, node, platform, npm })
  try {
    if (verb === 'list') {
      const apps = readApps(home)
      if (apps.length === 0) out('No apps yet. Make one with: acryl new <name>   or add a folder: acryl apps add <folder>')
      const launchers = readLaunchers(home, platform).apps
      for (const app of apps) out(`${app.id}  ${inspectApp(app).state}  ${app.blend || '-'}  ${app.path}${launchers[app.id] === undefined ? '' : '  (in Applications)'}`)
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
    if (verb === 'add-to-applications') {
      if (rest.length === 0) { err('acryl apps add-to-applications needs the app id (see: acryl apps)'); return 2 }
      const { written, problems } = addToApplications({ platform, home, node, app: rest[0] })
      out(`${rest[0]} is in your Applications now (${written[0]}). Open it from Spotlight, the Start menu or the app menu.`)
      for (const problem of problems) err(`acryl apps: ${problem}`)
      return 0
    }
    if (verb === 'remove-from-applications') {
      if (rest.length === 0) { err('acryl apps remove-from-applications needs the app id (see: acryl apps)'); return 2 }
      if (!removeFromApplications({ platform, home, id: rest[0] })) { err(`"${rest[0]}" is not in your Applications (see: acryl apps)`); return 1 }
      out(`Removed ${rest[0]} from your Applications. Its folder and its place in the list are untouched.`)
      return 0
    }
    err(`acryl apps: unknown "${verb}". Use: acryl apps [add <folder> | remove <id> | reinstall [<id>] | add-to-applications <id> | remove-from-applications <id>]`)
    return 2
  } catch (cause) {
    err(`acryl apps: ${cause instanceof Error ? cause.message : String(cause)}`)
    return 1
  }
}

/** `acryl apps reinstall [<id>]`: each app in turn; an app that cannot be reinstalled is said and the others go on. Exit 1 when any failed. */
async function reinstallApps(id, { home, out, err, node, platform, npm }) {
  const apps = readApps(home).filter(app => id === undefined || app.id === id)
  if (apps.length === 0) { err(id === undefined ? 'No apps in the list (see: acryl apps)' : `no app "${id}" in the list (see: acryl apps)`); return 1 }
  let failed = 0
  for (const app of apps) {
    if (!existsSync(join(app.path, 'package.json'))) { err(`${app.id}: no folder with a package.json at ${app.path}; skipped`); failed += 1; continue }
    out(`Reinstalling ${app.id} (${app.path}): only its packages; its own files and data stay as they are.`)
    try {
      const { code } = await reinstallApp({ folder: app.path, home, npm, node, platform, say: line => out(`acryl: ${line}`) })
      if (code === 0) out(`${app.id}: reinstalled.`)
      else { err(`${app.id}: the install failed (exit ${code}); it has the packages it had before.`); failed += 1 }
    } catch (cause) {
      err(`${app.id}: not reinstalled (${cause instanceof Error ? cause.message : String(cause)}); if it is running, stop it first.`)
      failed += 1
    }
  }
  return failed === 0 ? 0 : 1
}

const mb = bytes => (bytes / 1e6).toFixed(1)

/**
 * `acryl clean [--yes]`: what planClean finds, each folder with what removing it frees, then one question (`ask`, a terminal's prompt). Without a
 * terminal it removes only with --yes. Returns the exit code.
 */
export async function runCleanCommand(argv, { home, out = () => {}, err = () => {}, ask, platform = process.platform }) {
  try {
    const plan = planClean({ home })
    if (plan.length === 0) { out('Nothing to clean: every shared Program in this home is used by an app.'); return 0 }
    out('acryl clean removes these folders, and nothing else (no app\'s own files or data):')
    for (const entry of plan) out(`  ${entry.path}  ${mb(entry.bytes)} MB  ${entry.reason}`)
    const total = plan.reduce((sum, entry) => sum + entry.bytes, 0)
    // An APFS clone shares its blocks with the apps made from it, so macOS may give back less than the files' size.
    out(`Together: ${platform === 'darwin' ? 'up to ' : ''}${mb(total)} MB. An app made later on one of these Blends versions installs it again.`)
    if (!argv.includes('--yes')) {
      if (ask === undefined) { err('acryl clean: nothing removed. Run it in a terminal to be asked, or pass --yes.'); return 2 }
      if (!/^y(es)?$/iu.test((await ask('Remove them? [y/N] ')).trim())) { out('Nothing removed.'); return 0 }
    }
    removePrograms(home, plan)
    out(`Removed ${plan.length} folder${plan.length === 1 ? '' : 's'}.`)
    return 0
  } catch (cause) {
    err(`acryl clean: ${cause instanceof Error ? cause.message : String(cause)}`)
    return 1
  }
}
