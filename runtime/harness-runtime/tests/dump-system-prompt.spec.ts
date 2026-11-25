/**
 * OPT-IN generator for `docs/system-prompt/current/{web,cli}.md` (its composition is checked in every run). The generator is skipped unless `ACRYL_DUMP_SYSTEM_PROMPT` names an output directory
 * (relative to the repository root).
 *
 *   ACRYL_DUMP_SYSTEM_PROMPT=docs/system-prompt/current corepack pnpm --filter @acryldev/harness-runtime exec vitest run tests/dump-system-prompt.spec.ts
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { codingCapabilities } from '@acryldev/coding-capabilities'
import { expect, it } from 'vitest'
import { createDshEngineDefinition, createWebEngineDefinition } from '../src/engine-dsh.ts'
import { createAcrylEngineHost } from '../src/engine-host.ts'
import { measurePromptBudget, renderBudgetDoc, type PromptBudget } from '../src/prompt-budget.ts'
import { captureSystemPrompt, renderSystemPromptDoc } from '../src/system-prompt-capture.ts'
import { fileURLToPath } from 'node:url'

const outDir = process.env.ACRYL_DUMP_SYSTEM_PROMPT
const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)))

type Kind = 'web' | 'cli'

/** The composition the generator captures from, booted on a throwaway engine home. */
async function boot(kind: Kind) {
  const previous = { key: process.env.DEEPSEEK_API_KEY, home: process.env.DSH_HOME }
  process.env.DEEPSEEK_API_KEY = 'dummy-key-for-prompt-capture'
  const home = mkdtempSync(join(tmpdir(), 'acryl-prompt-'))
  process.env.DSH_HOME = home
  const restore = (): void => {
    rmSync(home, { recursive: true, force: true })
    for (const [name, value] of [['DEEPSEEK_API_KEY', previous.key], ['DSH_HOME', previous.home]] as const) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
  const host = await createAcrylEngineHost(kind === 'cli'
    ? { engines: [createDshEngineDefinition('acryl-prompt', codingCapabilities)], initialEngine: 'dsh' }
    : {
        engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href, codingCapabilities)],
        initialEngine: 'dsh',
        prepare: ctx => { provideCmdline(ctx, { args: ['--no-open', '--port', '0'], exit: () => {} }) },
      }).catch((error: unknown) => { restore(); throw error })
  return { host, home, dispose: async (): Promise<void> => { await host.dispose(); restore() } }
}

async function surface(kind: Kind): Promise<{ doc: string; budget: PromptBudget }> {
  const { host, home, dispose } = await boot(kind)
  try {
    const captured = await captureSystemPrompt(host.ctx, {
      profile: kind === 'cli' ? 'acryl-prompt' : 'web',
      selectStandardPreset: kind === 'web',
      scrub: [[home, '<dsh-home>'], [repoRoot, '<acryl-repo>']],
    })
    return {
      // The Web engine listens on a free port, different on every run; the copy names it <port> so it changes only when the prompt does.
      doc: renderSystemPromptDoc(kind === 'web' ? 'web' : 'cli', kind === 'web' ? 'standard preset' : 'terminal engine', captured).replace(/(http:\/\/127\.0\.0\.1:)\d+/gu, '$1<port>'),
      budget: measurePromptBudget(captured),
    }
  } finally {
    await dispose()
  }
}

it.each(['web', 'cli'] as const)('the %s composition the generator captures from provides agentDefaultModel', async kind => {
  const { host, dispose } = await boot(kind)
  try {
    expect(host.ctx.get('agentDefaultModel')).toBeDefined()
  } finally {
    await dispose()
  }
}, 120_000)

it.skipIf(outDir === undefined)('dumps the current system prompt for web and cli', async () => {
  const dir = resolve(repoRoot, outDir ?? '')
  mkdirSync(dir, { recursive: true })
  const budgets: Record<string, PromptBudget> = {}
  for (const kind of ['web', 'cli'] as const) {
    const { doc, budget } = await surface(kind)
    writeFileSync(join(dir, `${kind}.md`), doc)
    budgets[kind === 'web' ? 'web and desktop (standard preset)' : 'cli (terminal engine)'] = budget
  }
  // One table for every surface: per section and per tool, reproducible with this same command.
  writeFileSync(join(dir, '..', 'budget.md'), renderBudgetDoc(budgets))
}, 240_000)
