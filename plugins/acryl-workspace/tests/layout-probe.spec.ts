// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { formatProbe, probeChatLayout } from '../src/client/workspace/layout-probe.ts'

describe('probeChatLayout', () => {
  it('walks from the conversation wrapper up to the desktop frame and finds the scroller and composer', () => {
    document.body.innerHTML = `
      <div class="dshDesktopFrame"><main class="dshDesktopConversationSurface">
        <div class="dshWorkspaceChat"><div data-acryl-slot="conversation" id="w">
          <div class="root"><div class="scrollBody" style="overflow-y:auto">x</div><textarea></textarea></div>
        </div></div>
      </main></div>`
    const wrapper = document.getElementById('w')!
    const report = probeChatLayout(wrapper)
    expect(report.chain[0]?.slot).toBe('conversation')
    expect(report.chain.at(-1)?.el).toContain('dshDesktopFrame')
    expect(report.scroller?.el).toContain('scrollBody')
    expect(report.composerBottom).not.toBeNull()
    expect(typeof report.verdict).toBe('string')
  })

  it('reports a missing scroller and formats as one log line', () => {
    document.body.innerHTML = '<div id="w" data-acryl-slot="conversation"></div>'
    const report = probeChatLayout(document.getElementById('w')!)
    expect(report.scroller).toBeNull()
    expect(report.verdict).toContain('no scrolling element')
    const line = formatProbe(report)
    expect(line.startsWith('[acryl-layout] {')).toBe(true)
    expect(line.includes('\n')).toBe(false)
  })
})
