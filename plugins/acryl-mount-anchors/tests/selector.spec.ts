import { describe, expect, it } from 'vitest'
import { selectorFor } from '../src/client/MountAnchorInspector.tsx'

describe('the copied selector', () => {
  it('starts at the nearest id and finds the picked element again', () => {
    document.body.innerHTML = '<main id="app"><ul class="list"><li class="row">a</li><li class="row"><button class="go x">b</button></li></ul></main>'
    const button = document.querySelector('button') as Element
    const selector = selectorFor(button)
    expect(selector).toBe('#app > ul.list > li.row:nth-of-type(2) > button.go')
    expect(document.querySelector(selector)).toBe(button)
  })

  it('starts below body when no ancestor has an id, and stays short', () => {
    document.body.innerHTML = '<div><div><div><div><div><div><div><div><div><span>deep</span></div></div></div></div></div></div></div></div></div>'
    const selector = selectorFor(document.querySelector('span') as Element)
    expect(selector.split(' > ')).toHaveLength(8)
    expect(selector.endsWith('span')).toBe(true)
  })
})

describe('names a selector cannot spell plainly', () => {
  it('quotes them, and the selector still finds the element', () => {
    document.body.innerHTML = '<section id="1:panel"><p class="w-[3px] note">x</p></section>'
    const p = document.querySelector('p') as Element
    const selector = selectorFor(p)
    expect(selector).toBe('[id="1:panel"] > p[class~="w-[3px]"]')
    expect(document.querySelector(selector)).toBe(p)
  })
})
