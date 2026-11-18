/** The add-command registration lines in src/app.ts: the upgrade keeps them as the framework's, and reports only the owner's other lines. */
import { describe, expect, it } from 'vitest'
import {
  ownerChangeLines,
  registrationEntry,
  registrationImport,
  stripRegistrations,
  withRegistrations,
} from '../src/app-registration.ts'
import { MOUNTED } from '../src/mount.ts'
import { KEPT_BY_THE_APP } from '../src/upgrade.ts'

const feedback = MOUNTED.find((plugin) => plugin.name === 'feedback')
if (feedback === undefined) throw new Error('the mounted feedback plugin is gone')
const driverPty = MOUNTED.find((plugin) => plugin.name === 'driver-pty')
if (driverPty === undefined) throw new Error('the mounted driver-pty plugin is gone')

const TEMPLATE = `import * as tasks from '../plugins/tasks/index.ts'
import * as panel from '../plugins/agent-panel/index.ts'
import { FRAME_MOUNT_PREFIX, routes } from './routes.ts'

/** The plugins this app's code provides. */
export const registry = {
  tasks,
  panel,
  model,
}
`

const withFeedback = (text: string): string =>
  text
    .replace(
      'import { FRAME_MOUNT_PREFIX',
      `${registrationImport(feedback)}\nimport { FRAME_MOUNT_PREFIX`,
    )
    .replace(
      'export const registry = {\n',
      `export const registry = {\n${registrationEntry(feedback)}\n`,
    )

describe('the framework registration lines', () => {
  it('strips to the template and re-applies to exactly the app the add command wrote', () => {
    const app = withFeedback(TEMPLATE)
    const stripped = stripRegistrations(app, undefined, TEMPLATE)
    expect(stripped.text).toBe(TEMPLATE)
    expect(stripped.edits.map((edit) => edit.line)).toEqual([
      registrationImport(feedback),
      registrationEntry(feedback),
    ])
    expect(withRegistrations(TEMPLATE, stripped.edits)).toBe(app)
  })

  it('keeps a template without registrations untouched and is idempotent on the app', () => {
    expect(stripRegistrations(TEMPLATE, undefined, TEMPLATE).edits).toEqual([])
    const app = withFeedback(TEMPLATE)
    const once = withRegistrations(TEMPLATE, stripRegistrations(app, undefined, TEMPLATE).edits)
    expect(withRegistrations(once, stripRegistrations(app, undefined, TEMPLATE).edits)).toBe(app)
  })

  it('handles more than one mounted plugin and Windows line endings', () => {
    const crlf = withFeedback(TEMPLATE).replaceAll('\n', '\r\n')
    // driver-pty is not part of the agent template, so its lines are the add command's.
    const twice = withRegistrations(crlf, [
      { plugin: driverPty, kind: 'import', line: registrationImport(driverPty) },
      { plugin: driverPty, kind: 'registry', line: registrationEntry(driverPty) },
    ])
    const stripped = stripRegistrations(twice, undefined, TEMPLATE)
    expect(stripped.text.replaceAll('\r\n', '\n')).toBe(TEMPLATE)
    expect(withRegistrations(crlf, stripped.edits)).toBe(twice)
  })

  it("names the owner's own lines, and only those", () => {
    const app = withFeedback(TEMPLATE)
    const owned = app.replace(
      '  model,\n',
      '  model,\n  // The owner keeps the board title short.\n',
    )
    const stripped = stripRegistrations(owned, undefined, TEMPLATE)
    expect(stripped.text).not.toBe(TEMPLATE)
    const target = withRegistrations(TEMPLATE, stripped.edits)
    expect(ownerChangeLines(owned, target)).toEqual([
      { line: 12, text: '  // The owner keeps the board title short.' },
    ])
    // The framework's lines are not reported.
    expect(ownerChangeLines(app, target)).toEqual([])
  })
})

describe('the app-owned scaffold files', () => {
  it('never writes over an edited src/routes.ts, and takes src/app.ts only through the registration merge', () => {
    expect(KEPT_BY_THE_APP.has('src/routes.ts')).toBe(true)
    expect(KEPT_BY_THE_APP.has('src/app.ts')).toBe(false)
  })
})
