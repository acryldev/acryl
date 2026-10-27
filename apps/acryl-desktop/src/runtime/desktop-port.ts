/** Shared Desktop Web port policy. */

/** Fixed starting port used when the user has not configured a port. */
export const DESKTOP_DEFAULT_WEB_PORT = 43_120

/** Maximum number of sequential ports tried after a real bind collision. */
export const DESKTOP_WEB_PORT_RETRY_LIMIT = 32


function isAddressInUse(cause: unknown): boolean {
  return (cause as NodeJS.ErrnoException | null)?.code === 'EADDRINUSE'
}

/**
 * Bind on `requestedPort`, moving one port on only when the bind reports the address in use, at most
 * {@link DESKTOP_WEB_PORT_RETRY_LIMIT} times and never past 65535. Any other failure is thrown at once. `bind` tries one port and
 * cleans up after itself when it fails.
 * @returns the port that was bound.
 */
export async function bindDesktopPort(requestedPort: number, bind: (port: number) => Promise<void>): Promise<number> {
  for (let attempt = 0; ; attempt += 1) {
    const port = requestedPort + attempt
    try {
      await bind(port)
      return port
    } catch (cause) {
      if (!isAddressInUse(cause) || attempt >= DESKTOP_WEB_PORT_RETRY_LIMIT || port + 1 > 65_535) throw cause
    }
  }
}
