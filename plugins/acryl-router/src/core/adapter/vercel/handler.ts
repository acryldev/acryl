/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Acryl } from '../../app.ts'

export const handle =
  (app: Acryl<any, any, any>) =>
  (req: Request): Response | Promise<Response> => {
    return app.fetch(req)
  }
