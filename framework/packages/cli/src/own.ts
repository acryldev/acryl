/**
 * `acrylblends own <package>`: the app takes its own copy of a frame core package (spec 052 D18, T068), so a change to a core part (the left panel, the
 * chat around the app) is a change to this app alone. The package carries its source and build config; the copy goes to `plugins/<folder>/`, gets its
 * build tools, is built, and the frame is regenerated to mount it (`ownedOf` in ide-profile reads the folder: it is the whole record). Every other app on
 * the computer keeps the shared package.
 */
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { FRAME_PACKAGES, ownedOf, planIdeProfileWrite, writeIdeProfilePlan } from './ide-profile'
import { UsageError } from './init'
import type { Io } from './io'
import { readLibrary } from './library'
import { planFrameStep } from './upgrade'

export interface OwnOptions {
  readonly name: string
  readonly directory: string | undefined
}

export function parseOwnOptions(argv: readonly string[]): OwnOptions {
  let parsed: ReturnType<
    typeof parseArgs<{
      args: string[]
      allowPositionals: true
      strict: true
      options: { dir: { type: 'string' } }
    }>
  >
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: { dir: { type: 'string' } },
    })
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error))
  }
  const [name, ...rest] = parsed.positionals
  if (name === undefined || rest.length > 0)
    throw new UsageError(`own takes one package: ${ownable().join(', ')}`)
  return { name, directory: parsed.values.dir }
}

/** The frame packages an app can own, by package name. */
const ownable = (): string[] =>
  FRAME_PACKAGES.filter((entry) => entry.installed !== true).map((entry) => entry.name)

/** Runs a program in a folder; the exit code. */
export type Run = (program: string, args: readonly string[], cwd: string) => number

const npmRun: Run = (program, args, cwd) =>
  spawnSync(program, [...args], { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
    .status ?? 1

/** The frame's profile files planned the way `upgrade` plans them, written; a reason when one was edited by hand. */
export type Regenerate = (app: string) => string | undefined

const regenerateProfile: Regenerate = (app) => {
  const frame = planFrameStep(app, readLibrary())
  if (frame.kind !== 'planned') return `the app is not in the frame (${frame.kind})`
  const profile = planIdeProfileWrite(app, frame.input)
  const edited = profile.files.filter((file) => file.state === 'conflict').map((file) => file.file)
  if (edited.length > 0)
    return `${edited.join(', ')} ${edited.length === 1 ? 'was' : 'were'} edited by hand; run acrylblends upgrade to merge`
  writeIdeProfilePlan(app, profile)
  return undefined
}

/** A shared install is read-only (spec 052 D18 step 1): the copy is the app's own, so it is made writable. */
function makeWritable(path: string): void {
  const stat = statSync(path)
  chmodSync(path, stat.mode | 0o200)
  if (stat.isDirectory()) for (const entry of readdirSync(path)) makeWritable(join(path, entry))
}

export function own(
  options: OwnOptions,
  io: Io,
  run: Run = npmRun,
  regenerate: Regenerate = regenerateProfile,
): number {
  const app = resolve(io.cwd, options.directory ?? '.')
  const name = ownable().find(
    (candidate) => candidate === options.name || candidate === `@acryldev/${options.name}`,
  )
  if (name === undefined)
    throw new UsageError(
      `"${options.name}" is not a frame package an app can own; one of: ${ownable().join(', ')}`,
    )
  if (!existsSync(join(app, 'cordis.patch.yml'))) {
    io.stderr.write(`error: ${app} is not an app in the frame (no cordis.patch.yml)\n`)
    return 1
  }
  const already = ownedOf(app)[name]
  if (already !== undefined) {
    io.stderr.write(`error: the app owns ${name} already, at plugins/${already}/\n`)
    return 1
  }
  const folder = name.split('/').at(-1) as string
  const target = join(app, 'plugins', folder)
  if (existsSync(target)) {
    io.stderr.write(`error: plugins/${folder}/ exists; move it aside first\n`)
    return 1
  }
  const installed = join(app, 'node_modules', ...name.split('/'))
  if (!existsSync(join(installed, 'package.json'))) {
    io.stderr.write(`error: ${name} is not installed in this app; run npm install first\n`)
    return 1
  }
  const version =
    (JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8')) as { version?: string })
      .version ?? '?'
  if (!existsSync(join(installed, 'src'))) {
    io.stderr.write(
      `error: ${name}@${version} does not carry its source; update the app (acrylblends update) to a release whose frame packages do\n`,
    )
    return 1
  }
  io.stdout.write(`owning ${name}@${version} in plugins/${folder}/\n`)
  cpSync(installed, target, {
    recursive: true,
    dereference: true,
    filter: (source) => !relative(installed, source).split(/[\\/]/u).includes('node_modules'),
  })
  makeWritable(target)
  // The upstream DSH packages' peer ranges conflict (cordis 4.0.4 against cordis-plugin-include 1.0.10); the app's own install is not strict either.
  writeFileSync(join(target, '.npmrc'), 'legacy-peer-deps=true\n')
  const undo = (step: string): number => {
    rmSync(target, { recursive: true, force: true })
    io.stderr.write(
      `error: ${step} failed; plugins/${folder}/ was removed and the app is as it was\n`,
    )
    return 1
  }
  if (
    run(
      'npm',
      ['install', '--include=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
      target,
    ) !== 0
  )
    return undo('installing its build tools')
  if (run('npm', ['run', 'build'], target) !== 0) return undo('building it')
  const refused = regenerate(app)
  if (refused !== undefined) return undo(`mounting it (${refused})`)
  io.stdout.write(
    `the app owns ${name} now: plugins/${folder}/ is its copy, mounted instead of the shared package.\nChange it in plugins/${folder}/src/, then run npm run build in plugins/${folder}/; npm run dev loads the build. To give it back, remove plugins/${folder}/ and run acrylblends upgrade.\n`,
  )
  return 0
}
