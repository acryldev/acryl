/** Windows guard for upstream agent presets that require unsupported PTY inspection. */

import type { Context } from '@deepseek-ai/cordis'
import AgentPresets, { type AgentPreset } from '@deepseek-ai/dsh-agent-presets'
// `dsh-agent-presets` throws these through the converged Remote failure
// vocabulary (single `RemoteError` with a domain-prefixed code map) rather
// than dedicated error classes — see `RemoteErrorDetailsMap`'s
// `agent-preset/not-found` and `agent-preset/invalid` entries.
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'

/** Upstream preset whose persistent Bash terminal cannot run on win32. */
export const WINDOWS_UNSUPPORTED_PRESET = 'minimal'

/** Upstream preset that selects the supported PowerShell toolchain on win32. */
export const WINDOWS_SAFE_PRESET = 'standard'

/** Mirror `AgentPresets.resolve`'s own `agent-preset/not-found` failure for the hidden preset. */
function unknownPreset(id: string, available: readonly string[]): RemoteError<'agent-preset/not-found'> {
  return new RemoteError(
    'agent-preset/not-found',
    `agent-presets: preset "${id}" not found (available: ${available.join(', ') || 'none'})`,
    { agentPreset: id, available },
  )
}

/** Mirror `authoring.ts`'s private `presetExists` failure for the hidden preset's id. */
function presetExists(id: string): RemoteError<'agent-preset/invalid'> {
  const reason = `preset "${id}" already exists — a copy never overwrites; delete the existing preset first or choose another id`
  return new RemoteError('agent-preset/invalid', `agent-presets: ${reason}`, { agentPreset: id, reason })
}

/** Agent-preset roster that keeps Windows sessions on a supported shell composition. */
export class WindowsAgentPresets extends AgentPresets {
  override get defaultId(): string {
    const id = super.defaultId
    return id === WINDOWS_UNSUPPORTED_PRESET ? WINDOWS_SAFE_PRESET : id
  }

  override async list(): Promise<AgentPreset[]> {
    return (await super.list()).filter(preset => preset.id !== WINDOWS_UNSUPPORTED_PRESET)
  }

  override async resolve(id?: string): Promise<AgentPreset> {
    if (id !== WINDOWS_UNSUPPORTED_PRESET) return await super.resolve(id)
    const preset = (await super.list()).find(candidate => candidate.id === id)
    if (preset !== undefined) return preset
    throw unknownPreset(id, (await this.list()).map(candidate => candidate.id))
  }

  override async recompose(agentCtx: Context, id: string): Promise<AgentPreset> {
    if (id === WINDOWS_UNSUPPORTED_PRESET) {
      throw unknownPreset(id, (await this.list()).map(candidate => candidate.id))
    }
    return await super.recompose(agentCtx, id)
  }

  override async copy(from: string, id: string, name?: string): Promise<void> {
    if (id === WINDOWS_UNSUPPORTED_PRESET) throw presetExists(id)
    await super.copy(from, id, name)
  }
}

export default WindowsAgentPresets
