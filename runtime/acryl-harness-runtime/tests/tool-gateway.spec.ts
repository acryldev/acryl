/**
 * The tool gateway (T051) on the real web engine, the real tool registry and the real ACRYL extension tools. What this pins:
 * the gateway offers only the allowlisted extension tools with their real JSON Schemas; a call through it runs the tool; and the instance
 * secret authenticates the caller but does not bypass per-tool policy: a `tools/pre-execute` policy that denies a tool denies it for a gateway
 * caller exactly as for the DSH chat (the call goes through the registry's own `execute`, so every hook in the pipeline runs). The REST and
 * MCP faces share one gateway, so each is checked against the same policy.
 */
import { existsSync, readFileSync, mkdtempSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { afterEach, describe, expect, it } from 'vitest'
import { createWebEngineDefinition } from '../src/engine-dsh.ts'
import { createAcrylEngineHost } from '../src/engine-host.ts'
import { fileURLToPath } from 'node:url'

const initialDshHome = process.env.DSH_HOME
const folders: string[] = []
afterEach(async () => {
  if (initialDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = initialDshHome
  await Promise.all(folders.splice(0).map(folder => rm(folder, { force: true, recursive: true })))
})

type Host = Awaited<ReturnType<typeof createAcrylEngineHost>>

async function boot(): Promise<{ host: Host, origin: string, secret: string }> {
  const home = await mkdtemp(join(tmpdir(), 'acryl-gateway-'))
  folders.push(home)
  process.env.DSH_HOME = home
  const host = await createAcrylEngineHost({
    engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
    initialEngine: 'dsh',
    prepare: ctx => { provideCmdline(ctx, { args: ['--no-open', '--port', '0'], exit: () => {} }) },
  })
  for (const entry of host.ctx.loader.entries()) {
    if (entry.options.id === 'acryl-agent-control') entry.update({ config: { online: true, approval: 'none' } })
  }
  await host.ctx.loader.await()
  await new Promise(resolve => setTimeout(resolve, 300))
  const web = host.ctx.get('webServer' as never) as { port: number }
  const secretFile = join(home, 'agent-control-secret')
  const alt = join(home, '.dsh', 'agent-control-secret')
  const path = existsSync(secretFile) ? secretFile : alt
  return { host, origin: `http://127.0.0.1:${String(web.port)}`, secret: readFileSync(path, 'utf8').trim() }
}

async function post(url: string, secret: string, body: unknown): Promise<{ status: number, json: any }> {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` }, body: JSON.stringify(body) })
  return { status: response.status, json: await response.json() }
}

describe('the tool gateway on the real engine', () => {
  it('offers the real extension tools with their schemas, runs one, and refuses everything outside the allowlist', async () => {
    const { host, origin, secret } = await boot()
    try {
      const listed = await (await fetch(`${origin}/api/acryl-agent-control/online/tools`, { headers: { authorization: `Bearer ${secret}` } })).json() as { tools: Array<{ name: string, inputSchema: any }> }
      const names = listed.tools.map(tool => tool.name)
      expect(names).toEqual(expect.arrayContaining(['acryl_extension_lookup', 'acryl_verify_plugin', 'acryl_install_plugin', 'acryl_list_plugins', 'acryl_remove_plugin']))
      expect(names).not.toContain('bash')
      expect(listed.tools.find(tool => tool.name === 'acryl_install_plugin')?.inputSchema).toMatchObject({ type: 'object', required: ['path'] })

      expect((await post(`${origin}/api/acryl-agent-control/online/tools`, secret, { name: 'acryl_list_plugins', arguments: {} })).json).toMatchObject({ ok: true, isError: false })
      expect((await post(`${origin}/api/acryl-agent-control/online/tools`, secret, { name: 'bash', arguments: { command: 'id' } })).json).toMatchObject({ ok: false, code: 'not-exposed' })
      expect((await post(`${origin}/api/acryl-agent-control/online/tools`, 'wrong-secret', { name: 'acryl_list_plugins' })).status).toBe(403)
    } finally { await host.dispose() }
  }, 120_000)

  it('does not let the secret bypass tool policy: a denying pre-execute policy denies a gateway call, over REST and over MCP', async () => {
    const { host, origin, secret } = await boot()
    const seen: string[] = []
    const dispose = host.ctx.on('tools/pre-execute', async (exec: { name: string }, next: () => Promise<unknown>) => {
      seen.push(exec.name)
      if (exec.name === 'acryl_remove_plugin') return { kind: 'deny', reason: 'removal is blocked by test policy' }
      return next()
    })
    try {
      const rest = await post(`${origin}/api/acryl-agent-control/online/tools`, secret, { name: 'acryl_remove_plugin', arguments: { package: 'anything' } })
      expect(rest.json).toMatchObject({ ok: true, isError: true })
      expect(rest.json.text).toContain('removal is blocked by test policy')

      const mcp = await post(`${origin}/api/acryl-agent-control/mcp`, secret, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'acryl_remove_plugin', arguments: { package: 'anything' } } })
      expect(mcp.json.result).toMatchObject({ isError: true })
      expect(JSON.stringify(mcp.json.result.content)).toContain('removal is blocked by test policy')

      // The policy saw both calls (so the pipeline ran), and an un-denied tool through the same path still works.
      expect(seen.filter(name => name === 'acryl_remove_plugin')).toHaveLength(2)
      expect((await post(`${origin}/api/acryl-agent-control/online/tools`, secret, { name: 'acryl_list_plugins', arguments: {} })).json).toMatchObject({ ok: true, isError: false })
      expect(seen).toContain('acryl_list_plugins')
    } finally { dispose(); await host.dispose() }
  }, 120_000)

  it('installs and removes a plugin an outside agent wrote, over MCP, through the same pipeline', async () => {
    const { host, origin, secret } = await boot()
    const { cpSync, writeFileSync } = await import('node:fs')
    const example = fileURLToPath(new URL('../../../plugins/acryl-extension-context/example-plugins/packages/tool-basic/', import.meta.url))
    const dir = mkdtempSync(join(tmpdir(), 'acryl-gateway-plugin-'))
    folders.push(dir)
    cpSync(example, dir, { recursive: true })
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Record<string, unknown>
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ ...manifest, name: 'acryl-gateway-probe' }))
    writeFileSync(join(dir, 'cordis.patch.yml'), readFileSync(join(dir, 'cordis.patch.yml'), 'utf8').replaceAll('acryl-example-tool', 'acryl-gateway-probe').replaceAll('example-tool', 'gateway-probe'))
    writeFileSync(join(dir, 'index.js'), readFileSync(join(dir, 'index.js'), 'utf8').replace("'acryl-example-tool'", "'acryl-gateway-probe'").replace("name: 'example_echo'", "name: 'gateway_probe'"))
    try {
      const call = (id: number, name: string, args: unknown) => post(`${origin}/api/acryl-agent-control/mcp`, secret, { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } })
      expect((await call(1, 'acryl_verify_plugin', { path: dir })).json.result.isError).toBe(false)
      expect((await call(2, 'acryl_install_plugin', { path: dir })).json.result.isError).toBe(false)
      expect(host.ctx.get('tools' as never) && (host.ctx.get('tools' as never) as { get(n: string): unknown }).get('gateway_probe')).toBeDefined()
      expect((await call(3, 'acryl_list_plugins', {})).json.result.content[0].text).toContain('acryl-gateway-probe')
      expect((await call(4, 'acryl_remove_plugin', { package: 'acryl-gateway-probe' })).json.result.isError).toBe(false)
      expect((host.ctx.get('tools' as never) as { get(n: string): unknown }).get('gateway_probe')).toBeUndefined()
    } finally { await host.dispose() }
  }, 240_000)
})
