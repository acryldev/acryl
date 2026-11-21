import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { WorkspacePtyRegistry, type WorkspacePtySpawn } from '../../src/pty/service.ts'

// A login shell that reports an empty folder as its PATH, so no agent is found whatever this machine has installed.
const root = mkdtempSync(join(tmpdir(), 'acryl-missing-agent-'))
const shell = join(root, 'shell')
writeFileSync(shell, `#!/bin/sh\necho '${root}'\n`)
chmodSync(shell, 0o755)
afterAll(() => { rmSync(root, { recursive: true, force: true }) })

function registry(): WorkspacePtyRegistry {
  const spawn: WorkspacePtySpawn = () => { throw new Error('nothing may be spawned') }
  return new WorkspacePtyRegistry({ spawn, platform: 'darwin', env: { SHELL: shell, HOME: root, PATH: root }, createId: () => 'pty_test' })
}

describe('a PTY agent that is not installed', () => {
  it.each([
    ['pi', 'npm i -g @earendil-works/pi-coding-agent'],
    ['claude', 'npm i -g @anthropic-ai/claude-code'],
    ['codex', 'npm i -g @openai/codex'],
  ])('%s: the error carries the install command', async (id, command) => {
    await expect(registry().start(id)).rejects.toThrow(`command not found in PATH: ${id} - install it with: ${command}`)
  })

  it('an agent without a single install command keeps the plain message', async () => {
    const failure = registry().start('aider')
    await expect(failure).rejects.toThrow('command not found in PATH: aider')
    await expect(failure).rejects.not.toThrow('install it with')
  })
})
