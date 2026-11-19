/**
 * The one verb list (spec 049 slice 13). Every face of the door reads it: the operator client (`acryl <verb>`, its `verbs` and `brief`),
 * MCP (`tools/list`) and the built-in chat (the `tools` registry). A verb added here is in all three, or the comparison test fails.
 */

import { MAX_SNAPSHOT_NODES, MAX_WAIT_MS } from '../page/protocol.ts'

/** Every verb, in the order `brief` lists them. */
/** The verbs that only use the page: what a page-only door (a production assistant) offers. */
export const PAGE_VERBS = ['look', 'act'] as const satisfies readonly Verb[]

export const VERBS = ['brief', 'look', 'act', 'plugin-list', 'plugin-add', 'plugin-pull', 'plugin-publish', 'plugin-remove', 'plugin-reload', 'tool-list', 'tool-call', 'window-list', 'window-open', 'window-focus', 'window-close', 'window-resize', 'menu-list', 'menu-click'] as const
export type Verb = (typeof VERBS)[number]

/** The JSON Schema of a verb's arguments, as MCP lists it. */
export interface ArgumentsSchema {
  readonly type: 'object'
  readonly properties: Readonly<Record<string, unknown>>
  readonly required?: readonly string[]
  readonly additionalProperties: boolean
}

export interface VerbSpec {
  /** The operator client's form, as `brief` prints it. */
  readonly usage: string
  /** What the verb does, for a model choosing a tool. */
  readonly description: string
  readonly arguments: ArgumentsSchema
}

const none: ArgumentsSchema = { type: 'object', properties: {}, additionalProperties: false }
const ref = { type: 'string', description: 'a ref from the latest look, e.g. 3.12' }

