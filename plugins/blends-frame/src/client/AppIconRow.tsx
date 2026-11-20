/**
 * Settings > App > Icon: the app's own icon. The picked image (PNG, JPEG, SVG, WebP...) is drawn on a 512 px square in the page and sent as a PNG to
 * the frame's host, which keeps it as assets/icon.png: the browser tab shows it at once, the desktop window too, and the Dock on macOS from the
 * window's next start.
 */

import { type ChangeEvent, useState } from 'react'
import { FRAME_APP_ICON_PATH } from '../contract.ts'

const SIZE = 512

/** The image as a 512 px PNG, centred and kept whole, as base64. */
async function asPng(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = SIZE
    canvas.height = SIZE
    const context = canvas.getContext('2d')
    if (context === null) throw new Error('this browser cannot draw the image')
    const scale = Math.min(SIZE / (image.naturalWidth || SIZE), SIZE / (image.naturalHeight || SIZE))
    const width = (image.naturalWidth || SIZE) * scale
    const height = (image.naturalHeight || SIZE) * scale
    context.drawImage(image, (SIZE - width) / 2, (SIZE - height) / 2, width, height)
    return canvas.toDataURL('image/png').slice('data:image/png;base64,'.length)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Point the tab's icon at the new file (browsers keep the old one otherwise). */
function refreshTabIcon(version: number): void {
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')) link.href = `/favicon.svg?v=${String(version)}`
}

export function AppIconRow() {
  const [version, setVersion] = useState(() => Date.now())
  const [note, setNote] = useState<{ readonly text: string; readonly error: boolean } | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  const pick = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file === undefined) return
    setBusy(true)
    setNote(undefined)
    void (async () => {
      try {
        const response = await fetch(FRAME_APP_ICON_PATH, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ png: await asPng(file) }),
        })
        if (!response.ok) {
          const said = await response.json().then((body: { error?: unknown }) => body.error, () => undefined)
          throw new Error(typeof said === 'string' && said !== '' ? said : `the icon was not saved (HTTP ${String(response.status)})`)
        }
        const next = Date.now()
        setVersion(next)
        refreshTabIcon(next)
        setNote({ text: 'Saved. The window shows it now; the Dock on a Mac from the next start.', error: false })
      } catch (cause) {
        setNote({ text: cause instanceof Error ? cause.message : String(cause), error: true })
      } finally {
        setBusy(false)
      }
    })()
  }

  return (
    <div className="acrylBlendsAppRow">
      <b>Icon</b>
      <span className="acrylBlendsAppControls">
        <img className="acrylBlendsAppIcon" src={`/favicon.svg?v=${String(version)}`} alt="This app's icon" width={28} height={28} />
        <label className="acrylBlendsAppButton">
          {busy ? 'Saving…' : 'Choose an image…'}
          <input type="file" accept="image/*" hidden disabled={busy} onChange={pick} />
        </label>
      </span>
      <small>
        {note === undefined ? 'The icon of this app: its window, its browser tab, and its Dock icon on a Mac. Saved in the app as assets/icon.png.' : (
          <span role={note.error ? 'alert' : 'status'} {...(note.error ? { 'data-error': '' } : {})}>{note.text}</span>
        )}
      </small>
    </div>
  )
}
