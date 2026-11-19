import type { ITerminalAddon } from './xterm.mjs'
export class FitAddon implements ITerminalAddon {
  activate(terminal: import('./xterm.mjs').Terminal): void
  dispose(): void
  fit(): void
}
