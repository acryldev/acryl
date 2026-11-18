import { describe, expect, it } from 'vitest'
import { buildStatusLine } from '../../src/client/chrome/status-line.ts'
import { agentsByWorktree } from '../../src/client/chrome/worktree-agents.ts'

describe('buildStatusLine', () => {
  it('says the branch, the changes, who is running, and the terminals', () => {
    expect(buildStatusLine({ branch: 'main', changedFiles: 3, added: 10, removed: 2, runningAgents: 2, terminals: 1 }).map(s => s.text))
      .toEqual(['main', '3 files changed +10 -2', '2 agents running', '1 terminal'])
  })
  it('leaves out what has nothing to say', () => {
    expect(buildStatusLine({ branch: 'main', changedFiles: 0, added: 0, removed: 0, runningAgents: 0, terminals: 0 }).map(s => s.id)).toEqual(['branch'])
    expect(buildStatusLine({ branch: undefined, changedFiles: 0, added: 0, removed: 0, runningAgents: 0, terminals: 0 })).toEqual([])
  })
  it('names a detached head and words one file and one agent properly', () => {
    const texts = buildStatusLine({ branch: null, changedFiles: 1, added: 0, removed: 0, runningAgents: 1, terminals: 0 }).map(s => s.text)
    expect(texts).toEqual(['detached', '1 file changed', '1 agent running'])
  })
})

describe('agentsByWorktree', () => {
  it('lists the distinct agents of each worktree, not plain terminals or other tabs', () => {
    const result = agentsByWorktree(new Map([
      ['/a', [{ kind: 'pty', commandId: 'claude' }, { kind: 'pty', commandId: 'shell' }, { kind: 'file' }, { kind: 'pty', commandId: 'codex' }, { kind: 'pty', commandId: 'claude' }]],
      ['/b', [{ kind: 'pty', commandId: 'shell' }]],
    ]))
    expect(result.get('/a')).toEqual(['claude', 'codex'])
    expect(result.has('/b')).toBe(false)
  })
})
