// D3: sherpa-onnx-node runs real onnxruntime inference (Silero VAD) on real speech, not just loading its binding.
// Run: node|deno run -A [--node-modules-dir=manual] sherpa-vad.mjs <silero_vad.onnx> <speech.wav 16 kHz mono 16-bit PCM> [payload-or-repo-dir]
// Model: the SenseVoice plugin's pinned asset (runtime/assets.json), sha256 a35ebf52...f5af28, 1.8 MB. Writes nothing.
import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const rt = typeof Deno !== 'undefined' ? `deno ${Deno.version.deno}` : `node ${process.versions.node}`
const [model, wav, base] = process.argv.slice(2)
if (!model || !wav) { console.error('usage: sherpa-vad.mjs <silero_vad.onnx> <speech.wav> [dir]'); process.exit(2) }
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const pnpm = resolve(repo, 'node_modules/.pnpm')
const sherpaDir = base ? resolve(base, 'node_modules/sherpa-onnx-node') : resolve(pnpm, readdirSync(pnpm).find(d => d.startsWith('sherpa-onnx-node@')), 'node_modules/sherpa-onnx-node')
const sherpa = createRequire(import.meta.url)(sherpaDir)

const buf = readFileSync(wav)
const dataAt = buf.indexOf('data') + 8 // canonical 44-byte header after afconvert; 'data' chunk size at +4
const pcm = new Int16Array(buf.buffer.slice(buf.byteOffset + dataAt, buf.byteOffset + buf.length - ((buf.length - dataAt) % 2)))
const samples = Float32Array.from(pcm, v => v / 32768)

const vad = new sherpa.Vad({ sileroVad: { model, threshold: 0.5, minSilenceDuration: 0.25, minSpeechDuration: 0.25, windowSize: 512 }, sampleRate: 16000, numThreads: 1, debug: false }, 30)
const segments = []
let detectedAny = false
for (let i = 0; i + 512 <= samples.length; i += 512) {
  vad.acceptWaveform(samples.subarray(i, i + 512))
  detectedAny ||= vad.isDetected()
  while (!vad.isEmpty()) { const s = vad.front(false); segments.push({ startS: +(s.start / 16000).toFixed(2), durS: +(s.samples.length / 16000).toFixed(2) }); vad.pop() }
}
vad.flush()
while (!vad.isEmpty()) { const s = vad.front(false); segments.push({ startS: +(s.start / 16000).toFixed(2), durS: +(s.samples.length / 16000).toFixed(2) }); vad.pop() }
const audioS = (samples.length / 16000).toFixed(2)
console.log(`${rt.padEnd(14)} | audio ${audioS}s | speechDetected=${detectedAny} | segments=${JSON.stringify(segments)}`)
process.exit(segments.length > 0 ? 0 : 1)
