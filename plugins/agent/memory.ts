import type { Context } from '@deepseek-ai/cordis'

/** Long-term memory for the agent. */
export interface Memory {
  remember(text: string): void
  recall(): string[]
  size(): number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    memory: Memory
  }
}

/** In-process memory. Replace it with a plugin backed by storage when you need persistence. */
export function memory(ctx: Context) {
  const items: string[] = []
  ctx.provide('memory', {
    remember: (text) => void items.push(text),
    recall: () => [...items],
    size: () => items.length,
  } satisfies Memory)
}
