/**
 * Opens the operating system's own folder chooser and reports the folder picked. The Host serves a
 * loopback-only Web server (`acryl-workspace` refuses to start otherwise), so a dialog raised here is on
 * the same machine as the person using the page - the reason this is safe to offer at all, unlike a
 * chooser on a remote server nobody is sitting at.
 */

import { execFile } from 'node:child_process'

/** Runs a program and resolves its stdout; rejects with `code` set to the exit code or 'ENOENT'. */
export type RunProgram = (file: string, args: readonly string[]) => Promise<string>

/** No native chooser exists on this machine (no dialog program installed). */
export class FolderPickerUnavailableError extends Error {
  constructor() {
    super('no native folder chooser is available on this machine')
    this.name = 'FolderPickerUnavailableError'
  }
}

const defaultRun: RunProgram = (file, args) => new Promise((resolve, reject) => {
  // No shell: the arguments are passed as an array, never interpolated into a command line.
  execFile(file, [...args], { maxBuffer: 1024 * 1024 }, (cause, stdout) => {
    if (cause === null) resolve(stdout)
    else reject(cause)
  })
})

function exitCode(cause: unknown): unknown {
  return typeof cause === 'object' && cause !== null && 'code' in cause ? (cause as { code?: unknown }).code : undefined
}

/** A trailing separator is dropped (the chooser adds one), except for a filesystem root. */
export function normalizePickedPath(raw: string): string | null {
  const text = raw.trim()
  if (text === '') return null
  const stripped = text.replace(/[\\/]+$/, '')
  return stripped === '' ? text : stripped
}

const MAC_SCRIPT = [
  'try',
  'POSIX path of (choose folder with prompt "Choose a workspace folder")',
  'on error number -128',
  'return ""',
  'end try',
]

const WINDOWS_SCRIPT = [
  'Add-Type -AssemblyName System.Windows.Forms',
  '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
  '$d.Description = "Choose a workspace folder"',
  "if ($d.ShowDialog() -eq 'OK') { Write-Output $d.SelectedPath }",
].join('; ')

/**
 * @param platform - `process.platform`.
 * @param run - process runner; injected so the tests never open a dialog.
 * @returns the absolute path picked, or null when the chooser was cancelled.
 * @throws FolderPickerUnavailableError when this machine has no chooser program.
 */
export async function pickFolderNatively(platform: NodeJS.Platform, run: RunProgram = defaultRun): Promise<string | null> {
  if (platform === 'darwin') {
    return normalizePickedPath(await run('osascript', MAC_SCRIPT.flatMap(line => ['-e', line])))
  }
  if (platform === 'win32') {
    return normalizePickedPath(await run('powershell.exe', ['-NoProfile', '-STA', '-Command', WINDOWS_SCRIPT]))
  }
  // Linux and others: zenity, then kdialog. Cancelling either exits 1 with nothing on stdout.
  const candidates: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['zenity', ['--file-selection', '--directory', '--title=Choose a workspace folder']],
    ['kdialog', ['--getexistingdirectory', '.', '--title', 'Choose a workspace folder']],
  ]
  for (const [file, args] of candidates) {
    try {
      return normalizePickedPath(await run(file, args))
    } catch (cause) {
      if (exitCode(cause) === 'ENOENT') continue
      return null // the person closed the dialog
    }
  }
  throw new FolderPickerUnavailableError()
}

/** One chooser at a time: a second request while one is open waits for that answer instead of stacking dialogs. */
export function singleFlight<T>(task: () => Promise<T>): () => Promise<T> {
  let inflight: Promise<T> | undefined
  return () => {
    inflight ??= task().finally(() => { inflight = undefined })
    return inflight
  }
}
