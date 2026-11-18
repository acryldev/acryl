import { Terminal } from '@xterm/headless'
import { describe, expect, it } from 'vitest'
import { ScreenModel } from '../../src/pty/screen-model.ts'

const ESC = '\x1b'

async function settled(model: ScreenModel, cursor: number): Promise<void> {
  for (let i = 0; i < 100 && model.snapshot().cursor < cursor; i += 1) await new Promise(resolve => setTimeout(resolve, 5))
  expect(model.snapshot().cursor).toBe(cursor)
}

async function restored(screen: string, cols: number, rows: number): Promise<Terminal> {
  const terminal = new Terminal({ cols, rows, scrollback: 5000, allowProposedApi: true })
  await new Promise<void>(resolve => { terminal.write(screen, resolve) })
  return terminal
}

function lines(terminal: Terminal): string[] {
  const buffer = terminal.buffer.active
  return Array.from({ length: buffer.length }, (_, i) => buffer.getLine(i)?.translateToString(true) ?? '')
}

describe('ScreenModel', () => {
  it('reproduces a shell screen: text, colours and cursor position', async () => {
    const model = new ScreenModel(40, 10)
    const output = `${ESC}[32mgreen${ESC}[0m line one\r\nline two\r\n$ ls`
    model.write(output, output.length)
    await settled(model, output.length)
    const copy = await restored(model.snapshot().screen, 40, 10)
    expect(lines(copy).slice(0, 3)).toEqual(['green line one', 'line two', '$ ls'])
    expect(copy.buffer.active.cursorX).toBe(4)
    expect(copy.buffer.active.getLine(0)?.getCell(0)?.isFgPalette()).toBe(true)
    model.dispose()
    copy.dispose()
  })

  it('reproduces a full-screen program that draws by cursor movement on the alternate screen', async () => {
    const model = new ScreenModel(30, 8)
    const before = 'prompt> vim\r\n'
    const tui = `${ESC}[?1049h${ESC}[2J${ESC}[1;1H== TITLE ==${ESC}[4;5Hbody text${ESC}[8;1H-- status --`
    const output = before + tui
    model.write(output, output.length)
    await settled(model, output.length)
    const copy = await restored(model.snapshot().screen, 30, 8)
    expect(copy.buffer.active.type).toBe('alternate')
    const alt = lines(copy)
    expect(alt[0]).toBe('== TITLE ==')
    expect(alt[3]).toBe('    body text')
    expect(alt[7]).toBe('-- status --')
    model.dispose()
    copy.dispose()
  })

  it('follows a resize and only claims output the parser has reached', async () => {
    const model = new ScreenModel(20, 5)
    expect(model.snapshot()).toEqual({ screen: '', cursor: 0 })
    model.resize(40, 12)
    model.write('abc', 3)
    await settled(model, 3)
    const copy = await restored(model.snapshot().screen, 40, 12)
    expect(lines(copy)[0]).toBe('abc')
    model.dispose()
    copy.dispose()
  })
})
