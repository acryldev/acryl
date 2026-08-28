import { homedir } from 'node:os'
import { join } from 'node:path'
import { startDirectHost } from '../host/direct.ts'
import { createAcrylRenderer } from '../render/app.tsx'
import { parseAcrylArgs } from './grammar.ts'

interface RunningDirectHost {
  readonly runtimeState: 'ready' | 'unavailable'
  readonly profile: string
  readonly generationId: string
  dispose(): Promise<void>
}

interface RunningRenderer {
  readonly renderer: unknown
  destroy(): void
}

export interface AcrylCliDependencies {
  readonly stateDirectory: string
  readonly startDirectHost: (options: {
    readonly profile: string
    readonly stateDirectory: string
  }) => Promise<RunningDirectHost>
  readonly createRenderer: (options: {
    readonly mode: 'direct'
    readonly ownerKind: 'tui'
    readonly profile: string
    readonly generationId: string
    readonly model: string
    readonly health: 'healthy' | 'degraded'
    readonly body: string
  }) => RunningRenderer | Promise<RunningRenderer>
  readonly waitForRendererDestroy: (renderer: unknown) => Promise<void>
  readonly write: (line: string) => void
}

function defaultStateDirectory(): string {
  return join(homedir(), '.acryl', 'control')
}

function waitForRendererDestroy(renderer: unknown): Promise<void> {
  if (typeof renderer === 'object' && renderer !== null && 'waitUntilExit' in renderer) {
    const ink = renderer as { waitUntilExit(): Promise<void> }
    return ink.waitUntilExit()
  }
  if (typeof renderer === 'object' && renderer !== null && 'once' in renderer) {
    const events = renderer as { once(event: 'destroy', listener: () => void): unknown }
    return new Promise(resolve => { events.once('destroy', resolve) })
  }
  throw new Error('ACRYL renderer does not expose a destruction lifecycle')
}

const defaults: AcrylCliDependencies = {
  stateDirectory: defaultStateDirectory(),
  startDirectHost,
  createRenderer: createAcrylRenderer,
  waitForRendererDestroy,
  write: line => { process.stdout.write(`${line}\n`) },
}

function statusLine(host: RunningDirectHost): string {
  return JSON.stringify({
    mode: 'direct',
    profile: host.profile,
    generationId: host.generationId,
  })
}

/**
 * Run the direct ACRYL terminal host. JSON mode provides a short-lived,
 * scriptable ownership/status probe; interactive mode owns the renderer until
 * its normal destruction lifecycle (including Ctrl-C) completes.
 */
export async function runAcryl(
  args: readonly string[],
  supplied: Partial<AcrylCliDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaults, ...supplied }
  const invocation = parseAcrylArgs(args)
  if (invocation.command !== 'tui') {
    throw new Error(`ACRYL ${invocation.command} host is not implemented; use "acryl tui"`)
  }

  const host = await dependencies.startDirectHost({
    profile: invocation.profile ?? 'acryl',
    stateDirectory: dependencies.stateDirectory,
  })
  try {
    if (invocation.json) {
      dependencies.write(statusLine(host))
      return
    }

    const renderer = await dependencies.createRenderer({
      mode: 'direct',
      ownerKind: 'tui',
      profile: host.profile,
      generationId: host.generationId,
      model: 'unavailable',
      health: host.runtimeState === 'ready' ? 'healthy' : 'degraded',
      body: host.runtimeState === 'ready'
        ? 'Harness session and agent runtime are ready.'
        : 'Harness session runtime is unavailable.\nUse --json to verify direct-host ownership.',
    })
    try {
      await dependencies.waitForRendererDestroy(renderer.renderer)
    } finally {
      renderer.destroy()
    }
  } finally {
    await host.dispose()
  }
}
