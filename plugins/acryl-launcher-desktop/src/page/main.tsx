/**
 * The launcher screen as a page of its own (spec 050 T016): the same `LauncherScreen` the ACRYL window shows, mounted in a plain page, so a Blends app can serve it
 * as its canvas inside the Blends frame and the frame's own right panel (chat, Claude, Codex, Pi) is the assistant. Bundled to one file, `lib/page.js`.
 */
import { createRoot } from 'react-dom/client'
import { createLauncherApi } from '../client/api.ts'
import { LauncherScreen } from '../client/Screen.tsx'
import { SKIN_KEY } from '../client/skin.ts'
import { LauncherVisibility } from '../client/store.ts'
import { installLauncherStyles } from '../client/styles.ts'

/** A host that mounts the launcher's routes under a prefix (a Blends app mounts its plugins under /app) says so on the element: `data-base="/app"`. */
const base = (): string => document.getElementById('acryl-launcher')?.dataset.base ?? ''

/** The page's own theme tokens (the ones the screen reads inside the ACRYL window), light and dark, so the IDE look works outside that window too. */
const TOKENS = {
  dark: { '--dsw-alias-bg-base': '#161618', '--dsw-alias-bg-l1': '#1e1e21', '--dsw-alias-fill-l1': 'rgba(255,255,255,.06)', '--dsw-alias-fill-l2': 'rgba(255,255,255,.1)', '--dsw-alias-border-l1': 'rgba(255,255,255,.12)', '--dsw-alias-label-primary': '#ececf1', '--dsw-alias-label-secondary': '#9a9aa3' },
  light: { '--dsw-alias-bg-base': '#ffffff', '--dsw-alias-bg-l1': '#ffffff', '--dsw-alias-fill-l1': 'rgba(127,127,127,.09)', '--dsw-alias-fill-l2': 'rgba(127,127,127,.16)', '--dsw-alias-border-l1': 'rgba(127,127,127,.28)', '--dsw-alias-label-primary': '#18181b', '--dsw-alias-label-secondary': '#62626b' },
} as const

/** The Blends frame marks its dark theme on its body (`data-ds-dark-theme`); a page on its own follows the system. */
function frameBody(): HTMLElement | undefined {
  try { return window.parent !== window ? window.parent.document.body : undefined } catch { return undefined }
}
const isDark = (): boolean => {
  const body = frameBody()
  return body !== undefined ? body.hasAttribute('data-ds-dark-theme') : window.matchMedia('(prefers-color-scheme: dark)').matches
}

installLauncherStyles()
// On its own page the launcher wears the acryl.dev look unless the person picked another in Settings > Look.
try { if (localStorage.getItem(SKIN_KEY) === null) localStorage.setItem(SKIN_KEY, 'site') } catch { /* no storage: the default look */ }
const root = document.getElementById('acryl-launcher')
if (root === null) throw new Error('the launcher page needs an element with id acryl-launcher')
const reactRoot = createRoot(root)
const api = createLauncherApi((input, init) => fetch(`${base()}${input}`, init))
const visibility = new LauncherVisibility(true)

/** Set the tokens for the current theme and draw the screen again, so it takes the new light or dark. */
function render(): void {
  const dark = isDark()
  for (const [name, value] of Object.entries(TOKENS[dark ? 'dark' : 'light'])) document.documentElement.style.setProperty(name, value)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  reactRoot.render(
    <LauncherScreen
      key={dark ? 'dark' : 'light'}
      api={api}
      visibility={visibility}
      openExternal={(url) => { window.open(url, '_blank', 'noopener,noreferrer') }}
    />,
  )
}

render()
const body = frameBody()
if (body !== undefined) new MutationObserver(render).observe(body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
else window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render)
