// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { openSettingsSection } from '../../src/client/settings/open-settings.ts'

describe('openSettingsSection', () => {
  it('presses the Settings button, then the Agents entry when it appears', () => {
    document.body.innerHTML = '<button aria-haspopup="dialog" id="trigger">Settings</button>'
    const frames: Array<() => void> = []
    const pressed: string[] = []
    document.getElementById('trigger')?.addEventListener('click', () => {
      pressed.push('settings')
      document.body.insertAdjacentHTML('beforeend', '<div role="dialog"><nav><button>General</button><button id="agents">Agents</button></nav></div>')
      document.getElementById('agents')?.addEventListener('click', () => { pressed.push('agents') })
    })
    expect(openSettingsSection('agents', document, callback => { frames.push(callback) })).toBe(true)
    while (frames.length > 0) frames.shift()?.()
    expect(pressed).toEqual(['settings', 'agents'])
  })

  it('returns false when there is no Settings button', () => {
    document.body.innerHTML = '<button>Other</button>'
    expect(openSettingsSection('agents', document, () => {})).toBe(false)
  })

  it('finds a section by its label in either shipped language', () => {
    document.body.innerHTML = '<button aria-haspopup="dialog" id="trigger">Settings</button>'
    const pressed: string[] = []
    document.getElementById('trigger')?.addEventListener('click', () => {
      document.body.insertAdjacentHTML('beforeend', '<div role="dialog"><nav><button id="palette">命令面板</button></nav></div>')
      document.getElementById('palette')?.addEventListener('click', () => { pressed.push('palette') })
    })
    const frames: Array<() => void> = []
    expect(openSettingsSection('palette', document, callback => { frames.push(callback) })).toBe(true)
    while (frames.length > 0) frames.shift()?.()
    expect(pressed).toEqual(['palette'])
  })

  it('does not press the Marketplace launcher or other labelled dialog buttons, only the Settings trigger in the left pane', () => {
    document.body.innerHTML = [
      '<button aria-haspopup="dialog" aria-label="Marketplace" class="dshMarketLauncher" id="market">Marketplace</button>',
      '<div data-acryl-slot="sidebar">',
      '<button aria-haspopup="dialog" aria-label="Usage" id="usage">Usage</button>',
      '<button aria-haspopup="dialog" class="dshMarketLauncher" id="market2"></button>',
      '<button aria-haspopup="dialog" id="settings">Settings</button>',
      '</div>',
    ].join('')
    const pressed: string[] = []
    for (const id of ['market', 'usage', 'market2', 'settings']) document.getElementById(id)?.addEventListener('click', () => { pressed.push(id) })
    expect(openSettingsSection('agents', document, () => {})).toBe(true)
    expect(pressed).toEqual(['settings'])
  })

  it('finds no Settings trigger when the only dialog buttons are labelled ones', () => {
    document.body.innerHTML = '<div data-acryl-slot="sidebar"><button aria-haspopup="dialog" aria-label="Marketplace">M</button></div>'
    expect(openSettingsSection('agents', document, () => {})).toBe(false)
  })
})
