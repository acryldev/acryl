#!/usr/bin/env node
/**
 * Summarize one opt-in real-model run (runtime/acryl-harness-runtime/tests/e2e-real-model.spec.ts writes the log) into comparable metrics.
 *   node evals/summarize.mjs <log.jsonl>          prints JSON
 * Metrics come from session events only: prompts, steps, tool calls, reads of the pack's docs and examples, verify/install outcomes.
 */
import { readFileSync } from 'node:fs'

export function summarize(text) {
  const perPrompt = []
  let current
  for (const line of text.split('\n').filter(Boolean)) {
    const o = JSON.parse(line)
    if (o.prompt !== undefined) { current = { prompt: o.prompt.slice(0, 60), steps: 0, toolCalls: 0, docReads: 0, exampleReads: 0, verifyOk: 0, verifyFail: 0, installOk: 0, installFail: 0, toolErrors: 0 }; perPrompt.push(current); continue }
    if (!current) continue
    if (o.ev === 'step/start') current.steps += 1
    if (o.ev === 'tool/call') {
      current.toolCalls += 1
      const brief = o.brief ?? ''
      if (/acryl-extension-context\/docs\//u.test(brief) || /acryl-extension-context\\\/docs\\\//u.test(brief)) current.docReads += 1
      if (/acryl-extension-context\/example-plugins\//u.test(brief)) current.exampleReads += 1
    }
    if (o.ev === 'tool/result') {
      const brief = o.brief ?? ''
      const ok = /\\"ok\\":true/u.test(brief)
      const fail = /\\"ok\\":false/u.test(brief)
      if (/\\"target\\"/u.test(brief)) { if (ok) current.verifyOk += 1; else if (fail) current.verifyFail += 1 }
      if (/\\"package\\"/u.test(brief) || /\\"stage\\"/u.test(brief)) { if (ok) current.installOk += 1; else if (fail) current.installFail += 1 }
      if (/"isError":true/u.test(brief)) current.toolErrors += 1
    }
  }
  const total = key => perPrompt.reduce((sum, p) => sum + p[key], 0)
  return { prompts: perPrompt, totals: { steps: total('steps'), toolCalls: total('toolCalls'), docReads: total('docReads'), exampleReads: total('exampleReads'), verifyOk: total('verifyOk'), installOk: total('installOk'), installFail: total('installFail'), toolErrors: total('toolErrors') } }
}

if (process.argv[1]?.endsWith('summarize.mjs') && process.argv[2]) console.log(JSON.stringify(summarize(readFileSync(process.argv[2], 'utf8')), null, 2))
