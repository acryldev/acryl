import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { AcrylBrandMark, AcrylBrandName, applyAcrylBrand } from '../src/client/acryl-brand.tsx'

describe('ACRYL branding', () => {
  it('renders both supplied theme marks and the ACRYL product name', () => {
    const mark = renderToStaticMarkup(AcrylBrandMark({ size: 24 }))
    expect(mark).toContain('width:24px')
    expect(mark).toContain('acrylBrandMarkLight')
    expect(mark).toContain('acrylBrandMarkDark')
    expect(mark.match(/data:image\/png;base64,/gu)).toHaveLength(2)
    expect(renderToStaticMarkup(AcrylBrandName())).toBe('<span>ACRYL</span>')
  })

  it('contributes both public sidebar brand slots', () => {
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
    ])
    expect(registeredOptions).toEqual([
      { name: 'sidebar.brand.mark', priority: -1000 },
      { name: 'sidebar.brand.name', priority: -1000 },
    ])
  })
})
