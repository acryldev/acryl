/** What the app needs from a language model: the conversation so far in, the answer out piece by piece. Aborting the signal must stop the work. */
export type Llm = (
  messages: { role: string; content: string }[],
  signal: AbortSignal,
) => AsyncIterable<string>

/** The model has no key: the one failure whose message the page may show, since it names the fix and holds no detail from the service. */
export class MissingKey extends Error {}

/**
 * An OpenAI-compatible chat completions API with `stream: true` (DeepSeek by default). The key is read from DEEPSEEK_API_KEY at the moment of the call and
 * is never stored; DEEPSEEK_BASE_URL and DEEPSEEK_MODEL choose the service.
 */
export const openAiCompatible: Llm = async function* (messages, signal) {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key)
    throw new MissingKey(
      'DEEPSEEK_API_KEY is not set: set it in the terminal that runs the app, then start the app again.',
    )
  const base = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, '')
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
      messages,
      stream: true,
    }),
    signal,
  })
  if (!response.ok || !response.body)
    throw new Error(`the model service answered ${response.status}`)
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') return
      const piece = (JSON.parse(data) as { choices?: { delta?: { content?: string } }[] })
        .choices?.[0]?.delta?.content
      if (piece) yield piece
    }
  }
}
