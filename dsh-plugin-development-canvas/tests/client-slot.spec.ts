import { SlotCore, type SlotComponent } from '@deepseek-ai/dsh-client-ui-slots'
import { describe, expect, it } from 'vitest'

const Frame: SlotComponent<object> = () => null
const Conversation: SlotComponent<object> = () => null
const Canvas: SlotComponent<object> = () => null

describe('Development Canvas slot composition', () => {
  it('replaces the default main surface only for its registration lifetime', () => {
    const core = new SlotCore()
    const disposeFrame = core.register({
      name: 'root',
      children: { 'desktop.main': { kind: 'single', scope: 'root' } },
    }, Frame as never)
    const disposeConversation = core.register({
      name: 'desktop.main',
      priority: 100,
    }, Conversation)
    const disposeCanvas = core.register({
      name: 'desktop.main',
      priority: 0,
    }, Canvas)

    expect(core.entries('desktop.main')[0]?.component).toBe(Canvas)
    disposeCanvas()
    expect(core.entries('desktop.main')[0]?.component).toBe(Conversation)

    disposeConversation()
    disposeFrame()
    expect(core.spec('desktop.main')).toBeUndefined()
  })

})
