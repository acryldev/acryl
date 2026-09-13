import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { TuiCommandsService } from '../../src/tui/tui-commands-service.ts'

describe('TuiCommandsService (spec 034 T009)', () => {
  it('registers, lists, and looks up a command', () => {
    const ctx = new Context()
    const service = new TuiCommandsService(ctx)
    const open = () => ({ render: () => [], invalidate: () => {} })
    service.register({ command: '/files', description: 'Browse files', open })

    expect(service.get('/files')?.description).toBe('Browse files')
    expect(service.list().map(r => r.command)).toEqual(['/files'])
  })

  it('rejects a command that does not start with "/", or names nothing', () => {
    const service = new TuiCommandsService(new Context())
    const open = () => ({ render: () => [], invalidate: () => {} })
    expect(() => service.register({ command: 'files', description: '', open }))
      .toThrow('must start with "/"')
    expect(() => service.register({ command: '/', description: '', open }))
      .toThrow('must start with "/"')
  })

  it('rejects a duplicate command name', () => {
    const service = new TuiCommandsService(new Context())
    const open = () => ({ render: () => [], invalidate: () => {} })
    service.register({ command: '/files', description: 'first', open })
    expect(() => service.register({ command: '/files', description: 'second', open }))
      .toThrow('already registered')
  })

  it('returns a disposer that removes exactly its own registration, idempotently', () => {
    const service = new TuiCommandsService(new Context())
    const open = () => ({ render: () => [], invalidate: () => {} })
    const disposeFiles = service.register({ command: '/files', description: 'a', open })
    service.register({ command: '/notes', description: 'b', open })

    disposeFiles()
    expect(service.list().map(r => r.command)).toEqual(['/notes'])

    // Idempotent: a second call does nothing, in particular does not remove
    // a *different* /files registration that might have been added since.
    service.register({ command: '/files', description: 'c', open })
    disposeFiles()
    expect(service.get('/files')?.description).toBe('c')
  })
})
