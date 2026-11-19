import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  type DesktopPort,
  findDoor,
  handleShellCall,
  type MenuItemPort,
  ShellRefusal,
  startDoorShell,
  type WindowPort,
} from '../door-shell.ts'

function fakeDesktop() {
  const log: string[] = []
  let next = 1
  const make = (
    path: string,
  ): WindowPort & { closed: boolean; minimized: boolean; size: number[] } => {
    const id = next++
    const window = {
      id,
      closed: false,
      minimized: false,
      size: [1000, 700],
      getTitle: () => `demo ${String(id)}`,
      getURL: () => `http://127.0.0.1:3000${path}`,
      isFocused: () => id === 1,
      isMinimized: () => window.minimized,
      getSize: () => window.size,
      getPosition: () => [100 + 32 * (id - 1), 80 + 32 * (id - 1)],
      restore: () => {
        window.minimized = false
        log.push(`restore ${String(id)}`)
      },
      focus: () => log.push(`focus ${String(id)}`),
      close: () => {
        window.closed = true
        list.splice(list.indexOf(window), 1)
        log.push(`close ${String(id)}`)
      },
      setSize: (width: number, height: number) => {
        window.size = [width, height]
      },
    }
    return window
  }
  const list = [make('/')]
  const item = (label: string, options: Partial<MenuItemPort> = {}): MenuItemPort => ({
    label,
    enabled: true,
    visible: true,
    type: 'normal',
    click: () => log.push(`click ${label}`),
    ...options,
  })
  const items: MenuItemPort[] = [
    item('File', {
      type: 'submenu',
      submenu: {
        items: [
          item('New Note'),
          item('', { type: 'separator' }),
          item('Export', { enabled: false }),
          item('Hidden', { visible: false }),
          item('Close Window', { role: 'close' }),
          item('Quit', { role: 'quit' }),
        ],
      },
    }),
    item('Help', { type: 'submenu', submenu: { items: [item('About')] } }),
  ]
  const desktop: DesktopPort = {
    windows: () => list,
    open: (path) => {
      const window = make(path ?? '/')
      list.push(window)
      return window
    },
    menu: () => items,
  }
  return { desktop, list, log }
}

const refused = (code: string) => (error: unknown) =>
  error instanceof ShellRefusal && error.code === code

test('window list names each window with its path (never its origin), size and focus', () => {
  const { desktop } = fakeDesktop()
  assert.deepEqual(handleShellCall({ op: 'window-list' }, desktop), {
    windows: [
      { id: 1, title: 'demo 1', path: '/', focused: true, width: 1000, height: 700, x: 100, y: 80 },
    ],
  })
})

test('window open adds a window on the path and answers its id; focus restores a minimized window first', () => {
  const { desktop, list, log } = fakeDesktop()
  const opened = handleShellCall({ op: 'window-open', path: '/settings?tab=a' }, desktop)
  assert.deepEqual(opened, { ok: true, detail: 'opened window 2 on /settings?tab=a', id: 2 })
  assert.equal(list.length, 2)
  const second = list[1]
  assert.ok(second)
  second.minimized = true
  handleShellCall({ op: 'window-focus', id: 2 }, desktop)
  assert.deepEqual(log, ['restore 2', 'focus 2'])
  assert.deepEqual(handleShellCall({ op: 'window-open' }, desktop), {
    ok: true,
    detail: 'opened window 3 on /',
    id: 3,
  })
})

test('window resize and close act on the window asked for; an unknown id names the windows there are', () => {
  const { desktop, list } = fakeDesktop()
  handleShellCall({ op: 'window-open' }, desktop)
  assert.deepEqual(
    handleShellCall({ op: 'window-resize', id: 2, width: 900, height: 640 }, desktop),
    {
      ok: true,
      detail: 'window 2 is now 900x640',
      id: 2,
    },
  )
  assert.deepEqual(list[1]?.getSize(), [900, 640])
  handleShellCall({ op: 'window-close', id: 2 }, desktop)
  assert.equal(list.length, 1)
  assert.throws(
    () => handleShellCall({ op: 'window-focus', id: 9 }, desktop),
    (error) => {
      assert.ok(error instanceof ShellRefusal)
      assert.equal(error.code, 'no-such-window')
      assert.match(error.message, /there is no window 9; the windows are 1/)
      return true
    },
  )
})

