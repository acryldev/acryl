// @vitest-environment jsdom

import { request } from 'node:http'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ProjectRegistryView, WorkspaceSummary } from '../../src/projects/contract.ts'
import { BriefTab } from '../../src/client/shared-context/BriefTab.tsx'
import { briefRoutes } from '../../src/shared-context/route.ts'
import { SharedContext } from '../../src/shared-context/service.ts'
import { readWorkspaceContext } from '../../src/shared-context/tool.ts'
import { serveApi, type ServedApi } from '../serve-api.ts'

const dirs: string[] = []
const servers: ServedApi[] = []
afterEach(async () => {
  cleanup()
  for (const server of servers.splice(0)) await server.close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const workspaces: WorkspaceSummary[] = [{ id: 'default', name: 'Default', kind: 'individual', projects: [] }, { id: 'ws-1', name: 'Payments', kind: 'shared', projects: [] }]
const view: ProjectRegistryView = { paths: [], adopted: true, workspaces, current: 'ws-1' }

function shared(): SharedContext {
  const home = mkdtempSync(join(tmpdir(), 'acryl-brief-'))
  dirs.push(home)
  return new SharedContext({ registry: { view: () => view, onChange: () => () => {} }, home })
}

describe('acryl_workspace_context', () => {
  it('reads the shown workspace by default, says when a workspace shares nothing, and refuses an unknown one', () => {
    const context = shared()
    context.setBrief('ws-1', 'API first.')
    const deps = { view: () => view, promptFor: (id: string) => context.promptFor(id) }
    expect(readWorkspaceContext(deps)).toMatchObject({ workspace: 'ws-1', shared: true })
    expect(readWorkspaceContext(deps).text).toContain('API first.')
    expect(readWorkspaceContext(deps, 'default')).toMatchObject({ shared: false })
    expect(() => readWorkspaceContext(deps, 'nope')).toThrow(/acryl_workspace_list/)
  })
})

describe('the brief route', () => {
  async function serve() {
    const context = shared()
    const server = await serveApi(briefRoutes(context))
    servers.push(server)
    const { origin } = server
    const call = (method: string, path: string, body?: unknown) => new Promise<{ status: number, json: { ok: boolean, text?: string, message?: string } }>((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body)
      const req = request(`${origin}${path}`, { method, headers: { origin, 'sec-fetch-site': 'same-origin', referer: `${origin}/`, ...(payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload)) }) } }, (res) => {
        let data = ''
        res.on('data', (chunk: string) => { data += chunk })
        res.on('end', () => { resolve({ status: res.statusCode ?? 0, json: JSON.parse(data) as never }) })
      })
      req.on('error', reject)
      req.end(payload)
    })
    return { context, call }
  }

  it('saves a brief, reads it back, and rewrites the shared workspace\'s document', async () => {
    const { context, call } = await serve()
    expect((await call('POST', '/api/acryl-workspace/brief', { id: 'ws-1', text: 'Ship API first.' })).json.ok).toBe(true)
    expect((await call('GET', '/api/acryl-workspace/brief?id=ws-1')).json.text).toBe('Ship API first.')
    expect(readFileSync(context.documentPath('ws-1'), 'utf8')).toContain('Ship API first.')
  })

  it('refuses a missing id, a malformed body, and an unknown workspace with words', async () => {
    const { call } = await serve()
    expect((await call('GET', '/api/acryl-workspace/brief')).status).toBe(400)
    expect((await call('POST', '/api/acryl-workspace/brief', { text: 'x' })).status).toBe(400)
    const unknown = await call('POST', '/api/acryl-workspace/brief', { id: 'ws-9', text: 'x' })
    expect(unknown.json.message).toBe('there is no workspace ws-9')
  })
})

describe('the Workspace brief tab', () => {
  it('opens on the shown workspace\'s brief, remembers which workspace it edits, and saves', async () => {
    const saved: string[] = []
    const states: string[] = []
    const titles: string[] = []
    const deps = {
      api: { read: async () => 'Old.', save: async (_id: string, text: string) => { saved.push(text) } },
      current: () => 'ws-1',
      workspaces: () => workspaces,
    }
    const tab = { tileId: 't', title: 'Workspace brief', state: undefined, setState: (next: string) => { states.push(next) }, setTitle: (title: string) => { titles.push(title) } }
    render(<BriefTab deps={deps} tab={tab} />)
    const editor = await screen.findByDisplayValue('Old.')
    expect(states).toEqual([JSON.stringify({ workspace: 'ws-1' })])
    expect(titles).toEqual(['Brief: Payments'])
    expect(screen.getByText('Every agent in "Payments" is told this brief.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Saved' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(editor, { target: { value: 'New.' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(saved).toEqual(['New.'])
    expect(screen.getByRole('button', { name: 'Saved' })).toBeTruthy()
  })
})
