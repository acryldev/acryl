// DSH's client packages ship as Module Loader bundles (`window.__ModuleLoader__.load({ id, factory })`), not ESM modules, so a test that
// needs one installs this registry first: the factory's `require` answers from the installed ESM packages (react and friends, Cordis, the
// slots core) plus whatever a bundle registered before it, exactly the order a page loads them in.
import * as cordis from '@deepseek-ai/cordis'
import * as slots from '@deepseek-ai/dsh-client-ui-slots'
import * as react from 'react'
import * as reactDom from 'react-dom'
import * as reactDomClient from 'react-dom/client'
import * as jsxRuntime from 'react/jsx-runtime'

const modules = new Map<string, unknown>([
  ['@deepseek-ai/cordis', cordis],
  ['@deepseek-ai/dsh-client-ui-slots', slots],
  ['react', react],
  ['react-dom', reactDom],
  ['react-dom/client', reactDomClient],
  ['react/jsx-runtime', jsxRuntime],
])

interface ModuleLoader {
  load(entry: { id: string, factory: (require: (name: string) => unknown) => unknown }): void
}

;(globalThis as { __ModuleLoader__?: ModuleLoader }).__ModuleLoader__ = {
  load({ id, factory }) {
    modules.set(id, factory((name) => {
      const found = modules.get(name)
      if (found === undefined) throw new Error(`the Module Loader shim has no module ${JSON.stringify(name)}`)
      return found
    }))
  },
}

/** What a Module Loader bundle exported once its file ran (e.g. the renderer's `SlotRegistry`). */
export function moduleOf(id: string): Record<string, unknown> {
  const found = modules.get(id)
  if (found === undefined) throw new Error(`${id} was never loaded`)
  return found as Record<string, unknown>
}
