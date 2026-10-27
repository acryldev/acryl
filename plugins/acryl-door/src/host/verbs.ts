/**
 * The one verb list (spec 049 slice 13). Every face of the door reads it: the operator client (`acryl <verb>`, its `verbs` and `brief`),
 * MCP (`tools/list`) and the built-in chat (the `tools` registry). A verb added here is in all three, or the comparison test fails.
 */

import { MAX_SNAPSHOT_NODES, MAX_WAIT_MS } from '../page/protocol.ts'

/** Every verb, in the order `brief` lists them. */
export const VERBS = ['brief', 'look', 'act', 'plugin-list', 'plugin-add', 'plugin-remove', 'plugin-reload', 'tool-list', 'tool-call'] as const
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
    usage: 'look [--cursor <n>] [--max-nodes <n>]: the page as text, with refs',
    description: 'The open page as text: its roles, names, values and visible text, each with a ref to act on. A long page comes in parts (cursor).',
    arguments: {
      type: 'object',
      properties: {
        cursor: { type: 'integer', minimum: 0, description: 'where the previous part ended' },
        maxNodes: { type: 'integer', minimum: 1, maximum: MAX_SNAPSHOT_NODES },
      },
      additionalProperties: false,
    },
  },
  'act': {
    usage: 'act click|type|select|press|scroll|wait ...: do one thing on the page (refs from the latest look)',
    description: 'Do one thing on the page: click, type, select, press a key, scroll, or wait for text or a control. Look again before the next act.',
    arguments: {
      type: 'object',
      properties: {
        op: { type: 'string', enum: ['click', 'type', 'select', 'press', 'scroll', 'wait'] },
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
}

/** A verb's name in the `tools` registry the built-in chat reads: prefixed, so it never meets an app tool's name. */
export const chatToolName = (verb: Verb): string => `door_${verb.replaceAll('-', '_')}`

/** True for a name the door itself registers in the `tools` registry. */
export const isDoorToolName = (name: string): boolean => VERBS.some(verb => chatToolName(verb) === name)
