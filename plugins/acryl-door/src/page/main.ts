/** The page's script: starts the door once on this document, even if the script tag appears twice. */

import { startDoor } from './index.ts'

const flag = '__acrylDoor'
const host = globalThis as { [flag]?: () => void }
if (host[flag] === undefined) host[flag] = startDoor(document)
