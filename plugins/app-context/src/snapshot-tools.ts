/**
 * The snapshot verbs as the agent's tools (ACRYL's `blend-capture` and `blend-apply`, here the app's own `npm run snapshot`), on the frame's
 * `appSnapshot` service: the same code and queue as the left panel's Capture. Present only while the frame provides the service. Pushing and
 * pulling versions stay the person's (the left panel's Push and Pull): sending work under their name is never the agent's call.
 */
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'

export const SNAPSHOT_CAPTURE_TOOL = 'acryl_snapshot_capture'
export const SNAPSHOT_VERIFY_TOOL = 'acryl_snapshot_verify'
export const SNAPSHOT_APPLY_TOOL = 'acryl_snapshot_apply'

/** The parts of the frame's `appSnapshot` service the tools call (acryl-blends-frame `src/app-snapshot.ts`). */
export interface AppSnapshotTools {
  capture(): Promise<{ readonly addedRows: readonly string[]; readonly modules: number }>
  verify(dir?: string): Promise<{ readonly ok: boolean; readonly problems: readonly string[]; readonly checked: number }>
  apply(dir: string): Promise<{
    readonly ok: boolean
    readonly problems: readonly string[]
    readonly modules: ReadonlyArray<{ readonly name: string; readonly status: string; readonly detail?: string }>
    readonly manifestChanged: boolean
    readonly extra: readonly string[]
  }>
}

const text = { schema: { type: 'string' as const }, render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }] }

export function snapshotTools(snapshot: AppSnapshotTools): ToolDefinition[] {
  return [
    defineTool({
      name: SNAPSHOT_CAPTURE_TOOL,
      description:
        "Record the app as it runs: every plugin folder of the app's own that has no row in blend.yaml gets one (the comments stay), then blend.lock.json is written. Use it after you add a plugin folder, before the person saves a version or shares the app.",
      parameters: {},
      output: text,
      async execute() {
        return JSON.stringify(await snapshot.capture())
      },
    }),
    defineTool({
      name: SNAPSHOT_VERIFY_TOOL,
      description:
        'Check the app (or another snapshot folder) against its blend.lock.json, offline: names blend.yaml or each plugin folder that changed since the last capture.',
      parameters: {
        folder: { type: 'string', description: 'A snapshot folder, relative to the app; the app itself when left out.' },
      },
      output: text,
      async execute(args) {
        const folder = typeof args.folder === 'string' && args.folder !== '' ? args.folder : undefined
        return JSON.stringify(await snapshot.verify(folder))
      },
    }),
    defineTool({
      name: SNAPSHOT_APPLY_TOOL,
      description:
        "Bring another snapshot of the app (a folder with blend.yaml, plugins/ and blend.lock.json) into this one: its rows and the plugin folders this app lacks. Changes the app's composition, so call it only after the person said yes to this folder. Writes nothing when a plugin folder here differs from the snapshot's; the app's own folders the snapshot lacks stay, switched off.",
      parameters: {
        folder: { type: 'string', required: true, description: 'The snapshot folder, relative to the app or absolute.' },
      },
      output: text,
      async execute(args) {
        const folder = String(args.folder ?? '')
        if (folder === '') throw new Error('name the snapshot folder to apply')
        return JSON.stringify(await snapshot.apply(folder))
      },
    }),
  ]
}
