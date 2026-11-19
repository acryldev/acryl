import { describe, expect, it } from 'vitest'
import { DSH_SIDEBAR_ENTRY, rootOwnsSettingsSeat } from '../src/client/settings-seat.ts'

const entry = (name: string, disabled?: boolean) => ({ options: { name, ...(disabled === undefined ? {} : { disabled }) } })

describe('rootOwnsSettingsSeat', () => {
  it('leaves the seat to DSH when its left sidebar is composed (ACRYL Desktop)', () => {
    expect(rootOwnsSettingsSeat([entry('acryl-workspace'), entry(DSH_SIDEBAR_ENTRY)])).toBe(false)
  })

  it('owns the seat when only the right-hand sidebars are composed (ACRYL ADE)', () => {
    expect(rootOwnsSettingsSeat([entry('@deepseek-ai/dsh-client-ui-sidebar-right'), entry('@deepseek-ai/dsh-client-ui-sidebar-documentpreview')])).toBe(true)
  })

  it('owns the seat when DSH\'s left sidebar is composed but disabled', () => {
    expect(rootOwnsSettingsSeat([entry(DSH_SIDEBAR_ENTRY, true)])).toBe(true)
  })

  it('reads the effective state, so a sidebar disabled through its parent group counts as disabled', () => {
    // The loader Entry's own `disabled` walks its ancestors: the row says enabled, the group it sits in says disabled.
    expect(rootOwnsSettingsSeat([{ ...entry(DSH_SIDEBAR_ENTRY), disabled: true }])).toBe(true)
    expect(rootOwnsSettingsSeat([{ ...entry(DSH_SIDEBAR_ENTRY, true), disabled: false }])).toBe(false)
  })

  it('a group row itself is never the sidebar', () => {
    expect(rootOwnsSettingsSeat([{ ...entry('cordis:group'), disabled: false }])).toBe(true)
  })
})
