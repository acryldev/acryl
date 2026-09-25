// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FilesBody, type FilesBodyProps } from '../../src/client/files/FilesBody.tsx'
import { FileEditorPane } from '../../src/client/files/FileEditorPane.tsx'
import { FileConflictError, type WorkspaceFilesApi } from '../../src/client/files/files-api.ts'
import type { WorkspaceGitApi } from '../../src/client/git/git-api.ts'
import { WorkspaceState } from '../../src/client/canvas/state.ts'
import { WorkspaceShellState } from '../../src/client/worktrees/shell-state.ts'

// CodeMirror needs real layout; the pane's own logic is what is tested, so the editor is a plain textarea here.
vi.mock('../../src/client/files/CodeEditor.tsx', () => ({
  CodeEditor: (props: { value: string; onChange: (text: string) => void; onSave: () => void }) => (
    <textarea aria-label="editor" defaultValue={props.value} onChange={(event) => { props.onChange(event.target.value) }} onKeyDown={(event) => { if (event.key === 's' && event.metaKey) props.onSave() }} />
  ),
}))

afterEach(cleanup)

const gitApi = {
  repo: async () => ({ name: 'p', root: '/p', current: '/p', worktrees: [{ path: '/p', branch: 'main', head: 'a', main: true }] }),
  status: async (path: string) => ({ path, branch: 'main', changes: [], truncated: false }),
} as unknown as WorkspaceGitApi

function makeFilesApi(overrides: Partial<WorkspaceFilesApi> = {}): WorkspaceFilesApi & { writes: unknown[][] } {
  const writes: unknown[][] = []
  return {
    writes,
    tree: async (_w, dir) => dir === ''
      ? { path: '/p', dir, truncated: false, entries: [{ name: 'src', kind: 'dir' }, { name: 'README.md', kind: 'file' }] }
      : { path: '/p', dir, truncated: false, entries: [{ name: 'a.ts', kind: 'file' }] },
    read: async (_w, file) => ({ path: '/p', file, content: 'disk text', binary: false, size: 9, mtimeMs: 100 }),
    write: async (...args) => { writes.push(args); return { path: '/p', file: 'a.ts', size: 1, mtimeMs: 200 } },
    ...overrides,
  }
}

describe('FilesBody', () => {
  async function selectedShell(): Promise<WorkspaceShellState> {
    const shell = new WorkspaceShellState(gitApi)
    await shell.discover('/p')
    shell.select('/p')
    return shell
  }

  it('lists the root, opens a folder lazily, and asks the shell to open a clicked file', async () => {
    const shell = await selectedShell()
    const opened: unknown[] = []
    shell.onOpenFile(request => { opened.push(request) })
    const filesApi = makeFilesApi()
    const props = { shell, filesApi } as unknown as FilesBodyProps
    render(<FilesBody {...props} />)
    expect(await screen.findByText('README.md')).toBeTruthy()
    fireEvent.click(screen.getByRole('treeitem', { name: /src/ }))
    expect(await screen.findByText('a.ts')).toBeTruthy()
    fireEvent.click(screen.getByRole('treeitem', { name: /a\.ts/ }))
    expect(opened).toEqual([{ worktree: '/p', file: 'src/a.ts' }])
  })

  it('filters opened files by name and shows a readable error when the root cannot be read', async () => {
    const shell = await selectedShell()
    const props = { shell, filesApi: makeFilesApi() } as unknown as FilesBodyProps
    render(<FilesBody {...props} />)
    await screen.findByText('README.md')
    fireEvent.change(screen.getByLabelText('Filter files'), { target: { value: 'read' } })
    expect(screen.getByText('README.md')).toBeTruthy()
    expect(screen.queryByText('src')).toBeNull()
    cleanup()
    const failing = { shell, filesApi: makeFilesApi({ tree: () => Promise.reject(new Error('cannot read')) }) } as unknown as FilesBodyProps
    render(<FilesBody {...failing} />)
    expect((await screen.findByRole('alert')).textContent).toContain('cannot read')
  })
})

