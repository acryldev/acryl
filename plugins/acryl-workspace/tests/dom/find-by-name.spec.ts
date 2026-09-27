// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { accessibleButtonName, clickButtonByName, findButtonByName } from '../../src/client/dom/find-by-name.ts'

describe('accessibleButtonName', () => {
  it('prefers aria-label, trimmed, over the button\'s own text', () => {
    document.body.innerHTML = '<button aria-label="  Settings  ">gear icon</button>'
    expect(accessibleButtonName(document.querySelector('button') as HTMLButtonElement)).toBe('Settings')
  })

  it('falls back to the collapsed, trimmed text content when there is no label', () => {
    document.body.innerHTML = '<button>  Add\n  workspace  </button>'
    expect(accessibleButtonName(document.querySelector('button') as HTMLButtonElement)).toBe('Add workspace')
  })
})

describe('findButtonByName and clickButtonByName', () => {
  it('finds the first document-order match for the first name that has one', () => {
    document.body.innerHTML = '<div id="scope"><button>Other</button><button>Add workspace</button></div><button>Add workspace</button>'
    const scope = document.getElementById('scope') as HTMLElement
    const found = findButtonByName(scope, ['添加工作区', 'Add workspace'])
    expect(found).toBe(scope.querySelectorAll('button')[1])
  })

  it('applies an extra filter, e.g. to skip a same-named button that belongs to another surface', () => {
    document.body.innerHTML = '<button class="dshMarketLauncher" aria-label="Settings">M</button><button aria-label="Settings">S</button>'
    const found = findButtonByName(document, ['Settings'], button => !button.className.includes('Market'))
    expect(found?.textContent).toBe('S')
  })

  it('returns null and clicks nothing when no name matches', () => {
    document.body.innerHTML = '<button>Nope</button>'
    expect(findButtonByName(document, ['Add workspace'])).toBeNull()
    expect(clickButtonByName(document, ['Add workspace'])).toBe(false)
  })

  it('clicks the match it finds and reports success', () => {
    document.body.innerHTML = '<button>Add workspace</button>'
    let clicked = false
    document.querySelector('button')?.addEventListener('click', () => { clicked = true })
    expect(clickButtonByName(document, ['Add workspace'])).toBe(true)
    expect(clicked).toBe(true)
  })
})
