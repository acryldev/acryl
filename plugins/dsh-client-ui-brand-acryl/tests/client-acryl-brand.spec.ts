import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { AcrylBrandMark, AcrylBrandName, AcrylHeroBrandMark } from '../src/client/Brand.tsx'
import { apply, inject } from '../src/client/index.ts'

describe('ACRYL brand plugin', () => {
  it('renders the sidebar mark/name and hero mark with the ACRYL identity', () => {
    const mark = renderToStaticMarkup(AcrylBrandMark({ size: 24 }))
    expect(mark).toContain('width:24px')
    expect(mark).toContain('acrylBrandMarkLight')
    expect(mark).toContain('acrylBrandMarkDark')
    expect(mark.match(/data:image\/png;base64,/gu)).toHaveLength(2)
    expect(renderToStaticMarkup(AcrylBrandName())).toBe('<span>ACRYL</span>')

    const hero = renderToStaticMarkup(AcrylHeroBrandMark({ size: 34, className: 'fish' }))
    expect(hero).toContain('width:34px')
    expect(hero).toContain('class="acrylBrandMark fish"')
    expect(hero.match(/data:image\/png;base64,/gu)).toHaveLength(2)
  })

  it('declares the slots service dependency', () => {
    expect(inject).toEqual(['slots'])
  })

  it('contributes the sidebar and hero brand slots as one declaration-aware set', () => {
    const injectedNames: string[] = []
    const registeredOptions: unknown[] = []
    const slotsInject = vi.fn((name: string, register: () => unknown) => {
      injectedNames.push(name)
      return register()
    })
    const register = vi.fn((options: unknown, _component: unknown) => {
      registeredOptions.push(options)
      return () => {}
    })
    const ctx = { slots: { inject: slotsInject, register } } as unknown as ClientContext

    apply(ctx)

    expect(injectedNames).toEqual([
      'sidebar.brand.mark',
      'sidebar.brand.name',
      'conversation.hero.brand.mark',
    ])
    expect(registeredOptions).toEqual([
      { name: 'sidebar.brand.mark' },
      { name: 'sidebar.brand.name' },
      { name: 'conversation.hero.brand.mark' },
    ])
  })
})
