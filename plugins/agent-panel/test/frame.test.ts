import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { FRAME_VIEW_KEY, frameViewOf, panelVariant, panelVisible } from '../client/frame.ts'

/** The frame's view as the app page reads it: the panel is hidden in Build and follows production in Preview. */
describe('the frame view a page reads', () => {
  const handle = { mode: 'build' as const }

  test('is the handle a same-origin parent publishes, and nothing at the top window or under a cross-origin parent', () => {
    assert.equal(frameViewOf({ parent: { [FRAME_VIEW_KEY]: handle } } as unknown as Window), handle)
    const top: { parent: unknown } = { parent: undefined }
    top.parent = top
    assert.equal(frameViewOf(top as unknown as Window), undefined)
    const crossOrigin = {
      get parent(): unknown {
        throw new Error('cross-origin')
      },
    }
    assert.equal(frameViewOf(crossOrigin as unknown as Window), undefined)
  })

  test('takes the Assistant variant only where production has it', () => {
    assert.equal(panelVariant({ assistant: true }, undefined), true)
    assert.equal(panelVariant({ assistantInProduction: true }, handle), true)
    assert.equal(panelVariant({ assistantInProduction: true }, undefined), false)
    assert.equal(panelVariant({}, handle), false)
  })

  test('shows the panel on a direct page, and in the frame only in Preview as the Assistant', () => {
    assert.equal(panelVisible(undefined, false), true)
    assert.equal(panelVisible(handle, true), false)
    assert.equal(panelVisible({ mode: 'preview' }, false), false)
    assert.equal(panelVisible({ mode: 'preview' }, true), true)
  })
})
