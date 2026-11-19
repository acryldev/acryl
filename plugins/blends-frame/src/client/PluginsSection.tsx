/** The Plugins page of Settings: search, the groups as chips, and one row per plugin with who made it, its state and its switch. */

import { useEffect, useMemo, useState } from 'react'
import { GraphView, type GraphViewInjected } from './GraphView.tsx'
import { installGraphStyles } from './graph-styles.ts'
import { filterPlugins, pullCommand, type NavigatorPlugin, type PluginGroup } from './plugins-navigator.ts'
import type { RegistryApi } from './registry-api.ts'
import { RegistryView } from './RegistryView.tsx'
import { ShareChooser } from './ShareChooser.tsx'

export interface PluginsSectionInjected {
  /** Every plugin of the app and the frame, read fresh. */
  readonly loadPlugins: () => Promise<readonly NavigatorPlugin[]>
  /** What the Graph view reads and does; absent, the page has no Graph tab. */
  readonly graph?: GraphViewInjected
  /** The public registry, adding a plugin from it, and whether this computer can share to GitHub. */
  readonly registry: RegistryApi
}

/** What the Settings shell hands a section: `close` leaves Settings (View source shows the file in the frame, behind the dialog). */
export interface PluginsSectionOwner {
  readonly close?: () => void
}

/** Copy a text to the clipboard; false when the browser refuses (a copy the person can still make by hand from the shown text). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

const CHIPS: readonly { readonly group: PluginGroup | 'all'; readonly label: string }[] = [
  { group: 'all', label: 'All' },
  { group: 'made', label: 'Made by agents' },
  { group: 'registry', label: 'Registry' },
  { group: 'frame', label: 'Frame' },
]

type Load =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly plugins: readonly NavigatorPlugin[] }
  | { readonly status: 'error'; readonly message: string }

/** The tabs of the page: this app's plugins, how they connect, and the public registry to add more from. */
type Tab = 'list' | 'graph' | 'registry'

