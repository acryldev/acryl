/**
 * The file primitives ACRYL's own code writes state with, through the engine seam: an atomic replace (a reader sees the old or the new complete content,
 * with the stated permission bits) and a cross-process writer lock (a stale holder is taken over). Today they are DeepSeek Harness's; consumers import
 * them from `acryl-harness-runtime`, never from the DSH package, so replacing the implementation is a change to this file and nothing else.
 *
 * @module acryl-harness-runtime/engine-files
 */

export { withFileLock, writeFileAtomic, type FileLockOptions, type WriteFileAtomicOptions } from '@deepseek-ai/dsh-atomic-write'