test('the last window is not closed without force, and closes with it', () => {
  const { desktop, list } = fakeDesktop()
  assert.throws(
    () => handleShellCall({ op: 'window-close', id: 1 }, desktop),
    refused('last-window'),
  )
  assert.equal(list.length, 1)
  handleShellCall({ op: 'window-close', id: 1, force: true }, desktop)
  assert.equal(list.length, 0)
})

test('menu list prints paths in order, leaving out separators and hidden items; click presses an item by its path', () => {
  const { desktop, log } = fakeDesktop()
  assert.deepEqual(handleShellCall({ op: 'menu-list' }, desktop), {
    items: [
      { path: 'File>New Note', label: 'New Note', enabled: true },
      { path: 'File>Export', label: 'Export', enabled: false },
      { path: 'File>Close Window', label: 'Close Window', enabled: true, ends: true },
      { path: 'File>Quit', label: 'Quit', enabled: true, ends: true },
      { path: 'Help>About', label: 'About', enabled: true },
    ],
  })
  assert.deepEqual(handleShellCall({ op: 'menu-click', path: 'File > New Note' }, desktop), {
    ok: true,
    detail: 'pressed File>New Note',
  })
  assert.deepEqual(log, ['click New Note'])
})

test('menu click refuses a disabled item and an unknown one, and presses nothing', () => {
  const { desktop, log } = fakeDesktop()
  assert.throws(
    () => handleShellCall({ op: 'menu-click', path: 'File>Export' }, desktop),
    refused('disabled'),
  )
  assert.throws(
    () => handleShellCall({ op: 'menu-click', path: 'File>Nope' }, desktop),
    refused('no-such-menu-item'),
  )
  assert.throws(
    () => handleShellCall({ op: 'menu-click', path: 'File>Hidden' }, desktop),
    refused('no-such-menu-item'),
  )
  assert.deepEqual(log, [])
  assert.deepEqual(handleShellCall({ op: 'menu-list' }, { ...desktop, menu: () => [] }), {
    items: [],
  })
})

test('findDoor reads the address and secret of a loopback door, and nothing else', () => {
  const door = (value: unknown) => () => JSON.stringify(value)
  assert.deepEqual(
    findDoor('/app', door({ url: 'http://127.0.0.1:3000/x', secret: 's', pid: 1 })),
    {
      url: 'http://127.0.0.1:3000',
      secret: 's',
    },
  )
  assert.equal(findDoor('/app', door({ url: 'http://example.com', secret: 's' })), undefined)
  assert.equal(findDoor('/app', door({ url: 'https://127.0.0.1:3000', secret: 's' })), undefined)
  assert.equal(findDoor('/app', door({ url: 'http://127.0.0.1:3000' })), undefined)
  assert.equal(findDoor('/app', door({ url: 'http://127.0.0.1:3000', secret: '' })), undefined)
  assert.equal(
    findDoor('/app', () => 'not json'),
    undefined,
  )
  assert.equal(
    findDoor('/app', () => {
      throw new Error('ENOENT')
    }),
    undefined,
  )
})

