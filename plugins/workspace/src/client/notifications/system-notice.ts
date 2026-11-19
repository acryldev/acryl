/**
 * Notices outside the page ("Claude finished" while another app is in front).
 *
 * The browser Notification API is the one shared implementation: it works on Web and inside Desktop's
 * renderer alike. The permission may only be asked for from a user gesture, so it is requested by a button,
 * never on load. Everything behind the port is replaceable in tests.
 */

export type NoticePermission = 'default' | 'granted' | 'denied' | 'unsupported'

export interface SystemNoticePort {
  permission(): NoticePermission
  /** Ask the user; call only from a click. */
  request(): Promise<NoticePermission>
  /** True when the page is in front of the user, so an in-page notice is enough. */
  pageIsActive(): boolean
  show(title: string, body: string, onOpen: () => void): void
}

/** @returns whether to raise a system notice now: allowed, and the user is not already looking. */
export function shouldRaiseSystemNotice(port: SystemNoticePort): boolean {
  return port.permission() === 'granted' && !port.pageIsActive()
}

export function createBrowserNoticePort(): SystemNoticePort {
  const supported = typeof Notification !== 'undefined'
  return {
    permission: () => (supported ? Notification.permission : 'unsupported'),
    async request() {
      if (!supported) return 'unsupported'
      try {
        return await Notification.requestPermission()
      } catch {
        return 'denied'
      }
    },
    pageIsActive: () => document.visibilityState === 'visible' && document.hasFocus(),
    show(title, body, onOpen) {
      if (!supported || Notification.permission !== 'granted') return
      try {
        const notice = new Notification(title, { body, tag: `acryl:${title}` })
        notice.onclick = () => { window.focus(); onOpen(); notice.close() }
      } catch {
        // A blocked or failing notification never disturbs the app.
      }
    },
  }
}
