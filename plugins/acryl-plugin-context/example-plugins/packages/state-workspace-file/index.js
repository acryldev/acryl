// Example: state.workspace-file
// Type:     tool
// Surfaces: tui web desktop
// Teaches:  PERSIST STATE IN THE PROJECT as a plain file. Notes live in `<workspace>/.acryl/notes.md`, so they are per project, readable by the
//           agent (with its normal file tools) and by the user, and can be committed to git. The workspace is the session's own directory:
//           `exec.agent.session.header.cwd`. Works on every surface (no browser needed). Compare: host-side state (state.host-store) is
//           per ACRYL home and invisible to the project; localStorage is per browser and invisible to the agent.
// Expect:   ACTIVE; the model can call `notes_add` and `notes_list`; the file appears in the session's workspace.
// Docs:     extending.state-and-persistence
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'acryl-example-state-workspace'
export const inject = ['tools']

const MAX_TEXT = 2000

/** The notes file of the session's workspace; refuses to guess a directory when the session has none. */
function notesFile(exec) {
  const cwd = exec?.agent?.session?.header?.cwd
  if (typeof cwd !== 'string' || !isAbsolute(cwd)) throw new Error('this session has no workspace directory, so there is nowhere to keep project notes')
  return { dir: join(cwd, '.acryl'), file: join(cwd, '.acryl', 'notes.md') }
}

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'notes_add',
    description: 'Append one note to the project notes file (.acryl/notes.md in the workspace).',
    parameters: { text: { type: 'string', required: true, description: 'The note, one or a few lines' } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      const text = String(args.text).trim()
      if (text === '') throw new Error('text is required')
      if (text.length > MAX_TEXT) throw new Error(`text is too long (max ${MAX_TEXT})`)
      const { dir, file } = notesFile(exec)
      mkdirSync(dir, { recursive: true })
      appendFileSync(file, `- ${new Date().toISOString()} ${text.replace(/\n+/gu, ' ')}\n`)   // append-only: concurrent sessions never rewrite each other
      return `Saved to ${file}`
    },
  }))
  ctx.tools.register(defineTool({
    name: 'notes_list',
    description: 'Read the project notes file (.acryl/notes.md in the workspace).',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(_args, exec) {
      const { file } = notesFile(exec)
      return existsSync(file) ? readFileSync(file, 'utf8') : '(no notes yet)'
    },
  }))
}
