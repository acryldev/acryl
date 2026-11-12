// Read one secret line from the terminal without echoing it (a key pasted at a prompt). With no terminal (a pipe) the whole of stdin is the secret,
// so a script can run `printf %s "$KEY" | acryl model set deepseek`. The key is never an argument: arguments show in `ps` and shell history.
import { stderr, stdin } from 'node:process'

export function readSecret(prompt, { input = stdin, output = stderr } = {}) {
  if (!input.isTTY) {
    return new Promise((resolve, reject) => {
      let text = ''
      input.setEncoding('utf8')
      input.on('data', chunk => { text += chunk })
      input.once('end', () => resolve(text))
      input.once('error', reject)
    })
  }
  return new Promise((resolve, reject) => {
    output.write(prompt)
    let text = ''
    const finish = (error) => {
      input.off('data', onData)
      input.setRawMode(false)
      input.pause()
      output.write('\n')
      if (error) reject(error)
      else resolve(text)
    }
    const onData = chunk => {
      for (const char of String(chunk)) {
        if (char === '\r' || char === '\n') return finish()
        if (char === '\x03') return finish(new Error('cancelled'))
        if (char === '\x7f' || char === '\b') text = text.slice(0, -1)
        else if (char >= ' ') text += char   // a paste arrives as one chunk: every printable character counts
      }
    }
    input.setRawMode(true)
    input.setEncoding('utf8')
    input.resume()
    input.on('data', onData)
  })
}
