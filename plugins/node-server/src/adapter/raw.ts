/**
 * Raw HTTP handlers, outside the router: a host that must serve another server's node `(req, res)` handlers (a DSH compatibility port, the
 * desktop shell's own endpoints) registers by path instead of building an `Acryl`. The adapter hands a matched request to the handler with the
 * real `IncomingMessage`/`ServerResponse` and writes nothing itself; `RAW_RESPONSE_HANDLED` is how the fetch callback tells it so.
 *
 * Upgrades work the same way at the socket level: a registered path is claimed before the router's WebSocket handling, and the adapter's
 * WebSocket setup leaves a request marked with `RAW_UPGRADE_HANDLED` alone.
 */
import type { IncomingMessage } from 'node:http'

/** Returned by a raw-aware fetch callback: the node response is already owned, do not write. */
export const RAW_RESPONSE_HANDLED: unique symbol = Symbol.for('acryl-node-server.raw-response')

/** Set on an upgrade request a raw handler took over; the adapter's WebSocket setup skips it. */
export const RAW_UPGRADE_HANDLED: unique symbol = Symbol.for('acryl-node-server.raw-upgrade')

/** An upgrade request a raw handler took over. */
export type RawUpgradeRequest = IncomingMessage & { [RAW_UPGRADE_HANDLED]?: true }
