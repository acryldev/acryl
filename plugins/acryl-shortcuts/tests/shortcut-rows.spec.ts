import { describe, expect, it } from 'vitest'
import type { ShortcutCatalogEntry, ShortcutCommandId, ShortcutFixedCatalogEntry, Shortcuts } from '@acryl/ui/frame'
import { recordKey, saveBinding, shortcutGroups, type KeyPress } from '../src/client/shortcut-rows.ts'

const entry = (id: string, label: string, keys: string[], extra: Partial<ShortcutCatalogEntry> = {}): ShortcutCatalogEntry => ({
  id: id as ShortcutCommandId, label, aliases: [], keys, aria: undefined, binding: null, modified: false, conflicts: [], issue: null, ...extra,
})
const fixedEntry = (id: string, label: string, keys: string[]): ShortcutFixedCatalogEntry => ({ id: id as ShortcutCommandId, label, keys, bindings: [], group: 'input' })

const catalog = [
  entry('acryl-mount-anchors.toggle', 'Pick an element for the agent', ['⇧', '⌘', '.'], { aliases: ['inspector'] }),
  entry('session.new', 'New Session', ['⌥', '⌘', 'N'], { modified: true }),
  entry('session.fork', 'Fork session', ['⇧', '⌘', 'F'], { conflicts: ['session.new' as ShortcutCommandId] }),
]
const fixed = [fixedEntry('input.newline', 'New line', ['⇧', '↩'])]

describe('Settings > Shortcuts rows', () => {
  it('lists ACRYL commands first, then the app\'s, then the fixed ones, which cannot be edited', () => {
    const groups = shortcutGroups(catalog, fixed, '')
    expect(groups.map(group => [group.title, group.rows.map(row => row.label)])).toEqual([
      ['ACRYL', ['Pick an element for the agent']],
      ['App', ['New Session', 'Fork session']],
      ['Text editing and menus (fixed)', ['New line']],
    ])
    expect(groups[2]?.rows[0]?.editable).toBe(false)
    expect(groups[1]?.rows[0]?.modified).toBe(true)
  })

  it('says which command a conflicting binding collides with', () => {
    const fork = shortcutGroups(catalog, fixed, 'fork')[0]?.rows[0]
    expect(fork?.problem).toBe('Also used by New Session, so neither runs')
  })

  it('searches names and aliases and drops empty groups', () => {
    expect(shortcutGroups(catalog, fixed, 'INSPECTOR').map(group => group.title)).toEqual(['ACRYL'])
    expect(shortcutGroups(catalog, fixed, 'nothing like this')).toEqual([])
  })
})

const press = (code: string, key: string, mods: Partial<Pick<KeyPress, 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>> = {}): KeyPress => ({
  code, key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, isComposing: false, ...mods,
})

describe('recording a shortcut', () => {
  it('turns a key with its modifiers into a binding', () => {
    expect(recordKey(press('KeyP', 'p', { metaKey: true, shiftKey: true }))).toEqual({ kind: 'binding', binding: { code: 'KeyP', modifiers: ['shift', 'meta'] } })
  })

  it('waits through a modifier alone and cancels on a bare Escape', () => {
    expect(recordKey(press('ShiftLeft', 'Shift', { shiftKey: true }))).toEqual({ kind: 'wait' })
    expect(recordKey(press('Escape', 'Escape'))).toEqual({ kind: 'cancel' })
    expect(recordKey(press('Escape', 'Escape', { metaKey: true })).kind).toBe('binding')
  })
})

describe('saving a recorded shortcut', () => {
  const service = (overrides: Partial<ReturnType<Shortcuts['describeBinding']>> = {}, status = 'saved') => {
    const edits: unknown[] = []
    const shortcuts = {
      describeBinding: () => ({ binding: null, keys: [], issue: null, conflicts: [], ...overrides }),
      edit: async (edit: unknown, revision: unknown) => { edits.push([edit, revision]); return { status, snapshot: {} } },
      config: { getSnapshot: () => ({ revision: 'r1' }), subscribe: () => () => {} },
      catalog: { getSnapshot: () => catalog, subscribe: () => () => {} },
      fixedCatalog: { getSnapshot: () => fixed, subscribe: () => () => {} },
    } as unknown as Pick<Shortcuts, 'describeBinding' | 'edit' | 'config' | 'catalog' | 'fixedCatalog'>
    return { shortcuts, edits }
  }
  const id = 'session.fork' as ShortcutCommandId
  const binding = { code: 'KeyJ', modifiers: ['meta' as const] }

  it('saves against the revision the user was looking at', async () => {
    const { shortcuts, edits } = service()
    expect(await saveBinding(shortcuts, id, binding)).toBeNull()
    expect(edits).toEqual([[{ type: 'set', id, binding }, 'r1']])
  })

  it('refuses a combination another command has, naming it, and saves nothing', async () => {
    const { shortcuts, edits } = service({ conflicts: [id, 'session.new' as ShortcutCommandId] })
    expect(await saveBinding(shortcuts, id, binding)).toBe('Already used by New Session.')
    expect(edits).toEqual([])
  })

  it('explains a combination the device cannot use, and a failed save', async () => {
    expect(await saveBinding(service({ issue: 'reserved' }).shortcuts, id, binding)).toMatch(/reserved/u)
    expect(await saveBinding(service({}, 'write-failed').shortcuts, id, binding)).toMatch(/Could not save/u)
  })
})
