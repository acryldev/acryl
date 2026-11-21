/**
 * The Registry tab of Settings > Plugins: the public Cordis plugin registry, searchable, with one button to add a plugin to this app. Plain words;
 * the address, compatibility and the tool's own messages are behind "Details". Nothing is added without the person's yes (the question names whose code it is).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PulledPluginView, RegistryEntryView, RegistryOrigin, RegistryView as Registry } from '../contract.ts'
import { PlainFailure } from './plain-failure.ts'
import type { RegistryApi } from './registry-api.ts'
import { addedText, addQuestion, cleanAddress, entryByline, filterRegistry, forOtherApps, type OriginFilter } from './registry-list.ts'

export interface RegistryViewProps {
  readonly api: RegistryApi
  /** The app's plugin list changed (a plugin was added): read it again. */
  readonly onAdded: () => void
}

type Load =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly registry: Registry }

/** What is about to be added, waiting for the person's yes. */
interface Asking {
  /** The version the app has, when this is an update of it. */
  readonly updateFrom?: string
  readonly source: string
  readonly name: string
  readonly owner: string
  /** Bytes it downloads besides itself for this computer. */
  readonly download?: number
  /** Unknown for an address someone pasted. */
  readonly origin?: RegistryOrigin
}

const ORIGINS: readonly { readonly value: OriginFilter; readonly label: string }[] = [{ value: 'all', label: 'All' }, { value: 'official', label: 'Official' }, { value: 'community', label: 'Community' }]

type Said =
  | { readonly kind: 'ok'; readonly text: string }
  | { readonly kind: 'error'; readonly text: string; readonly details?: string }

const ownerOfAddress = (source: string): string => /^github:([^/]+)\//u.exec(source)?.[1] ?? 'its author'
const nameOfAddress = (source: string): string => /^github:[^/]+\/([^@]+)@/u.exec(source)?.[1] ?? source

