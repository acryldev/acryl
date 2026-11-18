// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { openModelsSettings } from '../../src/client/open-settings.ts'

afterEach(() => { document.body.innerHTML = '' })

/** The page the first-run step runs in: the ACRYL screen (a dialog with a nav that has its own "Settings" entry) in front of the workspace, whose Settings button opens the real dialog. */
function page(): { models: ReturnType<typeof vi.fn>, screenSettings: ReturnType<typeof vi.fn> } {
  const models = vi.fn()
  const screenSettings = vi.fn()
  document.body.innerHTML = '<button id="trigger" aria-label="Settings" aria-haspopup="dialog">gear</button><div role="dialog" aria-label="ACRYL"><nav><button id="screen-settings">Settings</button></nav></div>'
  document.getElementById('screen-settings')!.addEventListener('click', screenSettings)
  document.getElementById('trigger')!.addEventListener('click', () => {
    document.body.insertAdjacentHTML('beforeend', '<div role="dialog"><nav><button>General</button><button id="models">Models</button></nav></div>')
    document.getElementById('models')!.addEventListener('click', models)
  })
  return { models, screenSettings }
}

describe('openModelsSettings', () => {
  it('presses the real Settings trigger, then the Models entry of the Settings dialog, not the ACRYL screen\'s own nav', () => {
    const { models, screenSettings } = page()
    const queue: Array<() => void> = []
    expect(openModelsSettings(document, callback => { queue.push(callback) })).toBe(true)
    while (queue.length > 0 && models.mock.calls.length === 0) queue.shift()!()
    expect(models).toHaveBeenCalledTimes(1)
    expect(screenSettings).not.toHaveBeenCalled()
  })
  it('says no when there is no Settings trigger', () => {
    document.body.innerHTML = '<button>Settings</button>'
    expect(openModelsSettings(document, () => {})).toBe(false)
  })
})
