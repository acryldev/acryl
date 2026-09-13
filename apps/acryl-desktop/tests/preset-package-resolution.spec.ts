/**
 * Regression guard for the live-reported bug where "Minimal mode", "PTC
 * mode", and "Creator mode" all failed session creation because
 * `@deepseek-ai/dsh-agent-presets` names plugin packages by bare specifier
 * that the consuming app must declare as its own dependency (isolated pnpm
 * node-linker does not hoist a transitive dependency's own dependencies into
 * the consumer's resolvable graph). `dsh-agent-presets` shipped six such
 * packages `acryl-desktop`'s package.json never declared - `dsh-terminal-bash`,
 * `dsh-tool-bash-persistent`, `dsh-tool-pwsh-persistent`,
 * `dsh-tool-str-replace-editor` (minimal), `dsh-tool-cordis` (the "cordis"
 * Creator-mode preset), and `dsh-agent-tool-presentation` (PTC) - so every
 * preset using them failed at exactly the resolution step
 * `package-overlay.ts` performs for real installs.
 *
 * This test drives the identical `findPackageJSON` resolution
 * `package-overlay.ts` uses, from the same install-anchor
 * (`acryl-desktop/package.json`), against every package name every shipped
 * preset actually references - so a future `dsh-agent-presets` bump that
 * adds a new required package fails this test instead of only surfacing as
 * a session-create crash inside the running app.
 */

import { findPackageJSON } from 'node:module'
import { createRequire } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const installAnchor = new URL('../package.json', import.meta.url).href

const presetsRoot = join(
  dirname(require.resolve('@deepseek-ai/dsh-agent-presets/package.json')),
  'presets',
)

/** Every bare `@deepseek-ai/...` plugin specifier named across all shipped presets. */
function referencedPackageNames(): Set<string> {
  const names = new Set<string>()
  for (const presetId of readdirSync(presetsRoot, { withFileTypes: true })) {
    if (!presetId.isDirectory()) continue
    const configPath = join(presetsRoot, presetId.name, 'agent.cordis.yml')
    const text = readFileSync(configPath, 'utf8')
    for (const match of text.matchAll(/name:\s*'(@deepseek-ai\/[a-z0-9-]+)'/g)) {
      names.add(match[1]!)
    }
  }
  return names
}

describe('Shipped agent-preset packages resolve from the Desktop install', () => {
  it('resolves every package every built-in preset references, from the same anchor package-overlay.ts uses', () => {
    const names = referencedPackageNames()
    expect(names.size).toBeGreaterThan(0)
    const unresolved: string[] = []
    for (const name of names) {
      try {
        findPackageJSON(name, installAnchor)
      } catch {
        unresolved.push(name)
      }
    }
    expect(unresolved).toEqual([])
  })
})
