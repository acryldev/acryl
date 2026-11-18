import { render, useRef, useState } from 'acrylblends/jsx/dom'

/** Read a Server-Sent Events body: calls `on(event, data)` for each event as it arrives. (EventSource only does GET, and this is a POST.) */
async function readEvents(
  body: ReadableStream<Uint8Array>,
  on: (event: string, data: string) => void,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    // Line endings may be CRLF; a \r at the end of a chunk is completed by the next chunk, so normalise the whole buffer.
    buffer = (buffer + decoder.decode(value, { stream: true })).replaceAll('\r\n', '\n')
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      let event = 'message'
      const data: string[] = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, '')) // the SSE spec strips one leading space only
      }
      on(event, data.join('\n'))
    }
  }
}

const Chat = ({ start }: { start: number | undefined }) => {
  const [text, setText] = useState('')
  const [asked, setAsked] = useState('')
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const conversation = useRef<number | undefined>(start)
  const controller = useRef<AbortController | undefined>(undefined)

  const send = async (event: Event) => {
    event.preventDefault()
    const message = text.trim()
    if (message === '' || busy) return
    setAsked(message)
    setAnswer('')
    setError('')
    setText('')
    setBusy(true)
    controller.current = new AbortController()
    try {
      const response = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, conversation: conversation.current }),
        signal: controller.current.signal,
      })
      if (!response.ok || !response.body) {
        const problem = (await response.json().catch(() => ({}))) as {
          issues?: { message: string }[]
          error?: string
        }
        setError(problem.issues?.[0]?.message ?? problem.error ?? 'The message was not accepted.')
        return
      }
      let soFar = ''
      await readEvents(response.body, (name, data) => {
        if (name === 'meta') {
          conversation.current = (JSON.parse(data) as { conversation: number }).conversation
          history.replaceState(null, '', `${base}/?c=${conversation.current}`)
        } else if (name === 'token') {
          soFar += JSON.parse(data) as string
          setAnswer(soFar)
        } else if (name === 'error') setError(JSON.parse(data) as string)
      })
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError'))
        setError('The connection was lost.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {asked !== '' && <p class="row user">{asked}</p>}
      {answer !== '' && <p class="row">{answer}</p>}
      {error !== '' && (
        <p class="row error" role="alert">
          {error}
        </p>
      )}
      <form onSubmit={send}>
        <textarea
          rows={3}
          value={text}
          placeholder="Ask something"
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        />
        <p>
          <button type="submit" disabled={busy}>
            Send
          </button>{' '}
          {busy && (
            <button type="button" onClick={() => controller.current?.abort()}>
              Stop
            </button>
          )}
        </p>
      </form>
    </div>
  )
}

const root = document.getElementById('chat')!
/** The path the app is mounted at: '' on its own server, `/app` in the ACRYL frame. The page writes it on the element. */
const base = root.dataset.base ?? ''
const start = root.dataset.conversation ? Number(root.dataset.conversation) : undefined
render(<Chat start={start} />, root)
