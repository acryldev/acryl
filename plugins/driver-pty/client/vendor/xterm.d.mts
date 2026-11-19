// The part of xterm.js the terminal tab uses (the vendored file ships no types).
export interface ITerminalAddon {
  activate(terminal: Terminal): void
  dispose(): void
}
export class Terminal {
  constructor(options?: { cursorBlink?: boolean; fontSize?: number; convertEol?: boolean })
  readonly cols: number
  readonly rows: number
  loadAddon(addon: ITerminalAddon): void
  open(parent: HTMLElement): void
  write(data: string): void
  reset(): void
  focus(): void
  dispose(): void
  onData(listener: (data: string) => void): { dispose(): void }
}
