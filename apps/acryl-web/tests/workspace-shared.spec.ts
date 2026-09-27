/**
 * Web runs the same ACRYL workspace Desktop does (spec 040, "Surface sharing"). This boots the real Web
 * engine on a throwaway home and checks the composition that the shared capability declarations promise,
 * plus one real Host route, so a Web that drifts from Desktop fails here rather than in a user's browser.
 */
import { execFile, execFileSync } from 'node:child_process'
import { mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { createAcrylEngineHost, createWebEngineDefinition } from 'acryl-harness-runtime'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)
const temporaryHomes: string[] = []
const initialAcrylHome = process.env.ACRYL_HOME

afterEach(async () => {
  if (initialAcrylHome === undefined) delete process.env.ACRYL_HOME
  else process.env.ACRYL_HOME = initialAcrylHome
  await Promise.all(temporaryHomes.splice(0).map(home => rm(home, { force: true, recursive: true })))
})

describe('the ACRYL workspace on the Web surface', () => {
  it('composes the workspace row, hands the frame to the ACRYL shell, and serves the workspace Host routes', async () => {
    const home = await realpath(await mkdtemp(join(tmpdir(), 'acryl-web-workspace-')))
    temporaryHomes.push(home)
    process.env.ACRYL_HOME = home
    const repo = join(home, 'repo')
    execFileSync('git', ['init', '-q', repo])
    await writeFile(join(repo, 'a.txt'), 'hello\n')

    const host = await createAcrylEngineHost({
      engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
      initialEngine: 'dsh',
      prepare: hostCtx => {
        provideCmdline(hostCtx, { args: ['--no-open', '--port', '0'], exit: () => {} })
      },
    })
    try {
      const rows = new Map([...host.ctx.loader.entries()].map(entry => [entry.options.id, entry]))
      expect(rows.get('acryl-workspace')?.fiber).toBeDefined()
      // The stock frame is off and the sidebar and conversation are on: the same toggles Desktop's advanced mode applies.
      expect(rows.get('ui-layout')?.options.disabled).toBe(true)
      expect(rows.get('ui-sidebar')?.options.disabled).not.toBe(true)
      expect(rows.get('ui-conversation')?.options.disabled).not.toBe(true)

      const server = host.ctx.get('webServer') as { port: number } | undefined
      expect(server?.port).toBeGreaterThan(0)
      const origin = `http://127.0.0.1:${String(server?.port)}`
      const headers = { origin, 'sec-fetch-site': 'same-origin' }
      // Plugin administration is the same shared plugin as on Desktop: composed, and its routes answer.
      expect(rows.get('acryl-plugin-admin')?.fiber).toBeDefined()
      const lifecycle = await fetch(`${origin}/api/acryl-plugin-admin/lifecycle`, { headers })
      expect(lifecycle.status).toBe(200)
      const snapshot = await lifecycle.json() as { entries: { entryId: string; moduleName: string }[]; blend: unknown }
      expect(snapshot.entries.some(entry => entry.moduleName === 'acryl-workspace')).toBe(true)
      expect(snapshot.blend).toBeNull()
      const architecture = await fetch(`${origin}/api/acryl-plugin-admin/architecture`, { headers })
      expect(architecture.status).toBe(200)
      // The served page's client manifest names the workspace bundle, so the browser loads the shell and the workspace.
      const connection = host.ctx.get('connection') as { authenticatedUrl(base: string): string } | undefined
      const entry = await fetch(connection?.authenticatedUrl(origin) ?? origin, { redirect: 'manual' })
      const cookie = entry.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
      const page = await fetch(origin, { headers: { cookie } })
      expect(page.status).toBe(200)
      const html = await page.text()
      expect(html).toContain('acryl-workspace')
      const repoRoute = await fetch(`${origin}/api/acryl-workspace/git/repo?cwd=${encodeURIComponent(repo)}`, { headers })
      expect(repoRoute.status).toBe(200)
      expect(await repoRoute.json()).toMatchObject({ repo: { root: repo } })
      // A real terminal starts in the worktree on Web exactly as it does on Desktop, and reads back its own output.
      const started = await fetch(`${origin}/api/acryl-workspace/pty`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ commandId: 'shell', cwd: repo }),
      })
      expect(started.status).toBe(200)
      const terminal = await started.json() as { id: string }
      // Live output and keystrokes travel over the ordered stream (WebSocket), the same one the browser terminal uses.
      const { WebSocket } = createRequire(require.resolve('acryl-workspace/package.json'))('ws') as typeof import('ws')
      const socket = new WebSocket(`${origin.replace('http', 'ws')}/api/acryl-workspace/pty/stream?id=${terminal.id}&since=0`, { headers: { ...headers, origin } })
      let output = ''
      socket.on('message', (raw) => {
        const message = JSON.parse(raw.toString('utf8')) as { t: string; data?: string }
        if (message.t === 'out') output += message.data ?? ''
      })
      await new Promise<void>((resolve, reject) => { socket.once('open', () => { resolve() }); socket.once('error', reject) })
      socket.send(JSON.stringify({ t: 'resize', cols: 200, rows: 40 }))
      socket.send(JSON.stringify({ t: 'in', data: 'pwd\r' }))
      for (let attempt = 0; attempt < 60 && !output.includes(repo); attempt += 1) {
        await new Promise(resolve => { setTimeout(resolve, 100) })
      }
      expect(output).toContain(repo)
      socket.close()
      await fetch(`${origin}/api/acryl-workspace/pty/close`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ id: terminal.id }),
      })
      // A custom agent is added by the user, saved in the ACRYL home, and started by id only.
      const added = await fetch(`${origin}/api/acryl-workspace/agents`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ agent: { id: 'echo-agent', label: 'Echo', command: '/bin/echo', args: ['custom-agent-ran'], badge: { letter: 'E', color: '#10a37f' } } }),
      })
      expect(added.status).toBe(200)
      expect(JSON.parse(await readFile(join(home, 'workspace', 'agents.json'), 'utf8'))).toHaveLength(1)
      const custom = await fetch(`${origin}/api/acryl-workspace/pty`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ commandId: 'echo-agent', cwd: repo }) })
      expect(custom.status).toBe(200)
      const customId = (await custom.json() as { id: string }).id
      let customOutput = ''
      for (let attempt = 0; attempt < 40 && !customOutput.includes('custom-agent-ran'); attempt += 1) {
        await new Promise(resolve => { setTimeout(resolve, 100) })
        customOutput = ((await (await fetch(`${origin}/api/acryl-workspace/pty?id=${customId}`, { headers })).json()) as { output: string }).output
      }
      expect(customOutput).toContain('custom-agent-ran')
      // Agent settings: the user's permission mode and a command override decide what a known agent launches.
      const settingsUrl = `${origin}/api/acryl-workspace/agents/settings`
      const post = (body: unknown) => fetch(settingsUrl, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const before = await (await fetch(settingsUrl, { headers })).json() as { permissions: string; agents: Array<{ id: string; installed: boolean; kind: string }> }
      expect(before.permissions).toBe('manual')
      expect(before.agents.find(agent => agent.id === 'echo-agent')).toMatchObject({ kind: 'custom', installed: true })
      expect((await post({ permissions: 'yolo' })).status).toBe(200)
      expect((await post({ agent: { id: 'aider', command: '/bin/echo', args: ['settings-applied'] } })).status).toBe(200)
      expect((await post({ agent: { id: 'aider', command: 'rm -rf /' } })).status).toBe(400)
      expect(JSON.parse(await readFile(join(home, 'workspace', 'agent-settings.json'), 'utf8')).permissions).toBe('yolo')
      const configured = await fetch(`${origin}/api/acryl-workspace/pty`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ commandId: 'aider', cwd: repo }) })
      expect(configured.status).toBe(200)
      const configuredId = (await configured.json() as { id: string }).id
      let configuredOutput = ''
      for (let attempt = 0; attempt < 40 && !configuredOutput.includes('settings-applied'); attempt += 1) {
        await new Promise(resolve => { setTimeout(resolve, 100) })
        configuredOutput = ((await (await fetch(`${origin}/api/acryl-workspace/pty?id=${configuredId}`, { headers })).json()) as { output: string }).output
      }
      expect(configuredOutput).toContain('--yes-always settings-applied')
      // Attention: a Claude launch carries hooks and this terminal's credentials; running a hook command as a real shell
      // makes the Host report the state, and the page's status list shows it.
      const fakeClaude = join(home, 'fake-claude.sh')
      await writeFile(fakeClaude, '#!/bin/sh\necho "TOKEN=$ACRYL_STATUS_TOKEN"\necho "URL=$ACRYL_STATUS_URL"\necho "TERM_ID=$ACRYL_TERMINAL_ID"\necho "SETTINGS=$2"\nsleep 30\n', { mode: 0o755 })
      expect((await post({ agent: { id: 'claude', command: fakeClaude } })).status).toBe(200)
      const claude = await fetch(`${origin}/api/acryl-workspace/pty`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ commandId: 'claude', cwd: repo }) })
      expect(claude.status).toBe(200)
      const claudeId = (await claude.json() as { id: string }).id
      let claudeOutput = ''
      for (let attempt = 0; attempt < 50 && !claudeOutput.includes('SETTINGS='); attempt += 1) {
        await new Promise(resolve => { setTimeout(resolve, 100) })
        claudeOutput = ((await (await fetch(`${origin}/api/acryl-workspace/pty?id=${claudeId}`, { headers })).json()) as { output: string }).output
      }
      const field = (name: string): string => new RegExp(`${name}=(.*?)\\r?\\n`).exec(claudeOutput)?.[1] ?? ''
      const hooks = JSON.parse(field('SETTINGS')) as { hooks: { Notification: Array<{ hooks: Array<{ command: string }> }> } }
      const hookCommand = hooks.hooks.Notification[0]?.hooks[0]?.command ?? ''
      expect(field('TERM_ID')).toBe(claudeId)
      await execFileAsync('sh', ['-c', hookCommand], { env: { PATH: process.env.PATH, ACRYL_STATUS_TOKEN: field('TOKEN'), ACRYL_STATUS_URL: field('URL'), ACRYL_TERMINAL_ID: field('TERM_ID') } })
      const statusList = await (await fetch(`${origin}/api/acryl-workspace/agent-status`, { headers })).json() as { statuses: Array<{ terminalId: string; state: string }> }
      expect(statusList.statuses).toContainEqual(expect.objectContaining({ terminalId: claudeId, state: 'waiting' }))
      const forged = await fetch(field('URL'), { method: 'POST', headers: { authorization: 'Bearer wrong', 'content-type': 'application/json' }, body: JSON.stringify({ terminal: claudeId, state: 'done' }) })
      expect(forged.status).toBe(403)
      const smuggled = await fetch(`${origin}/api/acryl-workspace/pty`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ commandId: 'sh -c id' }) })
      expect(smuggled.status).toBe(500)
      // Web keeps log files and serves a diagnostics archive (Settings > Support downloads it).
      expect(rows.get('acryl-support')?.fiber).toBeDefined()
      const support = await fetch(`${origin}/api/acryl-support/diagnostics`, { headers: { ...headers, referer: `${origin}/` } })
      expect(support.status).toBe(200)
      expect(support.headers.get('content-type')).toBe('application/zip')
      expect(support.headers.get('content-disposition')).toMatch(/^attachment; filename="acryl-diagnostics-[A-Za-z0-9_.-]+\.zip"$/)
      expect(Buffer.from(await support.arrayBuffer()).subarray(0, 2).toString('latin1')).toBe('PK')
      const foreign = await fetch(`${origin}/api/acryl-support/diagnostics`, { headers: { 'sec-fetch-site': 'cross-site', referer: 'http://evil.example/' } })
      expect(foreign.status).toBe(403)
      const logFiles = (await readdir(join(home, '.dsh', 'logs'))).filter(name => /^dsh-\d{4}-\d{2}-\d{2}(\.error)?\.log$/.test(name))
      expect(logFiles.length).toBeGreaterThan(0)
      // Agent Control: the tools are composed, a page connects over the same-origin channel, and a call reaches it.
      expect(rows.get('acryl-agent-control')?.fiber).toBeDefined()
      const uiTools = host.ctx.tools as unknown as { get(name: string): unknown; execute(input: { callId: string; name: string; arguments: unknown; signal: AbortSignal }): Promise<{ isError?: boolean; content?: Array<{ text?: string }> }> }
      for (const toolName of ['ui_snapshot', 'ui_click', 'ui_type', 'ui_select', 'ui_press', 'ui_scroll', 'ui_wait']) expect(uiTools.get(toolName), toolName).toBeDefined()
      const { WebSocket: PageSocket } = createRequire(require.resolve('acryl-workspace/package.json'))('ws') as typeof import('ws')
      const foreignPage = new PageSocket(`${origin.replace('http', 'ws')}/api/acryl-agent-control/channel`, { headers: { origin: 'http://evil.example' } })
      await new Promise<void>((resolve) => { foreignPage.once('error', () => { resolve() }); foreignPage.once('unexpected-response', () => { resolve() }) })
      const uiPage = new PageSocket(`${origin.replace('http', 'ws')}/api/acryl-agent-control/channel`, { headers: { ...headers, origin } })
      uiPage.on('message', (raw) => {
        const call = JSON.parse(raw.toString('utf8')) as { id: number; request: { op: string } }
        uiPage.send(JSON.stringify({ t: 'result', id: call.id, value: { generation: 1, title: 'ACRYL', total: 1, nodes: [{ ref: '1.1', role: 'button', name: 'Add project', depth: 0, states: [] }] } }))
      })
      await new Promise<void>((resolve, reject) => { uiPage.once('open', () => { resolve() }); uiPage.once('error', reject) })
      uiPage.send(JSON.stringify({ t: 'hello', windowId: 'e2e', focused: true }))
      await new Promise(resolve => { setTimeout(resolve, 200) })
      const looked = await uiTools.execute({ callId: 'e2e-1', name: 'ui_snapshot', arguments: {}, signal: new AbortController().signal })
      expect(looked.isError ?? false).toBe(false)
      expect(JSON.stringify(looked)).toContain('Add project')
      // Approval is per call: with nobody to answer, a click is denied and never reaches the uiPage.
      const clicked = await uiTools.execute({ callId: 'e2e-2', name: 'ui_click', arguments: { ref: '1.1' }, signal: new AbortController().signal })
      expect(clicked.isError).toBe(true)
      uiPage.close()
      const tree = await fetch(`${origin}/api/acryl-workspace/files/tree?path=${encodeURIComponent(repo)}&dir=`, { headers })
      expect(tree.status).toBe(200)
      expect(await tree.json()).toMatchObject({ entries: [{ name: 'a.txt', kind: 'file' }] })
      // Staging and committing work the same: the workspace's git write routes are the shared plugin's, on Web too.
      execFileSync('git', ['config', 'user.email', 't@t'], { cwd: repo })
      execFileSync('git', ['config', 'user.name', 't'], { cwd: repo })
      const stage = await fetch(`${origin}/api/acryl-workspace/git/stage`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ path: repo, files: ['a.txt'] }),
      })
      expect(stage.status).toBe(200)
      const commit = await fetch(`${origin}/api/acryl-workspace/git/commit`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ path: repo, message: 'first commit from web' }),
      })
      expect(commit.status).toBe(200)
      expect(await commit.json()).toMatchObject({ subject: 'first commit from web' })
      // Editing works the same: read a file, save it through the confined route, and see it on disk.
      const read = await (await fetch(`${origin}/api/acryl-workspace/files/read?path=${encodeURIComponent(repo)}&file=a.txt`, { headers })).json() as { mtimeMs: number }
      const saved = await fetch(`${origin}/api/acryl-workspace/files/write`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ path: repo, file: 'a.txt', content: 'saved on web\n', expectedMtimeMs: read.mtimeMs }),
      })
      expect(saved.status).toBe(200)
      expect(await readFile(join(repo, 'a.txt'), 'utf8')).toBe('saved on web\n')
    } finally {
      await host.dispose()
    }
  }, 60_000)
})
