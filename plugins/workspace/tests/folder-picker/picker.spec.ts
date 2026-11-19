import { describe, expect, it } from 'vitest'
import { FolderPickerUnavailableError, normalizePickedPath, pickFolderNatively, singleFlight, type RunProgram } from '../../src/folder-picker/picker.ts'

function runner(answer: string | Error): { readonly run: RunProgram; readonly calls: Array<{ file: string; args: readonly string[] }> } {
  const calls: Array<{ file: string; args: readonly string[] }> = []
  return {
    calls,
    run: async (file, args) => {
      calls.push({ file, args })
      if (answer instanceof Error) throw answer
      return answer
    },
  }
}
const missing = Object.assign(new Error('not found'), { code: 'ENOENT' })

describe('normalizePickedPath', () => {
  it('drops a trailing separator and blank output, but keeps a filesystem root', () => {
    expect(normalizePickedPath('/Users/x/proj/\n')).toBe('/Users/x/proj')
    expect(normalizePickedPath('C:\\Work\\proj\\')).toBe('C:\\Work\\proj')
    expect(normalizePickedPath('/')).toBe('/')
    expect(normalizePickedPath('  \n')).toBeNull()
  })
})

describe('pickFolderNatively', () => {
  it('macOS: asks osascript, with the arguments as an array and cancel handled in the script', async () => {
    const r = runner('/Users/x/proj/\n')
    expect(await pickFolderNatively('darwin', r.run)).toBe('/Users/x/proj')
    expect(r.calls[0]?.file).toBe('osascript')
    expect(r.calls[0]?.args.join(' ')).toContain('choose folder')
    expect(r.calls[0]?.args.join(' ')).toContain('-128') // Cancel is an error number, answered as an empty string
  })

  it('macOS: a cancelled chooser (empty answer) is null, not an error', async () => {
    expect(await pickFolderNatively('darwin', runner('\n').run)).toBeNull()
  })

  it('Windows: asks PowerShell for a folder dialog', async () => {
    const r = runner('C:\\Work\\proj\r\n')
    expect(await pickFolderNatively('win32', r.run)).toBe('C:\\Work\\proj')
    expect(r.calls[0]?.file).toBe('powershell.exe')
    expect(r.calls[0]?.args.join(' ')).toContain('FolderBrowserDialog')
  })

  it('Linux: uses zenity, treats a closed dialog as a cancel, and falls back to kdialog when zenity is missing', async () => {
    expect(await pickFolderNatively('linux', runner('/home/x/proj\n').run)).toBe('/home/x/proj')
    expect(await pickFolderNatively('linux', runner(new Error('exit 1')).run)).toBeNull()
    const calls: string[] = []
    const answer = await pickFolderNatively('linux', async (file) => {
      calls.push(file)
      if (file === 'zenity') throw missing
      return '/home/x/kde\n'
    })
    expect(answer).toBe('/home/x/kde')
    expect(calls).toEqual(['zenity', 'kdialog'])
  })

  it('Linux: says so when no dialog program exists at all', async () => {
    await expect(pickFolderNatively('linux', runner(missing).run)).rejects.toBeInstanceOf(FolderPickerUnavailableError)
  })
})

describe('singleFlight', () => {
  it('shares one open chooser between overlapping calls, then allows the next', async () => {
    let runs = 0
    let release: (value: string) => void = () => {}
    const once = singleFlight(() => { runs += 1; return new Promise<string>((resolve) => { release = resolve }) })
    const a = once()
    const b = once()
    release('x')
    expect(await a).toBe('x')
    expect(await b).toBe('x')
    expect(runs).toBe(1)
    const c = once()
    release('y')
    expect(await c).toBe('y')
    expect(runs).toBe(2)
  })
})