export const VERB_SPECS: Readonly<Record<Verb, VerbSpec>> = {
  'brief': {
    usage: 'brief: this summary',
    description: 'What this app is, which files to read first, whether its page is open, and the verbs.',
    arguments: none,
  },
  'look': {
    usage: 'look [--window <n>] [--cursor <n>] [--max-nodes <n>]: the page as text, with refs',
    description: 'The open page as text: its roles, names, values and visible text, each with a ref to act on. A long page comes in parts (cursor).',
    arguments: {
      type: 'object',
      properties: {
        cursor: { type: 'integer', minimum: 0, description: 'where the previous part ended' },
        maxNodes: { type: 'integer', minimum: 1, maximum: MAX_SNAPSHOT_NODES },
        window: { type: 'integer', minimum: 1, description: 'a desktop window (the id window-list prints); default: the page used last' },
      },
      additionalProperties: false,
    },
  },
  'act': {
    usage: 'act click|type|select|press|scroll|wait|reload|navigate ...: do one thing on the page (refs from the latest look)',
    description: 'Do one thing on the page: click, type, select, press a key, scroll, wait for text or a control, reload the page, or navigate to another path of the app. Look again before the next act.',
    arguments: {
      type: 'object',
      properties: {
        op: { type: 'string', enum: ['click', 'type', 'select', 'press', 'scroll', 'wait', 'reload', 'navigate'] },
        path: { type: 'string', description: 'navigate: a path of this app, e.g. /demo (the page must load the door script to be controlled afterwards)' },
        ref,
        text: { type: 'string', description: 'type: what to type; wait: the text to wait for' },
        submit: { type: 'boolean', description: 'type: press Enter after' },
        clear: { type: 'boolean', description: 'type: false keeps what the field holds' },
        option: { type: 'string', description: 'select: the option to choose' },
        key: { type: 'string', description: 'press: a character or Enter, Escape, Tab, ArrowDown, ...' },
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
        amount: { type: 'number', minimum: 1, maximum: 10_000, description: 'scroll: pixels' },
        role: { type: 'string', description: 'wait: the role to wait for' },
        name: { type: 'string', description: 'wait: its name' },
        gone: { type: 'boolean', description: 'wait: until it is gone instead' },
        timeoutMs: { type: 'integer', minimum: 0, maximum: MAX_WAIT_MS },
        window: { type: 'integer', minimum: 1, description: 'a desktop window (the id window-list prints); default: the page used last' },
      },
      required: ['op'],
      additionalProperties: false,
    },
  },
  'plugin-list': {
    usage: 'plugin list: the plugins installed while the app runs',
    description: 'The plugins installed into the running app.',
    arguments: none,
  },
  'plugin-add': {
    usage: 'plugin add <folder>: check, install and start a plugin folder, live',
    description: 'Check, install and start a plugin folder inside the app, without a restart.',
    arguments: { type: 'object', properties: { folder: { type: 'string', description: 'a folder inside the app, e.g. plugins/pomodoro' } }, required: ['folder'], additionalProperties: false },
  },
  'plugin-pull': {
    usage: 'plugin pull <source> | --from <list>: fetch a plugin someone released (github:<owner>/<repo>[@<version>][@sha256:<digest>], or a .tgz), or every plugin of a group\'s list, check each and start it, live',
    description: 'Fetch a plugin someone released, without running anything; check its digest, that it works on every OS and that this app has the services it needs; then install and start it without a restart. A refusal says why and changes nothing. With from instead of source, pull every source of a group\'s list (one per line, # comments); each is pulled on its own, so a refused one is named with its reason and the others still come in.',
    arguments: { type: 'object', properties: { source: { type: 'string', description: 'github:<owner>/<repo>[@<version>][@sha256:<digest>], or a .tgz path or https address' }, from: { type: 'string', description: 'instead of source: a list of sources, a file in the app (e.g. group.txt) or an https address' } }, additionalProperties: false },
  },
  'plugin-publish': {
    usage: 'plugin publish <name> [--owner <account>] [--license <id>]: show what publishing this plugin would send; in a person\'s own terminal, ask them',
    description: 'Show what publishing a plugin would send: the account, repository, version, license, files and the line a friend pulls it with. Sends nothing. Only a person can say yes, in their own terminal or with Share in the frame; tell them the plan and how.',
    arguments: { type: 'object', properties: { name: { type: 'string', description: 'a plugin of plugins/' }, owner: { type: 'string', description: 'the GitHub account or organization; the signed-in one when absent' }, license: { type: 'string', description: 'an SPDX license id; MIT when absent' } }, required: ['name'], additionalProperties: false },
  },
  'plugin-remove': {
    usage: 'plugin remove <name>: stop and remove an installed plugin',
    description: 'Stop and remove an installed plugin.',
    arguments: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false },
  },
  'plugin-reload': {
    usage: 'plugin reload: bring every installed plugin in line with its folder',
    description: 'Bring every installed plugin in line with its folder (after editing one).',
    arguments: none,
  },
  'tool-list': {
    usage: 'tool list: the app tools the door offers',
    description: 'The app\'s own tools that the door offers.',
    arguments: none,
  },
  'tool-call': {
    usage: 'tool call --tool <name> [--args <json>]: run one of them',
    description: 'Run one of the app tools that tool-list names.',
    arguments: { type: 'object', properties: { tool: { type: 'string' }, args: { description: 'the tool\'s input' } }, required: ['tool'], additionalProperties: false },
  },
  'window-list': {
    usage: 'window list: the windows of the desktop app',
    description: 'The windows of the desktop app: id, title, path, size, and which one is focused. Needs the desktop app (npm run desktop).',
    arguments: none,
  },
  'window-open': {
    usage: 'window open [--path <path of the app>]: open a new window',
    description: 'Open a new window of the desktop app on a path of the app (default: its start page). Answers with the new window\'s id; look and act take it as window.',
    arguments: { type: 'object', properties: { path: { type: 'string', description: 'a path of this app, e.g. /settings' } }, additionalProperties: false },
  },
  'window-focus': {
    usage: 'window focus --id <n>: bring a window to the front',
    description: 'Bring a window of the desktop app to the front. Look and act without a window then drive it.',
    arguments: { type: 'object', properties: { id: { type: 'integer', minimum: 1, description: 'the id window-list prints' } }, required: ['id'], additionalProperties: false },
  },
  'window-close': {
    usage: 'window close --id <n> [--force]: close a window',
    description: 'Close a window of the desktop app. The last window cannot be closed without force, because that ends the desktop app.',
    arguments: { type: 'object', properties: { id: { type: 'integer', minimum: 1 }, force: { type: 'boolean', description: 'allow closing the last window, which ends the desktop app' } }, required: ['id'], additionalProperties: false },
  },
  'window-resize': {
    usage: 'window resize --id <n> --width <px> --height <px>',
    description: 'Resize a window of the desktop app.',
    arguments: { type: 'object', properties: { id: { type: 'integer', minimum: 1 }, width: { type: 'integer', minimum: 200, maximum: 10_000 }, height: { type: 'integer', minimum: 200, maximum: 10_000 } }, required: ['id', 'width', 'height'], additionalProperties: false },
  },
  'menu-list': {
    usage: 'menu list: the application menu',
    description: 'The desktop app\'s application menu as paths such as File>New Note, with the disabled items marked.',
    arguments: none,
  },
  'menu-click': {
    usage: 'menu click --path "File>New Note" [--force]: press a menu item',
    description: 'Press an item of the desktop app\'s application menu by its path (labels joined with >, as menu-list prints them). A disabled item is refused, and so is one that ends the app (Quit, Close Window on the last window) unless force is set.',
    arguments: { type: 'object', properties: { path: { type: 'string', description: 'e.g. File>New Note' }, force: { type: 'boolean', description: 'allow an item that ends the desktop app' } }, required: ['path'], additionalProperties: false },
  },
}

/** A verb's name in the `tools` registry the built-in chat reads: prefixed, so it never meets an app tool's name. */
export const chatToolName = (verb: Verb): string => `door_${verb.replaceAll('-', '_')}`

/** True for a name the door itself registers in the `tools` registry. */
export const isDoorToolName = (name: string): boolean => VERBS.some(verb => chatToolName(verb) === name)
