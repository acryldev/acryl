/**
 * What an app remembers about the plugins it pulled: their source and digests, in the `plugin-share` row's config of `blend.yaml`. A row's config is
 * resolved into `blend.lock.json` too, so the lock records them with no new format, and a copy of the app can fetch exactly the same bytes. Pure text
 * to text; comments and the person's formatting stay.
 */
import { isMap, isSeq, parseDocument } from 'yaml'

export const ROW = 'plugin-share'

export interface PulledRecord {
  /** `github:<owner>/<repo>@<version>` or an https address: something another machine can fetch. */
  readonly source: string
  /** The sha512 of the release file. */
  readonly integrity: string
  /** The sha256 of the plugin's content. */
  readonly digest: string
}

const isRecord = (value: unknown): value is PulledRecord => {
  const record = value as Partial<Record<keyof PulledRecord, unknown>> | null
  return (
    typeof record?.source === 'string' &&
    typeof record.integrity === 'string' &&
    typeof record.digest === 'string'
  )
}

/** The plugins this definition remembers pulling. */
export function pulledRecords(text: string): Readonly<Record<string, PulledRecord>> {
  const rows = (parseDocument(text).toJS() as { spec?: { rows?: unknown } } | null)?.spec?.rows
  if (!Array.isArray(rows)) return {}
  const pulled = (
    rows.find((row: { name?: unknown }) => row?.name === ROW) as
      | { config?: { pulled?: unknown } }
      | undefined
  )?.config?.pulled
  if (typeof pulled !== 'object' || pulled === null) return {}
  return Object.fromEntries(
    Object.entries(pulled).filter(([, record]) => isRecord(record)),
  ) as Record<string, PulledRecord>
}

/**
 * The definition with one plugin's record written, or taken out when `record` is undefined. Unchanged when it has no `plugin-share` row: an app
 * composed without the row has nowhere to remember.
 */
export function withPulledRecord(
  text: string,
  name: string,
  record: PulledRecord | undefined,
): string {
  const document = parseDocument(text)
  const rows = document.getIn(['spec', 'rows'])
  if (!isSeq(rows)) return text
  const row = rows.items.find((item) => isMap(item) && item.get('name') === ROW)
  if (!isMap(row)) return text
  if (record === undefined) {
    if (!row.hasIn(['config', 'pulled', name])) return text
    row.deleteIn(['config', 'pulled', name])
    const left = row.getIn(['config', 'pulled'])
    if (isMap(left) && left.items.length === 0) row.deleteIn(['config', 'pulled'])
    const config = row.get('config')
    if (isMap(config) && config.items.length === 0) row.delete('config')
  } else {
    row.setIn(['config'], row.get('config') ?? document.createNode({}))
    if (!row.hasIn(['config', 'pulled'])) row.setIn(['config', 'pulled'], document.createNode({}))
    row.setIn(['config', 'pulled', name], document.createNode(record))
  }
  return String(document)
}
