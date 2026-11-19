/**
 * The seam the DSH host introduced: DSH's own index.html is not a framework route, so the door's page script reaches it through the web server's index-inject
 * hook (`tapIndex`). The tap is owned by the door's fiber: loading adds it once, unloading removes it, and with it the old activation's routes and secret (the
 * door file is gone and the operator face refuses what the old secret could read).
 */
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DOOR_PREFIX, doorFilePath } from '../../src/index.ts'
import { appFolder, operator, startApp } from '../harness.ts'

describe('the door page in DSH\'s index', () => {
  it('adds one script tag through the index-inject hook, leaves a page that already carries it alone, and removes the tap on unload', async () => {
    const root = appFolder()
    const running = await startApp({ root })
    try {
      expect(running.indexTaps).toHaveLength(1)
      const html = running.indexTaps[0]!('<!doctype html><html><body><main>app</main></body></html>')
      expect(html).toContain(`<script type="module" src="${DOOR_PREFIX}/page.js"></script></body>`)
      expect(running.indexTaps[0]!(html)).toBe(html)
      await running.doorFiber.dispose()
      expect(running.indexTaps).toHaveLength(0)
      expect(existsSync(doorFilePath(root))).toBe(false)
      // The old activation's operator face is gone with its routes and its file: the CLI can no longer reach it.
      const after = await operator(root, ['tool', 'list'])
      expect(after.code).not.toBe(0)
    } finally {
      await running.close()
    }
  })

  it('leaves the host index alone when the host says its index is a frame around the app (hostIndex: false)', async () => {
    const running = await startApp({ config: { hostIndex: false } })
    try {
      // The Blends frame's index is not the app: only the app's own pages carry the script, so an agent drives the page in the canvas, not the frame.
      expect(running.indexTaps).toHaveLength(0)
    } finally {
      await running.close()
    }
  })
})
