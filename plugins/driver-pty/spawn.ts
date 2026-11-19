/** The one place that touches `node-pty`, a native module. Everything else works on this small seam, so tests run on a fake process. */
import { statSync } from 'node:fs'
import { delimiter, join } from 'node:path'

export interface PtyProcess {
  readonly pid: number
  onData(listener: (chunk: string) => void): void
  onExit(listener: (exit: { exitCode: number }) => void): void
  write(data: string): void
  resize(cols: number, rows: number): void
  /** Ends the process; on Windows this is how it ends (ConPTY has no process groups). */
  kill(): void
}

export type PtySpawn = (
  file: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; cols: number; rows: number },
) => PtyProcess

/**
 * The file a terminal runs: a full path. On Windows node-pty runs the file as it is given and does not search PATH - a bare `node` is "File not found" - so
 * a bare program name is looked up once, with the platform's PATH separator and, on Windows, PATHEXT. A name that is not found comes back unchanged, and
 * the start fails with the PTY's own error.
 */
export function resolveProgram(
  program: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (program === '' || program.includes('/') || (platform === 'win32' && program.includes('\\')))
    return program
  const windows = platform === 'win32'
  const folders = (env.PATH ?? env.Path ?? '').split(windows ? ';' : delimiter)
  const lower = program.toLowerCase()
  const known = (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
  const suffixes = !windows
    ? ['']
    : known.some((extension) => lower.endsWith(extension.toLowerCase()))
      ? ['']
      : ['', ...new Set(known)]
  for (const folder of folders) {
    if (folder === '') continue
    for (const suffix of suffixes) {
      const candidate = join(folder, `${program}${suffix}`)
      try {
        const stat = statSync(candidate)
        if (stat.isFile() && (windows || (stat.mode & 0o111) !== 0)) return candidate
      } catch {
        // Not here: the next folder, or the next extension.
      }
    }
  }
  return program
}

/** Loads node-pty. Rejects with the reason (the error and the platform), so a log says why the driver is not offered. */
export async function loadNodePty(): Promise<PtySpawn> {
  try {
    const pty = await import('node-pty')
    return (file, args, options) =>
      pty.spawn(file, args, {
        name: 'xterm-256color',
        cwd: options.cwd,
        env: options.env as Record<string, string>,
        cols: options.cols,
        rows: options.rows,
      })
  } catch (error) {
    throw new Error(
      `node-pty could not be loaded on ${process.platform}/${process.arch}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
