/** Words and JSON for `acryl doctor` and `acryl repair`. */

import type { RescueResult } from '../host/rescue-command.ts'

export interface RenderedRescue {
  readonly lines: readonly string[]
  readonly exitCode: number
}

export function renderRescue(result: RescueResult, json: boolean): RenderedRescue {
  if (json) {
    const failed = result.kind === 'diagnosis' || result.kind === 'plan' ? result.diagnosis.findings.some(f => f.severity === 'error') : result.kind === 'declined' || result.kind === 'refused'
    return { lines: [JSON.stringify(result, null, 2)], exitCode: failed ? 1 : 0 }
  }
  switch (result.kind) {
    case 'diagnosis':
    case 'plan': {
      const { diagnosis } = result
      const lines = [`Profile ${JSON.stringify(diagnosis.profileName)} at ${diagnosis.profileDir}`]
      if (diagnosis.findings.length === 0) lines.push('No problems found.')
      for (const finding of diagnosis.findings) {
        lines.push('', `${finding.severity.toUpperCase()} ${finding.code}${finding.entryId === undefined ? '' : ` (${finding.entryId})`}`, `  ${finding.message}`)
        if (finding.recipe !== undefined) lines.push(`  Fix: acryl repair --recipe ${finding.recipe}`)
        if (finding.guidance !== undefined) lines.push(`  ${finding.guidance}`)
      }
      if (result.kind === 'plan') lines.push('', result.plan.steps.length === 0 ? 'Nothing the safe repairs can fix.' : `Planned repairs (nothing has been changed):\n${result.text}`)
      return { lines, exitCode: diagnosis.findings.some(f => f.severity === 'error') ? 1 : 0 }
    }
    case 'repaired':
      return { lines: [`Repaired: ${result.result.applied.join(', ')}.`, `Backup: ${result.result.backupId}`, `Undo with: acryl repair --undo ${result.result.backupId}`], exitCode: 0 }
    case 'undone':
      return { lines: [`Restored ${String(result.files.length)} file(s) from backup ${result.backupId}.`], exitCode: 0 }
    case 'declined':
    case 'refused':
      return { lines: [result.reason], exitCode: 1 }
  }
}
