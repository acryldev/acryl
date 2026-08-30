import type { Context } from '@deepseek-ai/cordis'

export const name = 'acryl-hello-world'

/** R&D proof that ACRYL capabilities load as ordinary Cordis plugins. */
export function apply(ctx: Context): void {
  ctx.logger.info('[acryl/hello-world] plugin loaded through Cordis')
}
