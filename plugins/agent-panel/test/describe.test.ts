import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describePageStep, describeTool } from '../client/describe.ts'

test("a coding agent's command is shown as the command, its bookkeeping is not shown", () => {
  assert.equal(
    describeTool({
      tool: 'codex',
      info: "exec\n/bin/zsh -lc 'npm test' in /private/tmp/work/app\n",
    }),
    'codex: $ npm test',
  )
  assert.equal(
    describeTool({
      tool: 'codex',
      info: 'exec\n/bin/zsh -lc "./.acryl/bin/acryl act click --ref 7.15 --json" in /private/tmp/work/app\n',
    }),
    'codex: $ ./.acryl/bin/acryl act click --ref 7.15 --json',
  )
  for (const info of [
    'hook: PreToolUse\nhook: PreToolUse\n',
    'hook: PostToolUse Completed\n',
    'tokens used\n28,838\n',
    '',
    ' succeeded in 16ms:\n{"ok":true}\n',
  ])
    assert.equal(describeTool({ tool: 'codex', info }), undefined, JSON.stringify(info))
  assert.equal(
    describeTool({ tool: 'codex', info: ' exited 1 in 40ms:\nboom\n' }),
    'codex: exited 1 in 40ms',
  )
})

test("a coding agent's own sentence is shown, clipped", () => {
  assert.equal(
    describeTool({ tool: 'claude', info: 'Reading plugins/board/index.ts' }),
    'claude: Reading plugins/board/index.ts',
  )
  const long = describeTool({ tool: 'pi', info: 'x'.repeat(500) }) ?? ''
  assert.ok(long.length <= 'pi: '.length + 160, String(long.length))
  assert.ok(long.endsWith('…'))
})

test("the app's own agent: the tool and a short form of its arguments, and a failure with its reason", () => {
  assert.equal(describeTool({ tool: 'door_look', input: {}, result: 'Page: Demo' }), 'door_look')
  assert.equal(
    describeTool({ tool: 'door_act', input: { op: 'click', ref: '3.1' }, result: 'done' }),
    'door_act {"op":"click","ref":"3.1"}',
  )
  assert.equal(
    describeTool({ tool: 'door_act', input: {}, error: 'invalid: a call needs an op' }),
    'door_act failed: invalid: a call needs an op',
  )
})

test("the Assistant's steps say what it did on the page, named as the page names it, and leave out its looks", () => {
  const act = (input: Record<string, unknown>, result?: unknown) =>
    describePageStep({ tool: 'door_act', input, ...(result === undefined ? {} : { result }) })
  assert.equal(describePageStep({ tool: 'door_look', input: {}, result: 'Page: Board' }), undefined)
  assert.equal(
    describePageStep({ tool: 'door_look', input: {}, error: 'no page' }),
    'ui.look() failed',
  )
  assert.equal(
    act({ op: 'click', ref: '1.6' }, { ok: true, target: { role: 'link', name: 'My tasks' } }),
    'ui.open("My tasks")',
  )
  assert.equal(act({ op: 'navigate', path: '/my-tasks' }, { ok: true }), 'ui.open("/my-tasks")')
  assert.equal(
    act(
      { op: 'select', ref: '3.10', option: 'This week' },
      { ok: true, target: { role: 'combobox', name: 'Due' } },
    ),
    'ui.fill("Due", "This week")',
  )
  assert.equal(
    act(
      { op: 'type', ref: '4.2', text: 'Book the venue' },
      { ok: true, target: { role: 'textbox', name: 'Title' } },
    ),
    'ui.fill("Title", "Book the venue")',
  )
  assert.equal(
    act({ op: 'click', ref: '5.1' }, { ok: true, target: { role: 'button', name: 'Save' } }),
    'ui.click("Save")',
  )
  // No name from the page: the ref stands in; a failed act says so.
  assert.equal(
    describePageStep({ tool: 'door_act', input: { op: 'click', ref: '5.1' }, error: 'stale-ref' }),
    'ui.click(5.1) failed',
  )
  assert.equal(act({ op: 'press', key: 'Enter' }, { ok: true }), 'ui.press("Enter")')
  // The door's chat tool answers in text; the target is read from it.
  assert.equal(
    act(
      { op: 'select', ref: '1.11', option: 'This week' },
      'done: combobox "Due" (selected This week); look again before the next act',
    ),
    'ui.fill("Due", "This week")',
  )
  assert.equal(
    act({ op: 'click', ref: '1.6' }, 'done: link "My tasks"; look again before the next act'),
    'ui.open("My tasks")',
  )
})