export function RegistryView({ api, onAdded }: RegistryViewProps) {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [reads, setReads] = useState(0)
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [origin, setOrigin] = useState<OriginFilter>('all')
  const [asking, setAsking] = useState<Asking | undefined>(undefined)
  const [adding, setAdding] = useState<string | undefined>(undefined)
  const [said, setSaid] = useState<Said | undefined>(undefined)
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [address, setAddress] = useState('')

  useEffect(() => {
    let live = true
    api.registry().then(
      (registry) => { if (live) setLoad({ status: 'ready', registry }) },
      (cause: unknown) => { if (live) setLoad({ status: 'ready', registry: { status: 'unavailable', message: cause instanceof PlainFailure ? cause.message : 'The registry could not be read. Try again in a moment.' } }) },
    )
    return () => { live = false }
  }, [api, reads])

  const entries = load.status === 'ready' && load.registry.status === 'ready' ? load.registry.entries : []
  const shown = useMemo(() => filterRegistry(entries, query, showAll, origin), [entries, query, showAll, origin])
  const hidden = useMemo(() => entries.filter(forOtherApps).length, [entries])

  const add = useCallback(async (source: string) => {
    setAsking(undefined)
    setAdding(source)
    setSaid(undefined)
    try {
      const pulled: PulledPluginView = await api.add(source)
      setSaid({ kind: 'ok', text: addedText(pulled) })
      setAddress('')
      setReads(count => count + 1)
      onAdded()
    } catch (cause) {
      setSaid(cause instanceof PlainFailure
        ? { kind: 'error', text: cause.message, ...(cause.details === undefined ? {} : { details: cause.details }) }
        : { kind: 'error', text: 'The plugin could not be added. Nothing was changed.', details: cause instanceof Error ? cause.message : String(cause) })
    }
    setAdding(undefined)
  }, [api, onAdded])

  const toggleDetails = (key: string) => {
    setOpen((current) => {
      const next = new Set(current)
      if (!next.delete(key)) next.add(key)
      return next
    })
  }

  const byAddress = cleanAddress(address)

  const question = (item: Asking) => (
    <div className="acrylBlendsShareAsk" role="alertdialog" aria-label={`Add ${item.name}`}>
      <p>{item.updateFrom === undefined ? addQuestion(item.name, item.owner, item.download, item.origin) : `Update ${item.name} from v${item.updateFrom}? Changes you made to its folder are kept; if the new release changes the same lines, nothing is changed and it says which file.`}</p>
      <div className="acrylBlendsShareRow">
        {/* Cancel is the default: Enter or a stray click adds nothing. */}
        <button type="button" className="acrylBlendsShareCancel" autoFocus onClick={() => { setAsking(undefined) }}>Cancel</button>
        <button type="button" className="acrylBlendsShareConfirm" onClick={() => { void add(item.source) }}>{item.updateFrom === undefined ? 'Add to my app' : 'Update'}</button>
      </div>
    </div>
  )

  const row = (entry: RegistryEntryView) => {
    const key = entry.source
    const details = open.has(key)
    return (
      <div key={key} className="acrylBlendsRegRow" data-installed={entry.installed || undefined}>
        <div className="acrylBlendsRegHead">
          <b>{entry.name}</b>
          <span className="acrylBlendsPlugBy" data-origin={entry.origin} title={entry.origin === 'official' ? 'Released by the ACRYL project' : 'Released by someone outside the ACRYL project; its code is not reviewed'}>{entry.origin === 'official' ? 'Official' : 'Community'}</span>
          {entry.mine && <span className="acrylBlendsPlugBy">Yours</span>}
          {forOtherApps(entry) && <span className="acrylBlendsPlugBy" title="Made for another kind of app; it may not run in this one">other apps</span>}
          {entry.installed && entry.updateFrom === undefined
            ? <span className="acrylBlendsRegAdded" role="status">Added</span>
            : (
              <button type="button" className="acrylBlendsRegAdd" disabled={adding !== undefined} onClick={() => { setSaid(undefined); setAsking({ source: entry.source, name: entry.name, owner: entry.owner, origin: entry.origin, ...(entry.updateFrom === undefined ? {} : { updateFrom: entry.updateFrom }), ...(entry.download === undefined ? {} : { download: entry.download }) }) }}>
                {adding === entry.source ? (entry.updateFrom === undefined ? 'Adding…' : 'Updating…') : entry.updateFrom === undefined ? 'Add to my app' : `Update to v${entry.version}`}
              </button>
            )}
        </div>
        {entry.description !== '' && <small>{entry.description}</small>}
        <small>
          {entryByline(entry)}
          {' · '}
          <a className="acrylBlendsShared" href={entry.url} target="_blank" rel="noreferrer">View on GitHub</a>
          {' · '}
          <button type="button" className="acrylBlendsShareButton" aria-expanded={details} onClick={() => { toggleDetails(key) }}>Details</button>
        </small>
        {details && (
          <small className="acrylBlendsRegDetails">
            Address: <code>{entry.source}</code> · Works with: {entry.compatibility}
          </small>
        )}
        {asking?.source === entry.source && question(asking)}
      </div>
    )
  }

  return (
    <div className="acrylBlendsRegistry">
      <p className="acrylBlendsPluginsSub">Plugins other people shared publicly. Add one and it starts working in this app right away.</p>
      <div className="acrylBlendsPluginsTools">
        <input className="acrylBlendsSearch" aria-label="Search the registry" placeholder="Search the registry" value={query} onChange={(event) => { setQuery(event.target.value) }} />
        <label className="acrylBlendsRegAll">
          <input type="checkbox" checked={showAll} onChange={(event) => { setShowAll(event.target.checked) }} />
          {' '}Show plugins for other apps too{hidden === 0 ? '' : ` (${hidden})`}
        </label>
      </div>
      <div className="acrylBlendsRegOrigin" role="group" aria-label="Who made it">
        {ORIGINS.map(choice => <button key={choice.value} type="button" aria-pressed={origin === choice.value} onClick={() => { setOrigin(choice.value) }}>{choice.label}</button>)}
      </div>
      {said !== undefined && (
        <p className={said.kind === 'ok' ? 'acrylBlendsPlugSaid' : 'acrylBlendsNote'} data-error={said.kind === 'error' || undefined} role={said.kind === 'ok' ? 'status' : 'alert'}>
          {said.text}
          {said.kind === 'error' && said.details !== undefined && (
            <>
              {' '}
              <button type="button" className="acrylBlendsShareButton" aria-expanded={open.has('error')} onClick={() => { toggleDetails('error') }}>Details</button>
            </>
          )}
        </p>
      )}
      {said?.kind === 'error' && said.details !== undefined && open.has('error') && <pre className="acrylBlendsDetailsText">{said.details}</pre>}
      {load.status === 'loading' && <p className="acrylBlendsNote">Reading the registry…</p>}
      {load.status === 'ready' && load.registry.status === 'unavailable' && (
        <p className="acrylBlendsNote" data-error role="alert">
          {load.registry.message}
          {' '}
          <button type="button" className="acrylBlendsShareButton" onClick={() => { setLoad({ status: 'loading' }); setReads(count => count + 1) }}>Try again</button>
        </p>
      )}
      {load.status === 'ready' && load.registry.status === 'ready' && shown.length === 0 && (
        <p className="acrylBlendsNote">{entries.length === 0 ? 'Nothing is listed yet.' : 'No plugin matches.'}</p>
      )}
      {shown.map(row)}
      <div className="acrylBlendsRegByAddress">
        <b>Add by address</b>
        <small>Got an address from a colleague? Paste it here. It looks like github:name/plugin@1.0.0</small>
        <div className="acrylBlendsPluginsTools">
          <input className="acrylBlendsSearch" aria-label="Plugin address" placeholder="github:name/plugin@1.0.0" value={address} onChange={(event) => { setAddress(event.target.value) }} />
          <button type="button" className="acrylBlendsRegAdd" disabled={byAddress === undefined || adding !== undefined} onClick={() => { if (byAddress !== undefined) { setSaid(undefined); setAsking({ source: byAddress, name: nameOfAddress(byAddress), owner: ownerOfAddress(byAddress) }) } }}>Add to my app</button>
        </div>
        {asking !== undefined && !entries.some(entry => entry.source === asking.source) && question(asking)}
      </div>
    </div>
  )
}
