// @vitest-environment jsdom
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import { describe, expect, it } from 'vitest'
import { apply } from '../../src/client/index.ts'
import { SkipPreviewNotice } from '../../src/client/SkipPreviewNotice.tsx'

/** A frame that declares the three list/single slots this plugin registers into, over the real slot registry. */
function frame() {
  const core = new SlotCore()
  const Frame = (() => null) as never
  core.register({
    name: 'root',
    children: {
      'settings.models.footer': { kind: 'list', scope: 'root' },
      'settings.models.sign-in': { kind: 'single', scope: 'root' },
      'settings.onboarding': { kind: 'list', scope: 'root' },
    },
  } as never, Frame)
  const ctx = {
    slots: { inject: (_name: string, register: () => unknown) => { register() }, register: (options: never, component: never) => core.register(options, component) },
    locale: { register: () => () => {} },
    effect: (run: () => unknown) => { run() },
  } as unknown as ClientContext
  return { core, ctx }
}

const upstreamNotice = { name: 'settings.onboarding', id: 'welcome-notice', order: -100 } as never
const Upstream = (() => null) as never

describe('the preview-notice replacement', () => {
  it('shadows DeepSeek\'s notice whichever plugin registers first, and neither registration throws', () => {
    const before = frame()
    before.core.register(upstreamNotice, Upstream)
    expect(() => { apply(before.ctx) }).not.toThrow()

    const after = frame()
    expect(() => { apply(after.ctx) }).not.toThrow()
    expect(() => { after.core.register(upstreamNotice, Upstream) }).not.toThrow()

    for (const { core } of [before, after]) {
      const winners = core.entriesOfSlot('settings.onboarding').filter(entry => entry.options.id === 'welcome-notice')
      expect(winners).toHaveLength(1)
      expect(winners[0]?.component).toBe(SkipPreviewNotice)
    }
  })
})
