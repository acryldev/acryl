/**
 * The file primitives Desktop's own code writes state with (atomic replace, cross-process writer lock), through Desktop's seam. Kept separate from the
 * runtime's own `engine-files.ts` on purpose: the light `dsh` command-line entries share these modules and must not load the whole shared runtime to
 * write a file. Today the implementation is DeepSeek Harness's; replacing it is a change to this file and nothing else.
 *
 * @module acryl-desktop/engine-files
 */

export { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
