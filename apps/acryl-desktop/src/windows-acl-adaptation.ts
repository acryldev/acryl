/**
 * The pure parts of the Electron adapter for the Windows ACL PowerShell executor: which system PowerShell to prefer, and the exact argv
 * rewrite that routes the upstream ACL runner through the desktop Node-mode trampoline. Kept apart from the executor subclass
 * (`windows-pwsh-sandbox.ts`, DETACHED on the DSH 0.2 branch) so they stay type-checked and unit-tested.
 */

import { existsSync } from 'node:fs'
import { win32 } from 'node:path'
import type { ShellExecSpec } from '@deepseek-ai/dsh-shell'

const RUN_AS_NODE = 'ELECTRON_RUN_AS_NODE'

/** Inputs controlling one exact ACL-runner argv rewrite. */
export interface WindowsAclAdaptation {
  /** Host platform; only Windows is adapted. */
  platform: NodeJS.Platform
  /** Whether the current Host executable is Electron. */
  electron: boolean
  /** Current Electron executable path. */
  execPath: string
  /** Resolved upstream ACL runner path. */
  upstreamRunner: string
  /** Desktop-owned Node-mode trampoline path. */
  trampoline: string
}

/** Adapted execution inputs passed to the ordinary local executor. */
export interface AdaptedWindowsAclExecution {
  /** Spec carrying the runner-only Electron environment. */
  spec: ShellExecSpec
  /** Exact argv, with the desktop trampoline inserted when required. */
  argv: readonly string[]
}

/** Windows PowerShell paths that do not depend on PATH-provided portable runtimes. Built with win32 semantics on every host so results are deterministic off Windows. */
export function desktopWindowsPwshPath(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  exists: (path: string) => boolean = existsSync,
): string | undefined {
  if (platform !== 'win32') return undefined
  const programFiles = env.ProgramFiles ?? 'C:\\Program Files'
  const systemRoot = env.SystemRoot ?? 'C:\\Windows'
  const candidates = [
    win32.join(programFiles, 'PowerShell', '7', 'pwsh.exe'),
    win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
  ]
  return candidates.find(candidate => exists(candidate))
}

/** Keep explicit user config, otherwise avoid PATH-resolved portable pwsh in the Windows ACL sandbox. */
export function desktopWindowsPwshConfig<Config extends Readonly<Record<string, unknown>>>(
  config: Config,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  exists: (path: string) => boolean = existsSync,
): Config {
  if (typeof config.pwshPath === 'string' && config.pwshPath.length > 0) return config
  const pwshPath = desktopWindowsPwshPath(env, platform, exists)
  return pwshPath === undefined ? config : { ...config, pwshPath }
}

/**
 * Insert the desktop Node-mode trampoline for the exact upstream ACL runner.
 * @param spec - resolved PowerShell execution spec.
 * @param argv - argv after the upstream sandbox provider has confined it.
 * @param adaptation - executable and runner identities for this Host.
 * @returns unchanged inputs for every non-runner call, otherwise the isolated runner launch.
 */
export function adaptWindowsAclExecution(
  spec: ShellExecSpec,
  argv: readonly string[],
  adaptation: WindowsAclAdaptation,
): AdaptedWindowsAclExecution {
  const [program, runner, ...args] = argv
  if (adaptation.platform !== 'win32'
    || !adaptation.electron
    || program !== adaptation.execPath
    || runner !== adaptation.upstreamRunner) {
    return { spec, argv }
  }

  const env = { ...spec.env }
  for (const key of Object.keys(env)) {
    if (key.toUpperCase() === RUN_AS_NODE) delete env[key]
  }
  env[RUN_AS_NODE] = '1'
  return {
    spec: { ...spec, env },
    argv: [adaptation.execPath, adaptation.trampoline, adaptation.upstreamRunner, ...args],
  }
}

