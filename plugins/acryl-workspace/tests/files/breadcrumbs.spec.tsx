// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { crumbsFor, parentDir } from '../../src/client/files/breadcrumbs.ts'
import { FileBreadcrumbs } from '../../src/client/files/FileBreadcrumbs.tsx'
import type { FilesTreeView } from '../../src/files/contract.ts'

afterEach(cleanup)

describe('the path parts', () => {
  it('names the worktree, each folder and the file, each with the folder it lists', () => {
    expect(crumbsFor('/home/me/acryl/', 'apps/desktop/main.tsx')).toEqual([
      { label: 'acryl', dir: '', file: false },
      { label: 'apps', dir: 'apps', file: false },
      { label: 'desktop', dir: 'apps/desktop', file: false },
      { label: 'main.tsx', dir: 'apps/desktop', file: true },
    ])
    expect(crumbsFor('C:\\work\\acryl', 'README.md').map(crumb => [crumb.label, crumb.dir])).toEqual([['acryl', ''], ['README.md', '']])
  })

  it('goes up one folder at a time and stops at the root', () => {
    expect(parentDir('apps/desktop')).toBe('apps')
    expect(parentDir('apps')).toBe('')
    expect(parentDir('')).toBeUndefined()
  })
})

const TREE: Record<string, FilesTreeView['entries']> = {
  '': [{ name: 'apps', kind: 'dir' }, { name: 'README.md', kind: 'file' }],
  apps: [{ name: 'desktop', kind: 'dir' }, { name: 'web', kind: 'dir' }],
  'apps/desktop': [{ name: 'main.tsx', kind: 'file' }, { name: 'menu.ts', kind: 'file' }],
  'apps/web': [{ name: 'index.ts', kind: 'file' }],
}

function setup() {
  const tree = vi.fn(async (worktree: string, dir: string): Promise<FilesTreeView> => ({ path: worktree, dir, entries: TREE[dir] ?? [], truncated: false }))
  const onOpenFile = vi.fn()
  render(<FileBreadcrumbs worktree="/w/acryl" file="apps/desktop/main.tsx" filesApi={{ tree }} onOpenFile={onOpenFile} suffix=" ●" />)
  return { tree, onOpenFile }
}

const list = () => screen.getByRole('listbox')
const names = async () => {
  await waitFor(() => { expect(within(list()).queryByText('Opening...')).toBeNull() })
  return within(list()).getAllByRole('option').map(option => option.textContent)
}

describe('walking the project from the breadcrumbs', () => {
  it('lists a folder, opens a subfolder in place, goes up, and opens a file', async () => {
    const { tree, onOpenFile } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'apps' }))
    expect(await names()).toEqual(['..', 'desktop', 'web'])
    expect(tree).toHaveBeenLastCalledWith('/w/acryl', 'apps')

    fireEvent.click(within(list()).getByRole('option', { name: 'web' }))
    expect(await names()).toEqual(['..', 'index.ts'])
    fireEvent.click(within(list()).getByRole('option', { name: '..' }))
    expect(await names()).toEqual(['..', 'desktop', 'web'])
    fireEvent.click(within(list()).getByRole('option', { name: '..' }))
    expect(await names()).toEqual(['apps', 'README.md'])

    fireEvent.click(within(list()).getByRole('option', { name: 'README.md' }))
    expect(onOpenFile).toHaveBeenCalledWith('README.md')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('shows the file among its neighbours, marked, with its unsaved suffix on the path', async () => {
    setup()
    const file = screen.getByRole('button', { name: 'main.tsx ●' })
    expect(file.getAttribute('aria-current')).toBe('page')
    fireEvent.click(file)
    expect(await names()).toEqual(['..', 'main.tsx', 'menu.ts'])
    expect(within(list()).getByRole('option', { name: 'main.tsx' }).getAttribute('aria-selected')).toBe('true')
  })

  it('moves with the arrow keys, opens with Enter and closes with Escape', async () => {
    const { onOpenFile } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'desktop' }))
    await names()
    fireEvent.keyDown(list(), { key: 'ArrowDown' })
    fireEvent.keyDown(list(), { key: 'ArrowDown' })
    fireEvent.keyDown(list(), { key: 'Enter' })
    expect(onOpenFile).toHaveBeenCalledWith('apps/desktop/menu.ts')

    fireEvent.click(screen.getByRole('button', { name: 'acryl' }))
    await names()
    fireEvent.keyDown(list(), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('closes when something else is pressed', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'apps' }))
    await names()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})

describe('folding a long path', () => {
  it('folds as few outer folders as it takes, never the file', async () => {
    const { foldCount } = await import('../../src/client/files/breadcrumbs.ts')
    // acryl, › apps, › desktop, › main.tsx; "..." is 20 wide.
    const widths = [50, 50, 60, 80]
    expect(foldCount(widths, 20, 240)).toBe(0)
    expect(foldCount(widths, 20, 239)).toBe(1)
    expect(foldCount(widths, 20, 160)).toBe(2)
    expect(foldCount(widths, 20, 50)).toBe(3)
    expect(foldCount([80], 20, 10)).toBe(0)
  })
})
