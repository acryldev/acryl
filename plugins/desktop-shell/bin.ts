#!/usr/bin/env node
/** `acryl-desktop`, the app's `npm run desktop`: npm runs a script in the app's folder, so that folder is the app. */
import { launchDesktop } from './launch.ts'

launchDesktop(process.cwd(), process.argv.slice(2))
