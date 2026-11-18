import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { WorkspacePtyRegistry, type WorkspacePtyProcess, type WorkspacePtySpawn } from '../../src/pty/service.ts'
import { chatContextText } from '../../src/shared-context/chat.ts'
import { WORKSPACE_CONTEXT_ENV, contextLaunch } from '../../src/shared-context/launch.ts'

const context = { prompt: '<acryl_workspace>…</acryl_workspace>', documentPath: '/h/workspaces/s/WORKSPACE.md', otherProjects: ['/p/web', '/p/docs'], workspaceFolder: '/h/workspaces/s' }

describe('contextLaunch', () => {
  it('gives Claude Code and Codex the other projects, the workspace folder and the context, Pi the context, everyone the document path', () => {
    expect(contextLaunch('claude', context)).toEqual({ args: ['--add-dir', '/p/web', '/p/docs', '/h/workspaces/s', '--append-system-prompt', context.prompt], env: { [WORKSPACE_CONTEXT_ENV]: context.documentPath } })
    expect(contextLaunch('pi', context).args).toEqual(['--append-system-prompt', context.prompt])
    expect(contextLaunch('codex', context).args).toEqual(['--add-dir', '/p/web', '--add-dir', '/p/docs', '--add-dir', '/h/workspaces/s', '-c', `developer_instructions=${JSON.stringify(context.prompt)}`])
    expect(contextLaunch('aider', context)).toEqual({ args: [], env: { [WORKSPACE_CONTEXT_ENV]: context.documentPath } })
  })

  it('still adds the workspace folder when the workspace has no other project', () => {
    expect(contextLaunch('claude', { ...context, otherProjects: [] }).args).toEqual(['--add-dir', '/h/workspaces/s', '--append-system-prompt', context.prompt])
  })
})

describe('WorkspacePtyRegistry with a launch context', () => {
  const folder = mkdtempSync(join(tmpdir(), 'acryl-pty-ctx-'))
  afterAll(() => { rmSync(folder, { recursive: true, force: true }) })

  async function start(commandId: string) {
    const spawned: { args: readonly string[], env: Record<string, string | undefined> }[] = []
    const spawn: WorkspacePtySpawn = (_file, args, options) => {
      spawned.push({ args, env: options.env as Record<string, string | undefined> })
      return { onData: () => ({ dispose() {} }), onExit: () => ({ dispose() {} }), write() {}, resize() {}, kill() {} } as unknown as WorkspacePtyProcess
    }
    const asked: string[] = []
    const registry = new WorkspacePtyRegistry({
      spawn, cwd: folder, platform: 'darwin', env: { SHELL: '/bin/sh', PATH: '/usr/bin:/bin' }, createId: () => 'pty_test',
      agents: { resolve: id => (id === 'claude' ? { command: '/bin/echo', args: ['--model', 'x'] } : undefined) },
      launchContext: { launchFor: (id, cwd) => { asked.push(`${id}@${cwd}`); return contextLaunch(id, context) } },
    })
    await registry.start(commandId, folder)
    return { spawned, asked }
  }

  it('starts an agent with its context before its own arguments, and the document path in its environment', async () => {
    const { spawned, asked } = await start('claude')
    expect(asked).toEqual([`claude@${folder}`])
    expect(spawned[0]?.args).toEqual(['--add-dir', '/p/web', '/p/docs', '/h/workspaces/s', '--append-system-prompt', context.prompt, '--model', 'x'])
    expect(spawned[0]?.env[WORKSPACE_CONTEXT_ENV]).toBe(context.documentPath)
  })

  it('gives the shell nothing', async () => {
    const { spawned, asked } = await start('shell')
    expect(asked).toEqual([])
    expect(spawned[0]?.env[WORKSPACE_CONTEXT_ENV]).toBeUndefined()
  })
})

describe('chatContextText', () => {
  const contextFor = (folder: string) => (folder === '/p/api' ? { prompt: 'BLOCK' } : undefined)
  it('contributes the block for a chat in a shared workspace, nothing for any other chat or an assembly without a session', () => {
    expect(chatContextText(contextFor, { agent: { session: { header: { cwd: '/p/api' } } } })).toBe('BLOCK')
    expect(chatContextText(contextFor, { agent: { session: { header: { cwd: '/elsewhere' } } } })).toBe('')
    expect(chatContextText(contextFor, {})).toBe('')
  })
})
