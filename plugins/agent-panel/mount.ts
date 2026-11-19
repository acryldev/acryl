/**
 * A plugin's own route prefix under the app's mount. The app is served at the root of its own server `''`, or at the prefix a host serves it at (`/app` in
 * the ACRYL frame); a plugin that mounts routes of its own (the panel, the PTY driver) takes that mount as config and derives its prefix from it, so its
 * routes belong to the app wherever the app is served. The same rule `routerHttp.mount` applies.
 */
export function mountedPrefix(mount: string | undefined, path: string, plugin: string): string {
  if (mount === undefined || mount === '') return path
  if (!/^\/[A-Za-z0-9._~\-/]*[A-Za-z0-9._~-]$/u.test(mount))
    throw new TypeError(
      `${plugin}: the app's mount "${mount}" must be empty or an absolute path such as "/app"`,
    )
  return `${mount}${path}`
}

/**
 * The app's own mount, validated like {@link mountedPrefix}: empty at the root or the prefix a host serves the app at (`/app`). A plugin's routes are
 * mounted at this path and keep only their own fixed path inside, so the frame's router (which prefixes a mount with the app's base) composes
 * `/app` + `/api/agent-panel/panel.js` once, not twice.
 */
export function mountedBase(mount: string | undefined, plugin: string): string {
  if (mount === undefined || mount === '') return ''
  if (!/^\/[A-Za-z0-9._~\-/]*[A-Za-z0-9._~-]$/u.test(mount))
    throw new TypeError(
      `${plugin}: the app's mount "${mount}" must be empty or an absolute path such as "/app"`,
    )
  return mount
}
