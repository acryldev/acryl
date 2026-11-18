/**
 * `acrylblends/conninfo`: the connection-info types, as upstream, and ACRYL's reader for an app served by an ACRYL adapter
 * (`connectionOf`, and `getConnInfo` over it). An app served by `acrylblends/node-server` takes `getConnInfo` from there instead.
 */

export type * from '../../../plugins/acryl-router/src/core/helper/conninfo/index.ts'
export { connectionOf, getConnInfo, type ConnectionInfo, type RouterBindings, type RouterEnv } from '../../../plugins/acryl-router/src/connection.ts'