export function PluginsSection({ loadPlugins, graph, registry, close }: PluginsSectionInjected & PluginsSectionOwner) {
  useEffect(() => (graph === undefined ? undefined : installGraphStyles()), [graph !== undefined])
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<PluginGroup | 'all'>('all')
  const [tab, setTab] = useState<Tab>('list')
  const [busy, setBusy] = useState<string | undefined>(undefined)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  // The plugin whose share chooser is open (it asks before it sends anything), and what the last copy said about a plugin.
  const [choosing, setChoosing] = useState<string | undefined>(undefined)
  const [said, setSaid] = useState<{ readonly key: string; readonly text: string } | undefined>(undefined)

  const [reads, setReads] = useState(0)
  useEffect(() => {
    let live = true
    loadPlugins().then(
      (plugins) => {
        if (!live) return
        setLoad({ status: 'ready', plugins })
        setBusy(undefined)
      },
      (cause: unknown) => {
        if (!live) return
        setLoad({ status: 'error', message: cause instanceof Error ? cause.message : 'The plugins could not be read.' })
        setBusy(undefined)
      },
    )
    return () => { live = false }
  }, [loadPlugins, reads])

  const plugins = load.status === 'ready' ? load.plugins : []
  const shown = useMemo(() => filterPlugins(plugins, query, group), [plugins, query, group])
  const count = (chip: PluginGroup | 'all') => (chip === 'all' ? plugins.length : plugins.filter(plugin => plugin.group === chip).length)

  const flip = async (plugin: NavigatorPlugin) => {
    if (plugin.toggle === undefined || busy !== undefined) return
    setBusy(plugin.key)
    setFailure(undefined)
    try {
      // Until the list is read again the row shows the new position.
      await plugin.toggle(!plugin.on)
      setReads(count => count + 1)
    } catch (cause) {
      setFailure(`${plugin.name}: ${cause instanceof Error ? cause.message : String(cause)}`)
      setBusy(undefined)
    }
  }

  const copy = async (plugin: NavigatorPlugin, text: string, what: string) => {
    setSaid({ key: plugin.key, text: (await copyText(text)) ? `Copied ${what}.` : `Your browser did not allow copying; select it here: ${text}` })
  }

  const viewSource = (plugin: NavigatorPlugin) => {
    close?.()
    plugin.actions?.viewSource?.()
  }

  /** A plugin was shared or saved: its row shows where, without waiting for the Host to read the whole list again. */
  const mark = (key: string, change: Partial<NavigatorPlugin>) => {
    setLoad(current => current.status === 'ready'
      ? { status: 'ready', plugins: current.plugins.map(row => row.key === key ? { ...row, ...change } : row) }
      : current)
  }

  return (
    <div className="acrylBlendsPlugins">
      <h3>Plugins</h3>
      <p className="acrylBlendsPluginsSub">Everything this app is made of. Agents add features as Cordis plugins; each one can be switched off or replaced.</p>
      <div className="acrylBlendsPluginsTabs" role="tablist" aria-label="Plugins">
        <button type="button" role="tab" aria-selected={tab === 'list'} onClick={() => { setTab('list') }}>My plugins</button>
        {graph !== undefined && <button type="button" role="tab" aria-selected={tab === 'graph'} onClick={() => { setTab('graph') }}>Graph</button>}
        <button type="button" role="tab" aria-selected={tab === 'registry'} onClick={() => { setTab('registry') }}>Registry</button>
      </div>
      {tab === 'registry' && <RegistryView api={registry} onAdded={() => { setReads(count => count + 1) }} />}
      {tab === 'graph' && graph !== undefined && <GraphView {...graph} />}
      {tab === 'list' && <>
      <div className="acrylBlendsPluginsTools">
        <input className="acrylBlendsSearch" aria-label="Search plugins" placeholder="Search plugins" value={query} onChange={(event) => { setQuery(event.target.value) }} />
        {CHIPS.map(chip => (
          <button key={chip.group} type="button" className="acrylBlendsChip" aria-pressed={group === chip.group} onClick={() => { setGroup(chip.group) }}>
            {chip.label} {count(chip.group)}
          </button>
        ))}
      </div>
      {failure !== undefined && <p className="acrylBlendsNote" data-error>{failure}</p>}
      {load.status === 'loading' && <p className="acrylBlendsNote">Reading the plugins…</p>}
      {load.status === 'error' && <p className="acrylBlendsNote" data-error>{load.message}</p>}
      {load.status === 'ready' && shown.length === 0 && <p className="acrylBlendsNote">No plugin matches.</p>}
      {shown.map(plugin => {
        const on = busy === plugin.key ? !plugin.on : plugin.on
        return (
          <div key={plugin.key} className="acrylBlendsPlug">
            <b>{plugin.name}</b>
            <span className="acrylBlendsPlugBy">{plugin.by}</span>
            {plugin.toggle === undefined
              ? <span className="acrylBlendsPlugFixed" title="Part of the frame; it cannot be switched off here">built in</span>
              : (
                <button
                  type="button"
                  role="switch"
                  className="acrylBlendsTog"
                  aria-checked={on}
                  aria-label={`${plugin.name} ${on ? 'on' : 'off'}`}
                  disabled={busy !== undefined}
                  onClick={() => { void flip(plugin) }}
                />
              )}
            <small>
              {plugin.description}{plugin.description === '' ? '' : ' · '}
              <span className="acrylBlendsPlugState" data-state={plugin.state === 'active' ? 'ok' : plugin.state === 'off' ? 'off' : 'warn'}>{plugin.state}</span>
              {plugin.actions?.viewSource !== undefined && (
                <>
                  {' · '}
                  <button type="button" className="acrylBlendsShareButton" title="Open this plugin's code in the Files tab" onClick={() => { viewSource(plugin) }}>View source</button>
                </>
              )}
              {plugin.share !== undefined && (
                <>
                  {' · '}
                  <button
                    type="button"
                    className="acrylBlendsShareButton"
                    aria-expanded={choosing === plugin.key}
                    disabled={busy !== undefined}
                    onClick={() => { setSaid(undefined); setChoosing(current => (current === plugin.key ? undefined : plugin.key)) }}
                  >
                    Share…
                  </button>
                </>
              )}
            </small>
            {plugin.folder !== undefined && (
              <small className="acrylBlendsPlugPath">
                <code title="Where this plugin's code is">{plugin.folder}</code>
                {' '}
                <button type="button" className="acrylBlendsShareButton" onClick={() => { void copy(plugin, plugin.folder ?? '', 'the folder path') }}>Copy path</button>
                {plugin.actions?.viewSource === undefined && ' · no file of it to open here'}
              </small>
            )}
            {(plugin.saved !== undefined || plugin.shared !== undefined) && (
              <small className="acrylBlendsPlugWhere">
                {plugin.saved !== undefined && (
                  <span>
                    Saved on this machine: v{plugin.saved.version} · <code title="The packed copy">{plugin.saved.path}</code>
                  </span>
                )}
                {plugin.saved !== undefined && plugin.shared !== undefined && ' · '}
                {plugin.shared !== undefined && (plugin.shared.gone === true
                  ? (
                    <span className="acrylBlendsSharedGone" title="GitHub says this repository no longer exists; Share publishes it again">
                      {plugin.shared.url.replace(/^https:\/\//u, '')} is gone
                    </span>
                  )
                  : (
                    <>
                      Shared on GitHub:{' '}
                      <a className="acrylBlendsShared" href={plugin.shared.url} target="_blank" rel="noreferrer">
                        {plugin.shared.url.replace(/^https:\/\//u, '')} · v{plugin.shared.version}
                      </a>
                      {pullCommand(plugin.shared) !== undefined && (
                        <>
                          {' · '}
                          <button type="button" className="acrylBlendsShareButton" title={pullCommand(plugin.shared)} onClick={() => { void copy(plugin, pullCommand(plugin.shared as NonNullable<typeof plugin.shared>) ?? '', 'the pull command') }}>Copy pull command</button>
                        </>
                      )}
                    </>
                  ))}
              </small>
            )}
            {said?.key === plugin.key && <small className="acrylBlendsPlugSaid" role="status">{said.text}</small>}
            {choosing === plugin.key && (
              <ShareChooser
                plugin={plugin}
                readGithub={registry.github}
                connectGithub={registry.connect}
                copy={copyText}
                onSaved={saved => { mark(plugin.key, { saved: { version: saved.version, path: saved.path } }) }}
                onShared={shared => { mark(plugin.key, { shared }) }}
                onClose={() => { setChoosing(undefined) }}
              />
            )}
          </div>
        )
      })}
      </>}
    </div>
  )
}
