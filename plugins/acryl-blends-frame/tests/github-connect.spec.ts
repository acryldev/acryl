import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { parseGithubConnectState } from '../src/contract.ts'
import { GITHUB_CONNECT_MISSING, GithubConnect, type GithubConnectPorts } from '../src/github-connect.ts'
import { createRegistryApi } from '../src/client/registry-api.ts'

/** A stand-in for `gh auth login --web`: what it prints, how it ends, and whether it was killed. */
function fakeGh() {
  const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough; stdin: PassThrough; exitCode: number | null; signalCode: string | null; killed: boolean; kill: () => boolean }
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.stdin = new PassThrough()
  child.exitCode = null
  child.signalCode = null
  child.killed = false
  child.kill = () => {
    child.killed = true
    child.signalCode = 'SIGTERM'
    return true
  }
  const exit = (code: number): void => {
    child.exitCode = code
    child.emit('exit', code)
  }
  return { child, exit, process: child as unknown as ChildProcess }
}

function portsWith(gh: ReturnType<typeof fakeGh> | undefined) {
  const ran: string[][] = []
  const ports: GithubConnectPorts = { startLogin: () => gh?.process, run: (args) => { ran.push([...args]); return 0 } }
  return { ports, ran }
}

describe('connecting GitHub from the app', () => {
  it('answers with the one-time code and the address gh printed', async () => {
    const gh = fakeGh()
    const connect = new GithubConnect(portsWith(gh).ports)
    const started = connect.start()
    gh.child.stderr.write('! One-time code (DBEB-DD6D) copied to clipboard\n')
    gh.child.stderr.write('Open this URL to continue in your web browser: https://github.com/login/device\n')
    expect(await started).toEqual({ status: 'code', code: 'DBEB-DD6D', url: 'https://github.com/login/device' })
    connect.dispose()
  })

  it('reads the code in the terminal wording too, and presses Enter once', async () => {
    const gh = fakeGh()
    let typed = ''
    gh.child.stdin.on('data', (chunk) => { typed += String(chunk) })
    const connect = new GithubConnect(portsWith(gh).ports)
    const started = connect.start()
    gh.child.stdout.write('! First copy your one-time code: AB12-CD34\nPress Enter to open https://github.com/login/device in your browser...\n')
    expect(await started).toMatchObject({ status: 'code', code: 'AB12-CD34' })
    expect(typed).toBe('\n')
    connect.dispose()
  })

  it('is connected when gh finishes, and lets git push with the same account', async () => {
    const gh = fakeGh()
    const { ports, ran } = portsWith(gh)
    const connect = new GithubConnect(ports)
    const started = connect.start()
    gh.child.stderr.write('! One-time code (DBEB-DD6D) copied to clipboard\n')
    await started
    gh.exit(0)
    expect(connect.state()).toEqual({ status: 'connected' })
    expect(ran).toEqual([['auth', 'setup-git']])
  })

  it('says plainly when GitHub did not finish, and keeps what gh said for a developer', async () => {
    const gh = fakeGh()
    const connect = new GithubConnect(portsWith(gh).ports)
    const started = connect.start()
    gh.child.stderr.write('! One-time code (DBEB-DD6D) copied to clipboard\n')
    await started
    gh.child.stderr.write('error: access denied\n')
    gh.exit(1)
    expect(connect.state()).toMatchObject({ status: 'failed', say: 'GitHub did not finish connecting. Press Connect GitHub to try again.' })
  })

  it('runs one sign-in at a time: a second press rejoins the one waiting', async () => {
    const gh = fakeGh()
    let starts = 0
    const connect = new GithubConnect({ startLogin: () => { starts += 1; return gh.process }, run: () => 0 })
    const first = connect.start()
    gh.child.stderr.write('! One-time code (DBEB-DD6D) copied to clipboard\n')
    await first
    expect(await connect.start()).toMatchObject({ code: 'DBEB-DD6D' })
    expect(starts).toBe(1)
    connect.dispose()
  })

  it('ends a waiting sign-in when the frame unloads, and starts nothing after', async () => {
    const gh = fakeGh()
    const connect = new GithubConnect(portsWith(gh).ports)
    const started = connect.start()
    gh.child.stderr.write('! One-time code (DBEB-DD6D) copied to clipboard\n')
    await started
    connect.dispose()
    expect(gh.child.killed).toBe(true)
    expect(connect.state()).toEqual({ status: 'idle' })
    expect(await connect.start()).toEqual({ status: 'idle' })
  })

  it('gives up when the code runs out', async () => {
    const gh = fakeGh()
    const connect = new GithubConnect(portsWith(gh).ports, 30)
    const started = connect.start()
    gh.child.stderr.write('! One-time code (DBEB-DD6D) copied to clipboard\n')
    await started
    await new Promise(resolve => setTimeout(resolve, 60))
    expect(connect.state()).toMatchObject({ status: 'failed', say: 'The code ran out before GitHub was connected. Press Connect GitHub to get a new one.' })
    expect(gh.child.killed).toBe(true)
  })

  it('says how to get the helper when gh is not installed', async () => {
    const connect = new GithubConnect(portsWith(undefined).ports)
    expect(await connect.start()).toEqual({ status: 'failed', say: GITHUB_CONNECT_MISSING })
  })

  it('the page accepts only a github.com address to open', () => {
    expect(parseGithubConnectState({ status: 'code', code: 'AB12-CD34', url: 'https://github.com/login/device' })).toMatchObject({ status: 'code' })
    expect(() => parseGithubConnectState({ status: 'code', code: 'AB12-CD34', url: 'https://evil.example/login' })).toThrow()
  })

  it('the page starts and reads the sign-in through the Host', async () => {
    const asked: string[] = []
    const api = createRegistryApi(async (input, init) => {
      asked.push(`${init?.method ?? 'GET'} ${input}`)
      return new Response(JSON.stringify(init?.method === 'POST' ? { status: 'code', code: 'AB12-CD34', url: 'https://github.com/login/device' } : { status: 'connected' }), { status: 200 })
    })
    expect(await api.connect.start()).toMatchObject({ code: 'AB12-CD34' })
    expect(await api.connect.state()).toEqual({ status: 'connected' })
    expect(asked).toEqual(['POST /api/acryl-blends-frame/plugins/github/connect', 'GET /api/acryl-blends-frame/plugins/github/connect'])
  })
})
