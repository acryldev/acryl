import type { Context } from '../../context.ts'
import type { GetConnInfo } from '../../helper/conninfo/index.ts'
import type { CloudFrontEdgeEvent } from './handler.ts'

type Env = {
  Bindings: {
    event: CloudFrontEdgeEvent
  }
}

export const getConnInfo: GetConnInfo = (c: Context<Env>) => ({
  remote: {
    address: c.env.event.Records[0].cf.request.clientIp,
  },
})
