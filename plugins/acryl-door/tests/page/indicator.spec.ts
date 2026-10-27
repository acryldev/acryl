// @vitest-environment jsdom
/** The DOM indicator: shown while the agent drives, and its Stop button ends an act in progress. */

import { afterEach, describe, expect, it } from 'vitest'
import { mountIndicator } from '../../src/page/indicator.ts'
import { UiDriver } from '../../src/page/driver/driver.ts'
import { UiControlError } from '../../src/page/protocol.ts'

const bar = (): HTMLElement | null => document.querySelector('.acrylDoorBar')
const button = (label: string): HTMLButtonElement => {
  const found = [...document.querySelectorAll('.acrylDoorBar button')].find(candidate => candidate.textContent === label)
  if (found === undefined) throw new Error(`no ${label} button`)
  return found as HTMLButtonElement
}

afterEach(() => { document.body.replaceChildren(); document.head.replaceChildren() })

describe('the door indicator', () => {
  it('is hidden until the agent acts, shows what it does, and leaves no trace when removed', async () => {
    document.body.innerHTML = '<p>Ready</p>'
    const driver = new UiDriver({ document: () => document })
    const remove = mountIndicator(driver, document)
    expect(bar()).toBeNull()
    const waiting = driver.handle({ op: 'wait', text: 'Done', timeoutMs: 5000 })
    expect(bar()?.textContent).toContain('Agent is driving: waiting')
    expect(bar()?.hasAttribute('data-acryl-no-agent')).toBe(true)
    document.body.insertAdjacentHTML('beforeend', '<p>Done</p>')
    await waiting
    expect(bar()).toBeNull()
    remove()
    expect(document.getElementById('acryl-door-indicator-style')).toBeNull()
  })

  it('Stop ends an act in progress as killed, refuses the next one, and Allow again lets the agent back', async () => {
    document.body.innerHTML = '<p>Ready</p>'
    const driver = new UiDriver({ document: () => document })
    const remove = mountIndicator(driver, document)
    const waiting = driver.handle({ op: 'wait', text: 'never shown', timeoutMs: 5000 })
    const outcome = waiting.then(() => 'ok', (cause: unknown) => (cause instanceof UiControlError ? cause.code : 'other'))
    button('Stop').click()
    expect(await outcome).toBe('killed')
    expect(bar()?.hasAttribute('data-killed')).toBe(true)
    await expect(driver.handle({ op: 'snapshot' })).rejects.toMatchObject({ code: 'killed' })
    button('Allow again').click()
    expect(bar()).toBeNull()
    await expect(driver.handle({ op: 'snapshot' })).resolves.toMatchObject({ title: expect.any(String) })
    remove()
  })

  it('cannot be operated by the agent: its own controls are left out of a snapshot', async () => {
    document.body.innerHTML = '<button type="button">Save</button>'
    const driver = new UiDriver({ document: () => document })
    const remove = mountIndicator(driver, document)
    driver.kill()
    const snapshot = await (driver.resume(), driver.handle({ op: 'snapshot' }))
    expect('nodes' in snapshot && snapshot.nodes.map(node => node.name)).toEqual(['Save'])
    remove()
  })
})
