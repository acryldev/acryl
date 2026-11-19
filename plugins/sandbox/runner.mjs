// Runs inside the sandbox child process, started with `node --permission`. Reads { input } as JSON from stdin, calls the tool's exported
// `run(input)`, and prints the result after a marker, so anything the tool itself prints cannot be mistaken for the result.
const MARK = '\n@@acrylblends-result@@'
const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const { input } = JSON.parse(Buffer.concat(chunks).toString('utf8'))
let result
try {
  const tool = await import(process.argv[2])
  if (typeof tool.run !== 'function')
    throw Object.assign(new Error('the tool must export a function named run'), {
      code: 'E_NO_RUN',
    })
  result = { ok: true, output: (await tool.run(input)) ?? null }
} catch (error) {
  result = { ok: false, error: String(error?.message ?? error), code: String(error?.code ?? '') }
}
process.stdout.write(`${MARK}${JSON.stringify(result)}\n`)