/** A door that sends the given events down one stream, collects what the shell POSTs, and ends the stream. */
function fakeDoor() {
  const posts: { secret: string; body: Record<string, unknown> }[] = []
  const gets: string[] = []
  const streams: ((event: string, data: string) => void)[] = []
  const closers: (() => void)[] = []
  const encoder = new TextEncoder()
  const fetchDoor: typeof fetch = async (input, init) => {
    const url = String(input)
    const headers = (init?.headers ?? {}) as Record<string, string>
    const secret = String(headers.authorization).replace('Bearer ', '')
    if (url.endsWith('/shell/events')) {
      gets.push(secret)
      let controller!: ReadableStreamDefaultController<Uint8Array>
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c
        },
      })
      streams.push((event, data) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`)),
      )
      closers.push(() => controller.close())
      return new Response(body, { status: 200 })
    }
    posts.push({ secret, body: JSON.parse(String(init?.body)) as Record<string, unknown> })
    return new Response('{"ok":true}')
  }
  return { fetchDoor, posts, gets, streams, closers }
}

const until = async (check: () => boolean): Promise<void> => {
  for (let at = 0; at < 300 && !check(); at += 1)
    await new Promise((resolve) => setTimeout(resolve, 10))
  assert.ok(check(), 'timed out')
}

test('the shell answers a call of the door, or refuses it with a code, and follows the door when the server restarts', async () => {
  const { desktop } = fakeDesktop()
  const door = fakeDoor()
  let secret = 'first'
  const stop = startDoorShell('/app', {
    desktop,
    fetch: door.fetchDoor,
    read: () => JSON.stringify({ url: 'http://127.0.0.1:3000', secret }),
    retryMs: 10,
    maxDelayMs: 20,
  })
  try {
    await until(() => door.streams.length === 1)
    door.streams[0]?.('ready', '')
    door.streams[0]?.('ping', '')
    door.streams[0]?.('call', JSON.stringify({ t: 'call', id: 4, request: { op: 'window-list' } }))
    door.streams[0]?.(
      'call',
      JSON.stringify({ t: 'call', id: 5, request: { op: 'window-close', id: 1 } }),
    )
    await until(() => door.posts.length === 2)
    assert.deepEqual(door.posts[0], {
      secret: 'first',
      body: {
        t: 'result',
        id: 4,
        value: {
          windows: [
            {
              id: 1,
              title: 'demo 1',
              path: '/',
              focused: true,
              width: 1000,
              height: 700,
              x: 100,
              y: 80,
            },
          ],
        },
      },
    })
    assert.equal(door.posts[1]?.body.t, 'error')
    assert.equal(door.posts[1]?.body.id, 5)
    assert.equal(door.posts[1]?.body.code, 'last-window')
    // The server restarted: its stream ends, and a new run has a new secret.
    secret = 'second'
    door.closers[0]?.()
    await until(() => door.streams.length === 2)
    assert.deepEqual(door.gets, ['first', 'second'])
    door.streams[1]?.('call', JSON.stringify({ t: 'call', id: 1, request: { op: 'menu-list' } }))
    await until(() => door.posts.length === 3)
    assert.equal(door.posts[2]?.secret, 'second')
  } finally {
    stop()
  }
})

test('with no door file the shell keeps looking and connects when one appears; stopping ends it', async () => {
  const { desktop } = fakeDesktop()
  const door = fakeDoor()
  let present = false
  const stop = startDoorShell('/app', {
    desktop,
    fetch: door.fetchDoor,
    read: () => {
      if (!present) throw new Error('ENOENT')
      return JSON.stringify({ url: 'http://127.0.0.1:3000', secret: 's' })
    },
    retryMs: 10,
    maxDelayMs: 20,
  })
  await new Promise((resolve) => setTimeout(resolve, 60))
  assert.equal(door.streams.length, 0)
  present = true
  await until(() => door.streams.length === 1)
  stop()
  door.closers[0]?.()
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.equal(door.streams.length, 1)
})

test('Quit, and Close Window on the last window, are pressed only with force; Close Window with two windows is an ordinary item', () => {
  const { desktop, log } = fakeDesktop()
  assert.throws(
    () => handleShellCall({ op: 'menu-click', path: 'File>Quit' }, desktop),
    refused('quits-app'),
  )
  assert.throws(
    () => handleShellCall({ op: 'menu-click', path: 'File>Close Window' }, desktop),
    refused('quits-app'),
  )
  assert.deepEqual(log, [])
  handleShellCall({ op: 'window-open' }, desktop)
  const listed = handleShellCall({ op: 'menu-list' }, desktop)
  assert.ok('items' in listed)
  assert.equal(listed.items.find((entry) => entry.path === 'File>Close Window')?.ends, undefined)
  assert.equal(listed.items.find((entry) => entry.path === 'File>Quit')?.ends, true)
  handleShellCall({ op: 'menu-click', path: 'File>Close Window' }, desktop)
  handleShellCall({ op: 'menu-click', path: 'File>Quit', force: true }, desktop)
  assert.deepEqual(log, ['click Close Window', 'click Quit'])
})
