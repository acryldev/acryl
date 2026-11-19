/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Acryl } from '../../app.ts'

export const handle = (
  app: Acryl<any, any>
): ((req: Request, context: any) => Response | Promise<Response>) => {
  return (req: Request, context: any) => {
    return app.fetch(req, { context })
  }
}
