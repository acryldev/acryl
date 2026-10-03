/**
 * The "Claude worker" tab: a Claude Code process the Host runs for you, shown beside terminals and chats. Pick a folder, start it, talk to it.
 * The answer arrives when the agent finishes its turn (progress is not streamed yet), and Cancel interrupts it. The Host owns the process;
 * the tab only owns what is on screen and what is saved with the workspace.
 */

import { useCallback, useRef, useState, type ComponentType } from 'react'
import type { WorkspaceTabProps } from 'acryl-workspace/client'
import type { WorkerResponse } from '../../workers-contract.ts'
import type { WorkersApi } from './workers-api.ts'
import { folderName, parseWorkerState, serializeWorkerState, type WorkerMessage, type WorkerTabState } from './worker-state.ts'

export interface WorkerTabProps {
  readonly state: string | undefined
  readonly api: WorkersApi
  setState(next: string): void
  setTitle(title: string): void
}

const zh = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')
const words = zh
  ? { folder: '工作文件夹', start: '启动 Claude', placeholder: '给 Claude 发消息', send: '发送', cancel: '中断', stop: '停止', working: '正在处理…', intro: '选择 Claude Code 工作的文件夹的绝对路径。', ended: '这个 Claude 已不在运行。', fresh: '重新开始', you: '你', agent: 'Claude' }
  : { folder: 'Folder for Claude', start: 'Start Claude', placeholder: 'Message to Claude', send: 'Send', cancel: 'Cancel', stop: 'Stop worker', working: 'Working…', intro: 'Type the absolute path of the folder Claude Code should work in.', ended: 'This Claude is no longer running.', fresh: 'Start over', you: 'You', agent: 'Claude' }

function refusalText(response: Extract<WorkerResponse, { ok: false }>): string {
  return response.message
}

/** The component a tab type registers: the worker tab bound to one {@link WorkersApi}. */
export function workerTabComponent(api: WorkersApi): ComponentType<WorkspaceTabProps> {
  return function BoundWorkerTab({ state, setState, setTitle }: WorkspaceTabProps) {
    return <WorkerTab state={state} api={api} setState={setState} setTitle={setTitle} />
  }
}

export function WorkerTab({ state: saved, api, setState, setTitle }: WorkerTabProps) {
  const [state, setLocal] = useState<WorkerTabState>(() => parseWorkerState(saved))
  const [cwd, setCwd] = useState(state.cwd)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | undefined>(undefined)
  const aborter = useRef<AbortController | null>(null)

  const commit = useCallback((next: WorkerTabState): void => { setLocal(next); setState(serializeWorkerState(next)) }, [setState])
  const append = (current: WorkerTabState, ...added: WorkerMessage[]): WorkerTabState => ({ ...current, messages: [...current.messages, ...added] })

  const start = async (): Promise<void> => {
    setProblem(undefined)
    setBusy(true)
    try {
      const response = await api.call({ op: 'attach', provider: 'claude', cwd: cwd.trim() })
      if (!response.ok) { setProblem(refusalText(response)); return }
      const workerId = (response.result as { workerId: string }).workerId
      setTitle(`Claude: ${folderName(cwd.trim())}`)
      commit({ cwd: cwd.trim(), workerId, messages: [] })
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const send = async (): Promise<void> => {
    const text = draft.trim()
    if (text === '' || state.workerId === undefined || busy) return
    setDraft('')
    setProblem(undefined)
    let current = append(state, { role: 'you', text })
    commit(current)
    setBusy(true)
    aborter.current = new AbortController()
    try {
      const response = await api.call({ op: 'send', workerId: state.workerId, text }, aborter.current.signal)
      if (response.ok) {
        const turn = response.result as { text: string; isError: boolean }
        current = append(current, { role: turn.isError ? 'note' : 'agent', text: turn.text === '' ? '(no text)' : turn.text })
      } else {
        current = append(current, { role: 'note', text: response.code === 'unknown-worker' || response.code === 'transport-unavailable' ? words.ended : refusalText(response) })
        if (response.code === 'unknown-worker' || response.code === 'transport-unavailable') current = { ...current, workerId: undefined }
      }
      commit(current)
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) setProblem(cause instanceof Error ? cause.message : String(cause))
    } finally {
      aborter.current = null
      setBusy(false)
    }
  }

  const cancel = (): void => {
    if (state.workerId !== undefined) void api.call({ op: 'cancel', workerId: state.workerId }).catch(() => undefined)
  }

  const stop = async (): Promise<void> => {
    if (state.workerId === undefined) return
    aborter.current?.abort()
    await api.call({ op: 'stop', workerId: state.workerId }).catch(() => undefined)
    commit({ ...state, workerId: undefined })
  }

  if (state.workerId === undefined) {
    return (
      <div className="acrylWorker">
        <p className="acrylWorkerIntro">{words.intro}</p>
        <input
          aria-label={words.folder}
          value={cwd}
          placeholder="/path/to/project"
          onChange={(event) => { setCwd(event.target.value) }}
          onKeyDown={(event) => { if (event.key === 'Enter' && cwd.trim() !== '') void start() }}
        />
        <div className="acrylWorkerActions"><button type="button" data-primary disabled={busy || cwd.trim() === ''} onClick={() => { void start() }}>{words.start}</button></div>
        {state.messages.length > 0 && <Transcript messages={state.messages} />}
        {problem !== undefined && <p role="alert" className="acrylWorkerProblem">{problem}</p>}
      </div>
    )
  }
  return (
    <div className="acrylWorker">
      <Transcript messages={state.messages} />
      {busy && <p role="status" className="acrylWorkerStatus">{words.working}</p>}
      {problem !== undefined && <p role="alert" className="acrylWorkerProblem">{problem}</p>}
      <textarea
        aria-label={words.placeholder}
        placeholder={words.placeholder}
        value={draft}
        rows={3}
        onChange={(event) => { setDraft(event.target.value) }}
        onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }}
      />
      <div className="acrylWorkerActions">
        <button type="button" data-primary disabled={busy || draft.trim() === ''} onClick={() => { void send() }}>{words.send}</button>
        <button type="button" disabled={!busy} onClick={cancel}>{words.cancel}</button>
        <button type="button" onClick={() => { void stop() }}>{words.stop}</button>
      </div>
    </div>
  )
}

function Transcript({ messages }: { readonly messages: readonly WorkerMessage[] }) {
  return (
    <div role="log" aria-label="Transcript" className="acrylWorkerLog">
      {messages.map((message, index) => (
        <div key={index} className="acrylWorkerMessage" data-role={message.role}>
          {message.role !== 'note' && <strong>{message.role === 'you' ? words.you : words.agent}</strong>}{message.text}
        </div>
      ))}
    </div>
  )
}
