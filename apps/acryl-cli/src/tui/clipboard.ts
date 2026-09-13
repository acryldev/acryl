/**
 * System-clipboard read, used for right-click paste. Node has no built-in
 * clipboard API, so this shells out to the platform's clipboard tool via
 * `execFile` (the same `node:child_process` approach used elsewhere for
 * platform launchers like `open`/`xdg-open`).
 * @module @tomowang/dsh-tui/tui/clipboard
 */

import { execFile } from 'node:child_process'

type ClipboardCommand = readonly [command: string, args: readonly string[]]

function clipboardCommands(): ClipboardCommand[] {
  switch (process.platform) {
    case 'darwin':
      return [['pbpaste', []]]
    case 'win32':
      return [['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-Clipboard']]]
    default:
      // Linux: try the common X11/Wayland clipboard tools in order.
      return [
        ['xclip', ['-selection', 'clipboard', '-o']],
        ['xsel', ['--clipboard', '--output']],
        ['wl-paste', ['--no-newline']],
      ]
  }
}

/**
 * Read the system clipboard. Resolves with the clipboard text (possibly empty).
 * Rejects when no supported clipboard tool is available on this host.
 *
 * A single trailing newline is stripped: `pbpaste` prints the clipboard verbatim,
 * while `xclip`/`xsel`/`Get-Clipboard` append one, so this keeps the result
 * consistent with a native terminal paste (which inserts exactly what was copied).
 */
export function readClipboard(): Promise<string> {
  return new Promise((resolve, reject) => {
    const commands = clipboardCommands()
    let index = 0
    const attempt = (): void => {
      if (index >= commands.length) {
        reject(new Error('no clipboard tool available'))
        return
      }
      const [command, args] = commands[index]!
      index += 1
      execFile(command, args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
        if (error) {
          attempt()
          return
        }
        resolve(stdout.replace(/\r?\n$/, ''))
      })
    }
    attempt()
  })
}
