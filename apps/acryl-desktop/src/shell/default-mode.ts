import type { DesktopShellMode } from './runtime.ts'

/** The advanced (native chrome) shell exists on macOS and Windows only; Linux starts in the compatibility shell. */
export function defaultDesktopShellMode(platform: NodeJS.Platform): DesktopShellMode {
  return platform === 'linux' ? 'compatibility' : 'advanced'
}
