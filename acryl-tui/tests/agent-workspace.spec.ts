import { describe, expect, it } from 'vitest'
import {
  formatAgentWorkspaceScreen,
  projectAgentWorkspace,
} from '../src/render/screens/agent-workspace.ts'

const source = {
  sessions: [
    { id: 'session-1', title: 'Refactor control host', status: 'idle' as const },
    { id: 'session-2', title: 'Review lifecycle', status: 'running' as const },
  ],
  selectedSessionId: 'session-1',
  transcript: [
    { id: 'message-1', author: 'user' as const, text: 'Implement direct mode' },
    { id: 'message-2', author: 'assistant' as const, text: 'Direct mode is ready' },
  ],
  toolCards: [
    { callId: 'call-1', toolName: 'shell', status: 'succeeded' as const, summary: 'tests passed' },
  ],
  approvals: [
    { id: 'approval-1', toolName: 'filesystem.write', status: 'pending' as const, reason: 'Modify host code' },
  ],
  jobs: [
    { id: 'job-1', label: 'workspace check', status: 'running' as const },
  ],
  composer: { enabled: true, placeholder: 'Message ACRYL' },
}

describe('agent workspace screen', () => {
  it('projects durable session records into all workspace regions', () => {
    const screen = projectAgentWorkspace(source)

    expect(screen.sessionControls).toEqual({ canCreate: true, resumeSessionId: 'session-1' })
    expect(screen.composer).toEqual(source.composer)
    expect(formatAgentWorkspaceScreen(screen)).toContain('Sessions\n* Refactor control host [idle]')
    expect(formatAgentWorkspaceScreen(screen)).toContain('Transcript\nuser: Implement direct mode')
    expect(formatAgentWorkspaceScreen(screen)).toContain('Tools\nshell [succeeded]: tests passed')
    expect(formatAgentWorkspaceScreen(screen)).toContain('Approvals\nfilesystem.write [pending]: Modify host code')
    expect(formatAgentWorkspaceScreen(screen)).toContain('Jobs\nworkspace check [running]')
  })

  it('rejects a selected session that is absent from the durable session list', () => {
    expect(() => projectAgentWorkspace({ ...source, selectedSessionId: 'missing' }))
      .toThrow('selected session')
  })

  it('rejects duplicate durable record identities', () => {
    expect(() => projectAgentWorkspace({
      ...source,
      sessions: [...source.sessions, source.sessions[0]!],
    })).toThrow('duplicate session')
  })
})
