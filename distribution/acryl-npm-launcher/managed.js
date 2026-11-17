// What `acryl` keeps for itself in ~/.acryl and starts on a surface (spec 050 D14):
//   - Blend apps it owns: ACRYL Control Center (`acryl --gui`, `acryl --web`) and ACRYL ADE (`acryl ade`), each made once from the Blends registry, installed, then started in the browser or a window;
//   - the terminal coding agent (`acryl ade --tui`), the prepared CLI runtime, installed on first use instead of with every `npx acryl`.
// The functions here only decide what to run; cli.js runs it. Nothing here touches the network or the disk except `exists`.
import { existsSync } from 'node:fs'
import { join, relative, isAbsolute } from 'node:path'
import { CREATE_SPEC, npmCommand, npmExec } from './forward.js'

/** The apps acryl keeps in its own home: registry id, folder under ~/.acryl, name a person reads. */
export const MANAGED = Object.freeze({
  ade: Object.freeze({ id: 'acryl.ade', folder: 'ade', title: 'ACRYL ADE' }),
  launcher: Object.freeze({ id: 'acryl.control-center', folder: 'control-center', title: 'ACRYL Control Center' }),
})

/** The surfaces a managed Blend opens on, and the app script that opens it there. */
export const SURFACES = Object.freeze({ web: 'dev', gui: 'desktop' })

const SURFACE_FLAGS = Object.freeze({ '--web': 'web', '--gui': 'gui', '--desktop': 'gui', '--tui': 'tui', '--cli': 'tui' })

/**
 * `acryl ade [--web | --gui | --tui] [words...]`: the surface the words ask for (`web` when none is named) and the other words, which only the
 * terminal agent takes (`acryl ade --tui -p "..."`). `{ error }` for two surfaces, or for words the browser or the window cannot take.
 */
export function surfaceFrom(args) {
  const named = args.filter(arg => Object.hasOwn(SURFACE_FLAGS, arg))
  if (new Set(named.map(flag => SURFACE_FLAGS[flag])).size > 1) return { error: 'acryl ade opens on one surface at a time: --web, --gui or --tui' }
  const surface = SURFACE_FLAGS[named[0]] ?? 'web'
  const rest = args.filter(arg => !Object.hasOwn(SURFACE_FLAGS, arg))
  if (surface !== 'tui' && rest.length > 0) return { error: `acryl ade ${surface === 'web' ? '--web' : '--gui'} takes no other words (${rest.join(' ')}); the terminal agent does: acryl ade --tui ${rest.join(' ')}` }
  return { surface, rest }
}

/**
 * The steps that bring a managed Blend to running on `surface`: make it (once), install (when no finished install is there), start.
 * npm writes `node_modules/.package-lock.json` last, so an install cut short is done again instead of starting a broken app.
 * @returns {{ label: string, command: string, args: string[], cwd: string, shell?: boolean }[]}
 */
export function managedSteps(app, surface, { home, context, exists = existsSync }) {
  const folder = join(home, app.folder)
  const steps = []
  if (!exists(join(folder, 'blend.yaml'))) {
    const create = context.env.ACRYL_CREATE?.trim() || CREATE_SPEC
    steps.push({ label: `making ${app.title} in ${folder} (once)`, ...npmExec(context, create, [app.folder, '--from', app.id, '--no-start']), cwd: home })
  }
  if (!exists(join(folder, 'node_modules', '.package-lock.json'))) {
    steps.push({ label: `installing ${app.title} (once, about a minute)`, ...npmCommand(context, ['install', '--no-audit', '--no-fund']), cwd: folder })
  }
  steps.push({ label: `starting ${app.title}`, ...npmCommand(context, ['run', SURFACES[surface]]), cwd: folder })
  return steps
}

/**
 * `acryl ade` opens on the folder it was started in (spec 050 T022): ADE reads ACRYL_OPEN_FOLDER into its workbench's project list. Not the person's
 * home (the whole home as one project) and not ACRYL's own home (ADE's install folder is already its own first project).
 */
export function openFolderEnv(cwd, { userHome, acrylHome }) {
  const inside = (folder) => { const path = relative(folder, cwd); return path === '' || (!path.startsWith('..') && !isAbsolute(path)) }
  return cwd === userHome || inside(acrylHome) ? {} : { ACRYL_OPEN_FOLDER: cwd }
}

/** Where the terminal agent's runtime of this version is installed on first use. */
export const runtimePrefix = (home, version) => join(home, 'runtime', version)

/** The one step that installs the runtime package into its prefix. */
export function runtimeInstallStep({ home, version, packageName, context }) {
  const prefix = runtimePrefix(home, version)
  return {
    label: `downloading the ACRYL terminal agent ${version} (once, about 450 MB)`,
    ...npmCommand(context, ['install', '--prefix', prefix, '--no-save', '--no-audit', '--no-fund', `${packageName}@${version}`]),
    cwd: home,
  }
}
