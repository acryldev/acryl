import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { AcrBrandMark, AcrBrandName, applyAcrBrand } from '../src/client/acr-brand.tsx'

describe('ACR branding', () => {
  it('renders the ACR mark and product name', () => {
    const mark = renderToStaticMarkup(AcrBrandMark({ size: 24 }))
    expect(mark).toContain('width="24"')
    expect(mark).toContain('viewBox="0 0 1072 976"')
    expect(mark).toContain('fill="currentColor"')
    expect(renderToStaticMarkup(AcrBrandName())).toBe('<span>ACR</span>')
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

    applyAcrBrand(ctx)

    expect(injectedNames).toEqual([
      'sidebar.brand.mark',
      'sidebar.brand.name',
    ])
    expect(registeredOptions).toEqual([
      { name: 'sidebar.brand.mark' },
      { name: 'sidebar.brand.name' },
    ])
  })
})
