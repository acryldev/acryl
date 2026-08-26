/** Cordis Host plugin: Development Canvas PTY table and loopback routes. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { CanvasPtyRegistry } from './canvas-pty.ts'
import {
  CANVAS_PTY_CLOSE_PATH,
  CANVAS_PTY_INPUT_PATH,
  CANVAS_PTY_PATH,
  CANVAS_PTY_RESIZE_PATH,
} from './canvas-pty-contract.ts'
import {
  handleCanvasPtyCloseRequest,
  handleCanvasPtyInputRequest,
  handleCanvasPtyRequest,
  handleCanvasPtyResizeRequest,
} from './canvas-pty-route.ts'

/** Stable Cordis plugin name. */
export const name = 'development-canvas'

/** Loopback Web server required to publish canvas routes. */
export const inject = ['webServer']

/**
 * Activate Development Canvas as a neighboring Host plugin.
 * Disable the Loader row to unload routes and kill leftover PTY sessions.
 * @param ctx - Host context for this generation.
 */
export function apply(ctx: Context): void {
  if (ctx.webServer.host !== '127.0.0.1') {
    throw new Error('dsh-plugin-development-canvas: development canvas requires a loopback Web server')
  }
  const rendererOrigin = `http://127.0.0.1:${String(ctx.webServer.port)}`
  const reportHostError = (operation: string, cause: unknown): void => {
    ctx.logger.error(
      `dsh-plugin-development-canvas: failed to ${operation}: ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  }
  ctx.effect(() => {
    const canvasPty = new CanvasPtyRegistry()
    const releases: Array<() => void> = []
    try {
      const ptyRoutes = [
        [CANVAS_PTY_PATH, handleCanvasPtyRequest],
        [CANVAS_PTY_INPUT_PATH, handleCanvasPtyInputRequest],
        [CANVAS_PTY_RESIZE_PATH, handleCanvasPtyResizeRequest],
        [CANVAS_PTY_CLOSE_PATH, handleCanvasPtyCloseRequest],
      ] as const
      for (const [path, handler] of ptyRoutes) {
        releases.push(ctx.webServer.register({
          kind: 'exact',
          path,
          handler: (req, res) => handler(req, res, rendererOrigin, canvasPty, reportHostError),
        }))
      }
    } catch (cause) {
      for (const release of releases.reverse()) release()
      throw cause
    }
    return async () => {
      for (const release of releases.reverse()) release()
      await canvasPty.disposeAll()
    }
  }, 'development-canvas: routes and PTY table')
}
