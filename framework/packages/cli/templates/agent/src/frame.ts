/**
 * The app as the ACRYL frame hosts it (`npm run dev`): the generated layer mounts this row, which claims {@link FRAME_MOUNT_PREFIX} on the frame's web
 * server. The app's own rows (the generated `app-plugins` row, which calls `composeInto`) mount the app at that prefix, so its pages and its routes
 * answer at `/app`. Nothing here runs in production: `npm start` composes the app on its own server (no `routerHttp` service, so this row is not
 * mounted there), where the routes are at the root as they always were.
 */
import type { Context } from '@deepseek-ai/cordis'
import { FRAME_MOUNT_PREFIX } from './routes.ts'

export const name = 'app-routes'

/** The frame always has it: its layer carries the web adapter. */
export const inject = ['routerHttp']

export function apply(ctx: Context): void {
  ctx.routerHttp.mount(FRAME_MOUNT_PREFIX)
}
