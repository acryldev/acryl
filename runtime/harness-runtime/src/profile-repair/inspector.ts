/**
 * Static diagnosis of a profile: files, manifests and logs only. It never starts the app, never imports a
 * plugin, and never writes anything, so it works when the app is too broken to launch (spec 041, Scope B).
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { resolveProfileDir } from '@deepseek-ai/dsh-app-boot'
import { parse } from 'yaml'
import {
  readDisabledPluginLifecycleEntries,
  readUserMutableBundleNames,
  resolvePluginLifecycleStatePath,
} from '../plugin-lifecycle-state.ts'
import type { ProfileDiagnosis, ProfileFinding } from './findings.ts'

/** Loader rows that are infrastructure, not plugins: a failure inside one is not fixed by disabling it. */
const INFRASTRUCTURE_ROWS: ReadonlySet<string> = new Set(['acryl-engine', 'include', 'webserver'])
/** How much of each recent log to read, and how many logs. */
const LOG_TAIL_BYTES = 256 * 1024
const RECENT_LOGS = 3

export interface InspectOptions {
  readonly dshHome: string
  readonly profileName: string
}

const describe = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

function recentLogFiles(dshHome: string): string[] {
  const dir = join(dshHome, 'logs')
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  return names
    .filter(name => /\.(?:log|jsonl)$/.test(name))
    .flatMap((name) => {
      try {
        const path = join(dir, name)
        const stats = statSync(path)
        return stats.isFile() ? [{ path, modifiedAt: stats.mtimeMs }] : []
      } catch {
        return []
      }
    })
    .sort((a, b) => b.modifiedAt - a.modifiedAt)
    .slice(0, RECENT_LOGS)
    .map(file => file.path)
}

function tailOf(path: string): string {
  try {
    const text = readFileSync(path, 'utf8')
    return text.length > LOG_TAIL_BYTES ? text.slice(text.length - LOG_TAIL_BYTES) : text
  } catch {
    return ''
  }
}

const ACTIVATION_FAILURE = /failed to apply loader entry ([A-Za-z0-9@/._:-]+)/g

/** The innermost failing Loader row of each log line: the outer rows only say "my child failed". */
function activationFailures(text: string): Array<{ entryId: string; cause: string }> {
  const found = new Map<string, string>()
  for (const line of text.split('\n')) {
    let last: RegExpExecArray | undefined
    ACTIVATION_FAILURE.lastIndex = 0
    for (let match = ACTIVATION_FAILURE.exec(line); match !== null; match = ACTIVATION_FAILURE.exec(line)) last = match
    if (last === undefined) continue
    const entryId = last[1] ?? ''
    const rest = line.slice(last.index + last[0].length).replace(/^[^:]*\):\s*/, '').trim()
    if (!found.has(entryId)) found.set(entryId, rest.slice(0, 200))
  }
  return [...found].map(([entryId, cause]) => ({ entryId, cause }))
}

function layoutFinding(profileDir: string): ProfileFinding | undefined {
  const modules = join(profileDir, 'node_modules', '.modules.yaml')
  const workspace = join(profileDir, 'pnpm-workspace.yaml')
  if (!existsSync(modules) || !existsSync(workspace)) return undefined
  try {
    const recorded = (parse(readFileSync(modules, 'utf8')) as { nodeLinker?: unknown } | null)?.nodeLinker
    const declared = (parse(readFileSync(workspace, 'utf8')) as { nodeLinker?: unknown } | null)?.nodeLinker ?? 'isolated'
    if (typeof recorded === 'string' && recorded !== declared) {
      return {
        severity: 'warning', code: 'pnpm-layout-mismatch', file: workspace,
        message: `the profile's dependencies were installed with nodeLinker "${recorded}" but pnpm-workspace.yaml says "${String(declared)}"; a reinstall would relink the whole tree`,
        guidance: 'Do not reinstall by hand. Run the profile through ACRYL, which pins the recorded layout before any package operation.',
      }
    }
  } catch {
    // An unreadable YAML file is reported by the boot itself; it is not a layout finding.
  }
  return undefined
}

/** Diagnose a profile from its files and recent logs. Never throws for a broken profile: that is the finding. */
export function inspectProfile(options: InspectOptions): ProfileDiagnosis {
  const profileDir = resolveProfileDir(options.profileName, options.dshHome)
  const findings: ProfileFinding[] = []
  if (!existsSync(profileDir)) {
    findings.push({ severity: 'error', code: 'profile-missing', file: profileDir, message: `profile ${JSON.stringify(options.profileName)} has no directory at ${profileDir}`, guidance: 'Check the profile name with `acryl plugin list --profile <name>`; ACRYL creates a profile on first use.' })
    return { profileName: options.profileName, profileDir, dshHome: options.dshHome, findings }
  }

  const statePath = resolvePluginLifecycleStatePath(options.dshHome)
  if (existsSync(statePath)) {
    try {
      readDisabledPluginLifecycleEntries({ profileName: options.profileName, statePath })
    } catch (cause) {
      findings.push({ severity: 'error', code: 'state-unreadable', file: statePath, recipe: 'restore-override-file', message: `the plugin override file ${statePath} cannot be read: ${describe(cause)}` })
    }
  }

  const manifest = join(profileDir, 'package.json')
  if (existsSync(manifest)) {
    try {
      JSON.parse(readFileSync(manifest, 'utf8'))
    } catch (cause) {
      findings.push({ severity: 'error', code: 'profile-manifest-unreadable', file: manifest, message: `the profile manifest ${manifest} is not valid JSON: ${describe(cause)}`, guidance: 'Restore it from a backup or from another profile\'s copy; it lists the profile\'s bundles.' })
    }
    for (const bundle of [...readUserMutableBundleNames(profileDir)].sort()) {
      if (!existsSync(join(profileDir, 'node_modules', ...bundle.split('/'), 'package.json'))) {
        findings.push({ severity: 'error', code: 'bundle-missing', entryId: bundle, file: manifest, message: `the profile lists ${bundle} but it is not installed in ${join(profileDir, 'node_modules')}`, guidance: `Reinstall it with \`acryl plugin add ${bundle}\`, or remove it from dsh.profile.bundles.` })
      }
    }
  }

  const layout = layoutFinding(profileDir)
  if (layout !== undefined) findings.push(layout)

  const seen = new Set<string>()
  let storeMismatch = false
  for (const log of recentLogFiles(options.dshHome)) {
    const text = tailOf(log)
    for (const failure of activationFailures(text)) {
      if (seen.has(failure.entryId)) continue
      seen.add(failure.entryId)
      const infrastructure = INFRASTRUCTURE_ROWS.has(failure.entryId)
      findings.push({
        severity: 'error', code: 'plugin-activation-failed', entryId: failure.entryId, file: log,
        message: `${failure.entryId} failed to activate${failure.cause === '' ? '' : `: ${failure.cause}`}`,
        ...(infrastructure ? { guidance: `${failure.entryId} is part of the engine, not a plugin; disabling it would not fix this. Fix the cause named above.` } : { recipe: 'disable-failing-row' as const }),
      })
    }
    if (/package manager did not complete successfully/i.test(text)) storeMismatch = true
  }
  if (storeMismatch) {
    findings.push({ severity: 'warning', code: 'pnpm-store-mismatch', message: 'the package manager did not complete a recent install; this is the known symptom of a pnpm store made by a different pnpm version', guidance: 'Use the pnpm ACRYL pins (through the Lifecycle tab or `acryl plugin`), not the one on PATH, and do not delete the profile to fix it.' })
  }

  return { profileName: options.profileName, profileDir, dshHome: options.dshHome, findings }
}
