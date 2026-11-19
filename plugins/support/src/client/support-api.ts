/** Same-origin browser client for the diagnostics download. */

import { SUPPORT_DIAGNOSTICS_PATH } from '../contract.ts'

export interface DiagnosticsDownload {
  readonly blob: Blob
  readonly fileName: string
}

export interface SupportApi {
  /** @throws an Error whose message is fit to show the user. */
  fetchDiagnostics(): Promise<DiagnosticsDownload>
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** The file name the Host suggested, or a plain default. */
export function fileNameFrom(disposition: string | null): string {
  const match = disposition === null ? null : /filename="([A-Za-z0-9._-]{1,120})"/.exec(disposition)
  return match?.[1] ?? 'acryl-diagnostics.zip'
}

/** @param fetchImpl - injectable for tests; defaults to the page's fetch. */
export function createSupportApi(fetchImpl: FetchLike = (input, init) => fetch(input, init)): SupportApi {
  return {
    async fetchDiagnostics() {
      const response = await fetchImpl(SUPPORT_DIAGNOSTICS_PATH, { method: 'GET', credentials: 'same-origin' })
      if (response.status === 429) throw new Error('An export is already running. Try again in a moment.')
      if (response.status !== 200) throw new Error(`The export failed (HTTP ${String(response.status)}).`)
      return { blob: await response.blob(), fileName: fileNameFrom(response.headers.get('content-disposition')) }
    },
  }
}

/** Hand the archive to the browser as a download. */
export function saveDownload(download: DiagnosticsDownload, doc: Document = document): void {
  const url = URL.createObjectURL(download.blob)
  const link = doc.createElement('a')
  link.href = url
  link.download = download.fileName
  doc.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => { URL.revokeObjectURL(url) }, 10_000)
}
