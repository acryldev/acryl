/** The one window of a desktop app: the operating system's frame around a page the app's own server serves, with the renderer locked down. */
import type { BrowserWindowConstructorOptions } from 'electron'

export interface WindowSpec {
  readonly title: string
  readonly width?: number
  readonly height?: number
}

/**
 * Secure BrowserWindow options. The settings are ACRYL Desktop's: context isolation on, no Node in the page, the sandbox on, web security on; the window stays
 * hidden until the page has painted (`show: false`, shown on `ready-to-show`).
 */
export function windowOptions(spec: WindowSpec): BrowserWindowConstructorOptions {
  return {
    title: spec.title,
    width: spec.width ?? 1100,
    height: spec.height ?? 760,
    minWidth: 480,
    minHeight: 360,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  }
}
