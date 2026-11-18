/**
 * A real model for the agent: any OpenAI-compatible chat completions API (OpenAI, DeepSeek, Ollama, LM Studio, a local server), called
 * with `fetch`, no SDK. It provides the same `model` service as the scripted model, so the agent, its tools and the builder do not change.
 * Each step is stateless: the conversation is rebuilt from the run's question and tool-call trace.
 */

import { readFileSync, statSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import type { Model, ModelInput, Step } from '../agent/index.ts'
import { ASSISTANT_PROMPT, SYSTEM_PROMPT } from './prompt.ts'

export { ASSISTANT_PROMPT, SYSTEM_PROMPT }

export interface OpenAIConfig {
  /** For example https://api.openai.com/v1, https://api.deepseek.com/v1, http://127.0.0.1:11434/v1 (Ollama). */
  baseUrl: string
  model: string
  /** Sent as a bearer token. Local servers need none. Keep it out of files the app commits. */
  apiKey?: string
  /** Replaces the default system prompt (how to write a Cordis plugin that installs). */
  system?: string
  temperature?: number
  /** The most tokens one answer may use (`max_tokens`): what one step can cost at most. */
  maxTokens?: number
}

const statMode = (path: string): number => statSync(path).mode

/** The file in the app's home that holds the model when the environment names none: `{ "baseUrl", "model", "apiKey"? }`. Never committed (the home is ignored). */
export const MODEL_FILE = 'model.json'

/**
 * The model configuration kept in a file, or `undefined` when there is no file. The key in it is the owner's: the file must be readable by its owner only (0600), and one that
 * others can read is refused, as an SSH key would be.
 * @throws when the file is not a model configuration, or is readable by others.
 */
export function modelConfigFromFile(
  path: string,
  platform: NodeJS.Platform = process.platform,
): OpenAIConfig | undefined {
  let text: string
  let mode: number
  try {
    text = readFileSync(path, 'utf8')
    mode = statMode(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  const parsed = JSON.parse(text) as Partial<Record<'baseUrl' | 'model' | 'apiKey', unknown>>
  if (
    typeof parsed.baseUrl !== 'string' ||
    parsed.baseUrl.trim() === '' ||
    typeof parsed.model !== 'string' ||
    parsed.model.trim() === ''
  )
    throw new ModelError(`${path} needs "baseUrl" and "model" (and "apiKey" for a hosted API)`)
  const apiKey =
    typeof parsed.apiKey === 'string' && parsed.apiKey.trim() !== ''
      ? parsed.apiKey.trim()
      : undefined
  if (apiKey !== undefined && platform !== 'win32' && (mode & 0o077) !== 0)
    throw new ModelError(
      `${path} holds a key and others can read it: make it readable by its owner only (chmod 600)`,
    )
  return {
    baseUrl: parsed.baseUrl.trim(),
    model: parsed.model.trim(),
    ...(apiKey === undefined ? {} : { apiKey }),
  }
}

/** The model configuration from an environment-shaped object, or `undefined` when none is set. Pass it `process.env` in main.ts. */
export function modelConfigFrom(
  env: Readonly<Record<string, string | undefined>>,
): OpenAIConfig | undefined {
  const baseUrl = env.ACRYLBLENDS_MODEL_URL?.trim()
  const model = env.ACRYLBLENDS_MODEL?.trim()
  if (!baseUrl || !model) return undefined
  const apiKey = env.ACRYLBLENDS_MODEL_KEY?.trim()
  return { baseUrl, model, ...(apiKey ? { apiKey } : {}) }
}

interface ToolCallMessage {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

type Message =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'assistant'
      content: string | null
      tool_calls?: ToolCallMessage[]
      reasoning_content?: string
    }
  | { role: 'tool'; tool_call_id: string; content: string }

/** The chat messages for a step: system, the question, then each tool call and its result. */
export function messagesFor(input: ModelInput, system: string): Message[] {
  const messages: Message[] = [
    { role: 'system', content: system },
    { role: 'user', content: input.question },
  ]
  for (const [index, call] of (input.trace ?? []).entries()) {
    const id = `call_${index}`
    messages.push({
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id,
          type: 'function',
          function: { name: call.tool, arguments: JSON.stringify(call.input ?? {}) },
        },
      ],
      // A thinking model (DeepSeek) refuses the next request unless its reasoning for the call comes back with it.
      ...(call.reasoning !== undefined ? { reasoning_content: call.reasoning } : {}),
    })
    messages.push({
      role: 'tool',
      tool_call_id: id,
      // Text goes as text (a page look reads as lines, not one quoted string of \n escapes); anything else as JSON.
      content:
        call.error === undefined && typeof call.result === 'string'
          ? call.result
          : JSON.stringify(
              call.error === undefined ? (call.result ?? null) : { error: call.error },
            ),
    })
  }
  return messages
}

export class ModelError extends Error {
  override name = 'ModelError'
}

/** One step: ask the API, and turn its answer into a tool call or final text. */
export async function complete(
  config: OpenAIConfig,
  input: ModelInput,
  signal?: AbortSignal,
): Promise<Step> {
  const response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      temperature: config.temperature ?? 0,
      ...(config.maxTokens === undefined ? {} : { max_tokens: config.maxTokens }),
      messages: messagesFor(input, config.system ?? SYSTEM_PROMPT),
      tools: (input.tools ?? []).map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters ?? { type: 'object', additionalProperties: true },
        },
      })),
    }),
    ...(signal ? { signal } : {}),
  })
  if (!response.ok)
    throw new ModelError(
      `the model API answered ${response.status}: ${(await response.text()).slice(0, 300)}`,
    )
  const answer = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null
        reasoning_content?: string | null
        tool_calls?: ToolCallMessage[]
      }
    }>
  }
  const message = answer.choices?.[0]?.message
  if (!message) throw new ModelError('the model API answered without a message')
  const call = message.tool_calls?.[0]
  if (call) {
    let parsed: unknown
    try {
      parsed = call.function.arguments ? JSON.parse(call.function.arguments) : {}
    } catch {
      return {
        tool: call.function.name,
        input: { invalidArguments: call.function.arguments },
        ...(typeof message.reasoning_content === 'string'
          ? { reasoning: message.reasoning_content }
          : {}),
      }
    }
    return {
      tool: call.function.name,
      input: parsed,
      ...(typeof message.reasoning_content === 'string'
        ? { reasoning: message.reasoning_content }
        : {}),
    }
  }
  return { text: (message.content ?? '').trim() || '(no answer)' }
}

/** The plugin: provides `model`, in place of the scripted one. */
export const openai = {
  name: 'openai',
  apply(ctx: Context, config: OpenAIConfig) {
    if (!config?.baseUrl || !config.model)
      throw new ModelError('openai needs { baseUrl, model } (and apiKey for hosted APIs)')
    ctx.provide('model', {
      complete: (input) => complete(config, input, input.signal),
    } satisfies Model)
  },
}
