/**
 * T044 (spec 001), the part that needs no model: an agent extends ACRYL through the tools it is given. The tools are executed through
 * the real registry (`tools.execute`, the path an agent's call takes, policy hooks included) on the real web engine: verify a plugin it
 * wrote, install it live, call what it added, edit it and update it live, see it listed, remove it. What an agent decides to write
 * is the model's part and waits for a key (see R30).
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { afterEach, describe, expect, it } from 'vitest'
import { createWebEngineDefinition } from '../src/engine-dsh.ts'
import { createAcrylEngineHost } from '../src/engine-host.ts'

const example = new URL('../../../plugins/acryl-extension-context/example-plugins/packages/tool-basic/', import.meta.url).pathname
const initialDshHome = process.env.DSH_HOME
const folders: string[] = []

afterEach(async () => {
  if (initialDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = initialDshHome
  await Promise.all(folders.splice(0).map(folder => rm(folder, { force: true, recursive: true })))
})

type ToolResult = Record<string, unknown>
interface Tools { execute(input: { callId: string, name: string, arguments: unknown, signal: AbortSignal }): Promise<ToolResult> }

/** The package an agent would write: a model-callable tool whose answer carries `version`. */
function authorPlugin(version: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'acryl-authored-'))
  folders.push(dir)
  cpSync(example, dir, { recursive: true })
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Record<string, unknown>
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ ...manifest, name: 'acryl-authored-probe', version: '0.1.0' }, null, 2))
  writeFileSync(join(dir, 'cordis.patch.yml'), readFileSync(join(dir, 'cordis.patch.yml'), 'utf8').replaceAll('acryl-example-tool', 'acryl-authored-probe').replaceAll('example-tool', 'authored-probe'))
  editPlugin(dir, version)
  return dir
}

function editPlugin(dir: string, version: string): void {
  const source = readFileSync(example + 'index.js', 'utf8')
    .replace("'acryl-example-tool'", "'acryl-authored-probe'")
    .replace("name: 'example_echo'", "name: 'authored_probe'")
    .replace('return args.message.toUpperCase()', `return 'probe ${version}: ' + args.message.toUpperCase()`)
  writeFileSync(join(dir, 'index.js'), source)
}

describe('an agent extends ACRYL through its tools (no model)', () => {
  it('verifies, installs, updates and removes a plugin it wrote, live, on the web engine', async () => {
    const home = await mkdtemp(join(tmpdir(), 'acryl-self-hosting-'))
    folders.push(home)
    process.env.DSH_HOME = home
    const host = await createAcrylEngineHost({
      engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
      initialEngine: 'dsh',
      prepare: hostCtx => { provideCmdline(hostCtx, { args: ['--no-open', '--port', '0'], exit: () => {} }) },
    })
    const tools = host.ctx.get('tools' as never) as unknown as Tools
    let call = 0
    const run = async (name: string, args: unknown): Promise<string> => JSON.stringify(await tools.execute({ callId: `c${String(++call)}`, name, arguments: args, signal: new AbortController().signal }))
    try {
      const dir = authorPlugin('v1')

      const verified = await run('acryl_verify_plugin', { path: dir })
      expect(verified).not.toMatch(/"isError":\s*true/)

      const installed = await run('acryl_install_plugin', { path: dir })
      expect(installed).not.toMatch(/"isError":\s*true/)
      expect(await run('authored_probe', { message: 'hi' })).toContain('probe v1: HI')
      expect(await run('acryl_list_plugins', {})).toContain('acryl-authored-probe')

      // The agent edits its own plugin and installs again: an update, live, no restart.
      editPlugin(dir, 'v2')
      expect(await run('acryl_install_plugin', { path: dir })).not.toMatch(/"isError":\s*true/)
      expect(await run('authored_probe', { message: 'hi' })).toContain('probe v2: HI')

      // A plugin that fails to activate is refused with the exact error and the install is undone (as on 0.1.5: an update that
      // fails is rolled back by removal, it does not bring the previous working version back - T050 tracks that).
      writeFileSync(join(dir, 'index.js'), 'export const name = "acryl-authored-probe"\nexport function apply() { throw new Error("authored on purpose") }\n')
      const refused = await run('acryl_install_plugin', { path: dir })
      expect(refused).toContain('authored on purpose')
      expect(refused).toContain('rolledBack')
      expect(await run('authored_probe', { message: 'hi' })).toContain('unknown tool')
      expect(await run('acryl_list_plugins', {})).not.toContain('acryl-authored-probe')

      // The agent fixes it and installs again: back to working, then removed live.
      editPlugin(dir, 'v3')
      expect(await run('acryl_install_plugin', { path: dir })).not.toMatch(/"isError":\s*true/)
      expect(await run('authored_probe', { message: 'hi' })).toContain('probe v3: HI')
      expect(await run('acryl_remove_plugin', { package: 'acryl-authored-probe' })).not.toMatch(/"isError":\s*true/)
      expect(await run('authored_probe', { message: 'hi' })).toContain('unknown tool')
      expect(await run('acryl_list_plugins', {})).not.toContain('acryl-authored-probe')
    } finally {
      await host.dispose()
    }
  }, 240_000)
})
