import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { AcrylBrandMark, AcrylBrandName, AcrylHeroBrandMark, applyAcrylBrand } from '../src/client/acryl-brand.tsx'

describe('ACRYL branding', () => {
  it('renders both supplied theme marks and the ACRYL product name', () => {
    const mark = renderToStaticMarkup(AcrylBrandMark({ size: 24 }))
    expect(mark).toContain('width:24px')
    expect(mark).toContain('acrylBrandMarkLight')
    expect(mark).toContain('acrylBrandMarkDark')
    expect(mark.match(/data:image\/png;base64,/gu)).toHaveLength(2)
    expect(renderToStaticMarkup(AcrylBrandName())).toBe('<span>ACRYL</span>')
  })

  it('renders the hero mark at the requested size under the host class', () => {
    const mark = renderToStaticMarkup(AcrylHeroBrandMark({ size: 34, className: 'fish' }))
    expect(mark).toContain('width:34px')
    expect(mark).toContain('class="acrylBrandMark fish"')
    expect(mark.match(/data:image\/png;base64,/gu)).toHaveLength(2)
  })

  it('contributes the sidebar and hero brand slots', () => {
    const injectedNames: string[] = []
    const registeredOptions: unknown[] = []
    const inject = vi.fn((name: string, register: () => unknown) => {
      injectedNames.push(name)
      return register()
    })
    const register = vi.fn((options: unknown, _component: unknown) => {
      registeredOptions.push(options)
      return () => {}
    })
    const ctx = { slots: { inject, register } } as unknown as ClientContext

    applyAcrylBrand(ctx)

    expect(injectedNames).toEqual([
      'sidebar.brand.mark',
      'sidebar.brand.name',
      'conversation.hero.brand.mark',
    ])
    expect(registeredOptions).toEqual([
      { name: 'sidebar.brand.mark', priority: -1000 },
      { name: 'sidebar.brand.name', priority: -1000 },
      { name: 'conversation.hero.brand.mark', priority: -1000 },
    ])
  })
})