describe('FileEditorPane', () => {
  function setup(api: WorkspaceFilesApi, mutate?: (state: WorkspaceState) => void) {
    const workspace = new WorkspaceState()
    const tile = workspace.openFile('/p', 'src/a.ts')
    if (tile === undefined) throw new Error('no tile')
    mutate?.(workspace)
    const view = () => workspace.getSnapshot().tiles.find(t => t.id === tile.id)
    const ui = (): React.ReactElement => <FileEditorPane tile={view() ?? tile} workspace={workspace} filesApi={api} />
    return { workspace, tile, view, ui }
  }

  it('loads the file, keeps a draft in the tab when unmounted, and saves with the loaded mtime', async () => {
    const api = makeFilesApi()
    const { ui, view, workspace, tile } = setup(api)
    const first = render(ui())
    const editor = await screen.findByLabelText('editor')
    fireEvent.change(editor, { target: { value: 'edited' } })
    first.unmount()
    // Switching tabs unmounts the pane: the draft must have been copied to the tab.
    expect(view()).toMatchObject({ content: 'edited', fileMtimeMs: 100 })

    render(ui())
    expect(((await screen.findByLabelText('editor')) as HTMLTextAreaElement).value).toBe('edited')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => { expect(api.writes).toEqual([['/p', 'src/a.ts', 'edited', 100]]) })
    await waitFor(() => { expect(screen.getByText('Saved')).toBeTruthy() })
    expect(workspace.getSnapshot().tiles.find(t => t.id === tile.id)?.content).toBeUndefined()
  })

  it('offers overwrite or reload after a conflict, and never overwrites without being asked', async () => {
    let writes = 0
    const api = makeFilesApi({
      write: async () => { writes += 1; if (writes === 1) throw new FileConflictError('changed'); return { path: '/p', file: 'a', size: 1, mtimeMs: 300 } },
    })
    const { ui } = setup(api)
    render(ui())
    fireEvent.change(await screen.findByLabelText('editor'), { target: { value: 'mine' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toContain('changed on disk')
    expect(writes).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Overwrite with my text' }))
    await waitFor(() => { expect(writes).toBe(2) })
    await waitFor(() => { expect(screen.getByText('Saved')).toBeTruthy() })
  })

  it('warns when a kept draft is older than the disk version, and lets you keep or discard it', async () => {
    const api = makeFilesApi()
    const { ui, workspace, tile } = setup(api, (state) => {
      const t = state.getSnapshot().tiles.find(x => x.kind === 'file')
      if (t !== undefined) state.setFileDraft(t.id, 'old draft', 50)
    })
    render(ui())
    expect((await screen.findByRole('alert')).textContent).toContain('changed on disk after you started')
    expect(((await screen.findByLabelText('editor')) as HTMLTextAreaElement).value).toBe('old draft')
    fireEvent.click(screen.getByRole('button', { name: 'Discard my draft and load the disk version' }))
    await waitFor(() => { expect(((screen.getByLabelText('editor')) as HTMLTextAreaElement).value).toBe('disk text') })
    expect(workspace.getSnapshot().tiles.find(t => t.id === tile.id)?.content).toBeUndefined()
  })

  it('shows binary files and read errors instead of an editor', async () => {
    const binary = makeFilesApi({ read: async (_w, file) => ({ path: '/p', file, content: '', binary: true, size: 4, mtimeMs: 1 }) })
    render(setup(binary).ui())
    expect(await screen.findByText(/binary file/)).toBeTruthy()
    cleanup()
    const failing = makeFilesApi({ read: () => Promise.reject(new Error('gone')) })
    render(setup(failing).ui())
    expect((await screen.findByRole('alert')).textContent).toContain('gone')
    act(() => {})
  })
})
