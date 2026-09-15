import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { TuiCommandsService } from '../../src/tui/tui-commands-service.ts'

const open = () => ({ render: () => [], invalidate: () => {} })

describe('TuiCommandsService (spec 034 T009)', () => {
  it('registers and lists a command, unnamespaced when registered outside a Loader entry', () => {
    const ctx = new Context()
    const service = new TuiCommandsService(ctx)
    service.register({ command: '/files', description: 'Browse files', open })

    const [entry] = service.list()
    expect(entry?.description).toBe('Browse files')
    expect(entry?.packageName).toBeUndefined()
    expect(service.resolve('/files')).toBe(entry)
  })

  it('rejects a command that does not start with "/", or names nothing', () => {
    const service = new TuiCommandsService(new Context())
    expect(() => service.register({ command: 'files', description: '', open }))
      .toThrow('must start with "/"')
    expect(() => service.register({ command: '/', description: '', open }))
      .toThrow('must start with "/"')
  })

  it('never throws on a duplicate bare command name - two plugins may both register /files', () => {
    const service = new TuiCommandsService(new Context())
    service.register({ command: '/files', description: 'first', open })
    service.register({ command: '/files', description: 'second', open })
    expect(service.list()).toHaveLength(2)
  })

  it('returns a disposer that removes exactly its own registration, idempotently', () => {
    const service = new TuiCommandsService(new Context())
    const disposeFiles = service.register({ command: '/files', description: 'a', open })
    service.register({ command: '/notes', description: 'b', open })

    disposeFiles()
    expect(service.list().map(r => r.command)).toEqual(['/notes'])

    // Idempotent: a second call does nothing, in particular does not remove
    // a *different* /files registration added since.
    service.register({ command: '/files', description: 'c', open })
    disposeFiles()
    expect(service.list().map(r => r.description)).toEqual(['b', 'c'])
  })

  describe('resolve() addressing forms', () => {
    function harness(): { service: TuiCommandsService, packageA: string, packageB: string } {
      const service = new TuiCommandsService(new Context())
      const packageA = 'acryl-dsh-editor-plugin-cli'
      const packageB = 'quick-editor-plugin-cli'
      service.register({ command: '/files', description: 'Browse files (A)', packageName: packageA, open })
      service.register({ command: '/files', description: 'Browse files (B)', packageName: packageB, open })
      service.register({ command: '/notes', description: 'Notes', packageName: packageA, open })
      return { service, packageA, packageB }
    }

    it('bare form resolves only when exactly one registrant owns it', () => {
      const { service } = harness()
      expect(service.resolve('/files')).toBeUndefined() // 2 registrants - ambiguous
      expect(service.resolve('/notes')?.description).toBe('Notes') // 1 registrant - unambiguous
    })

    it('suffixed form /<method>:<packageName> always resolves, collision or not', () => {
      const { service, packageA, packageB } = harness()
      expect(service.resolve(`/files:${packageA}`)?.description).toBe('Browse files (A)')
      expect(service.resolve(`/files:${packageB}`)?.description).toBe('Browse files (B)')
      expect(service.resolve(`/notes:${packageA}`)?.description).toBe('Notes')
    })

    it('fully qualified /plugin:<packageName>/<method> always resolves, collision or not', () => {
      const { service, packageA } = harness()
      expect(service.resolve(`/plugin:${packageA}/files`)?.description).toBe('Browse files (A)')
      expect(service.resolve('/plugin:does-not-exist/files')).toBeUndefined()
    })
  })
})
