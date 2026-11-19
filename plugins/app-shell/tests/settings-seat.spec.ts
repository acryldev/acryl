import { describe, expect, it } from 'vitest'
import { rootOwnsSettingsSeat } from '../src/client/settings-seat.ts'

const entry = (name: string, disabled?: boolean) => ({ options: { name, ...(disabled === undefined ? {} : { disabled }) } })

describe('rootOwnsSettingsSeat', () => {
  it('leaves the seat to DSH when its left sidebar is composed (ACRYL Desktop)', () => {
    expect(rootOwnsSettingsSeat([entry('@acryldev/workspace'), entry('@deepseek-ai/dsh-client-ui-sidebar')])).toBe(false)
  })

  it('owns the seat when only the right-hand sidebars are composed (ACRYL ADE)', () => {
    expect(rootOwnsSettingsSeat([entry('@deepseek-ai/dsh-client-ui-sidebar-right'), entry('@deepseek-ai/dsh-client-ui-sidebar-documentpreview')])).toBe(true)
  })

  it('owns the seat when DSH\'s left sidebar is composed but disabled', () => {
    expect(rootOwnsSettingsSeat([entry('@deepseek-ai/dsh-client-ui-sidebar', true)])).toBe(true)
  })
})
