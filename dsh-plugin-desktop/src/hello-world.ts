import type { Context } from '@deepseek-ai/cordis'

export const name = 'acr-hello-world'

/** R&D proof that ACR capabilities load as ordinary Cordis plugins. */
export function apply(ctx: Context): void {
  ctx.logger.info('[acr/hello-world] plugin loaded through Cordis')
}
