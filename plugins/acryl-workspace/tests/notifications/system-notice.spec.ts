import { describe, expect, it } from 'vitest'
import { shouldRaiseSystemNotice, type NoticePermission, type SystemNoticePort } from '../../src/client/notifications/system-notice.ts'

const port = (permission: NoticePermission, active: boolean): SystemNoticePort => ({
  permission: () => permission,
  request: async () => permission,
  pageIsActive: () => active,
  show: () => {},
})

describe('shouldRaiseSystemNotice', () => {
  it('raises a notice only when allowed and the user is looking elsewhere', () => {
    expect(shouldRaiseSystemNotice(port('granted', false))).toBe(true)
    expect(shouldRaiseSystemNotice(port('granted', true))).toBe(false)
    expect(shouldRaiseSystemNotice(port('default', false))).toBe(false)
    expect(shouldRaiseSystemNotice(port('denied', false))).toBe(false)
    expect(shouldRaiseSystemNotice(port('unsupported', false))).toBe(false)
  })
})
