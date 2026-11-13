/**
 * The launcher screen as a page of its own (spec 050 T016): the same `LauncherScreen` the ACRYL window shows, mounted in a plain page, so a Blends app can serve it
 * as its canvas inside the Blends frame and the frame's own right panel (chat, Claude, Codex, Pi) is the assistant. Bundled to one file, `lib/page.js`.
 */
import { createRoot } from 'react-dom/client'
import { createLauncherApi } from '../client/api.ts'
import { LauncherScreen } from '../client/Screen.tsx'
import { LauncherVisibility } from '../client/store.ts'
import { installLauncherStyles } from '../client/styles.ts'

/** A host that mounts the launcher's routes under a prefix (a Blends app mounts its plugins under /app) says so on the element: `data-base="/app"`. */
const base = (): string => document.getElementById('acryl-launcher')?.dataset.base ?? ''

installLauncherStyles()
const root = document.getElementById('acryl-launcher')
if (root === null) throw new Error('the launcher page needs an element with id acryl-launcher')
createRoot(root).render(
  <LauncherScreen
    api={createLauncherApi((input, init) => fetch(`${base()}${input}`, init))}
    visibility={new LauncherVisibility(true)}
    openExternal={(url) => { window.open(url, '_blank', 'noopener,noreferrer') }}
  />,
)
