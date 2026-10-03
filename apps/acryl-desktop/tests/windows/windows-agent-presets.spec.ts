import { Context } from '@deepseek-ai/cordis'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
// `dsh-agent-presets` throws through the converged Remote failure vocabulary
// (one `RemoteError`, discriminated by `code` — "never by instanceof" per its
// own doc comment), not the dedicated error classes this test used to import.
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { afterEach, describe, expect, it } from 'vitest'
import {
  WindowsAgentPresets,
  WINDOWS_SAFE_PRESET,
  WINDOWS_UNSUPPORTED_PRESET,
} from '../../src/windows/windows-agent-presets.ts'

const contexts: Context[] = []

/** DSH 0.2 declares a preset as a registered definition (a `preset-<id>` row in a real profile); `order` fixes the roster order. */
const FIXTURE_PRESETS: readonly { id: string, order: number }[] = [
  { id: 'code', order: 0 },
  { id: WINDOWS_SAFE_PRESET, order: 1 },
  { id: WINDOWS_UNSUPPORTED_PRESET, order: 2 },
]

async function createRoster(defaultId: string): Promise<WindowsAgentPresets> {
  const ctx = new Context()
  // The registry reports its preset-selection projection onto `ctx.sessionProjections`.
  new SessionProjectionRegistry(ctx)
  contexts.push(ctx)
  const presets = new WindowsAgentPresets(ctx, WindowsAgentPresets.Config({ default: defaultId }))
  for (const preset of FIXTURE_PRESETS) await presets.register({ id: preset.id, order: preset.order, plugins: [] })
  return presets
}

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

describe('Windows agent preset guard', () => {
  it('hides the unsupported minimal preset from discovery', async () => {
    const presets = await createRoster(WINDOWS_SAFE_PRESET)

    expect((await presets.list()).map(preset => preset.id)).toEqual([
      'code',
      WINDOWS_SAFE_PRESET,
    ])
  })

  it('falls back to standard when minimal was saved as the default', async () => {
    const presets = await createRoster(WINDOWS_UNSUPPORTED_PRESET)

    expect(presets.defaultId).toBe(WINDOWS_SAFE_PRESET)
    await expect(presets.resolve()).resolves.toMatchObject({ id: WINDOWS_SAFE_PRESET })
  })

  it('preserves exact resolution for legacy sessions that recorded minimal', async () => {
    const presets = await createRoster(WINDOWS_SAFE_PRESET)

    await expect(presets.resolve(WINDOWS_UNSUPPORTED_PRESET))
      .resolves.toMatchObject({ id: WINDOWS_UNSUPPORTED_PRESET })
  })

  it('rejects switching a blank session to the hidden minimal preset', async () => {
    const presets = await createRoster(WINDOWS_SAFE_PRESET)
    const agentCtx = new Context()
    contexts.push(agentCtx)

    await expect(presets.recompose(agentCtx, WINDOWS_UNSUPPORTED_PRESET))
      .rejects.toMatchObject({ code: 'agent-preset/not-found' } satisfies Partial<RemoteError>)
  })
})
