/**
 * Presentation of `acryl plugin …` results (spec 034, FR-004).
 *
 * Rendering only: every value shown here came from the shared lifecycle
 * capability, so the CLI cannot describe a plugin state the Desktop panel
 * would disagree with. `--json` is the same projection in one line, matching
 * the other machine-readable commands.
 */

import type { PluginLifecycleEntryView } from 'acryl-harness-runtime'
import type { PluginCommandResult } from '../host/plugin-command.ts'

export interface RenderedPluginCommand {
  readonly lines: readonly string[]
  /** `doctor` fails the command when the profile is actually broken. */
  readonly exitCode: number
}

function entryLine(entry: PluginLifecycleEntryView): string {
  const state = entry.enabled ? 'on ' : 'off'
  const markers = [
    entry.mutable ? '' : 'core',
    entry.dependents.length > 0 && entry.enabled ? `${entry.dependents.length} dependent` : '',
    entry.hostPhase === 'failed' ? 'failed' : '',
  ].filter(marker => marker !== '')
  const suffix = markers.length === 0 ? '' : `  (${markers.join(', ')})`
  return `${state} ${entry.entryId}  ${entry.moduleName}${suffix}`
}

function header(result: PluginCommandResult, count: number): string {
  const noun = count === 1 ? 'plugin' : 'plugins'
  return `profile ${result.profile} (${result.engine}) - ${count} ${noun}`
}

function jsonLine(result: PluginCommandResult): string {
  const base = {
    mode: 'plugin',
    profile: result.profile,
    engine: result.engine,
    statePath: result.statePath,
  }
  if (result.kind === 'snapshot') {
    return JSON.stringify({ ...base, action: 'list', plugins: result.snapshot.entries })
  }
  if (result.kind === 'receipt') {
    return JSON.stringify({
      ...base,
      action: result.receipt.action,
      changed: result.receipt.entryIds,
      plugins: result.receipt.snapshot.entries,
    })
  }
  return JSON.stringify({
    ...base,
    action: 'doctor',
    plugins: result.report.pluginCount,
    findings: result.report.findings,
  })
}

/** Human-readable lines, or the one-line JSON projection for `--json`. */
export function renderPluginCommand(
  result: PluginCommandResult,
  json: boolean,
): RenderedPluginCommand {
  if (json) return { lines: [jsonLine(result)], exitCode: 0 }

  if (result.kind === 'snapshot') {
    const entries = [...result.snapshot.entries].sort((left, right) =>
      left.entryId.localeCompare(right.entryId))
    return {
      lines: [
        header(result, entries.length),
        ...entries.map(entryLine),
        `override file: ${result.statePath}`,
      ],
      exitCode: 0,
    }
  }

  if (result.kind === 'receipt') {
    const changed = result.receipt.entryIds
    const verb = result.receipt.action === 'enable' ? 'enabled' : 'disabled'
    return {
      lines: [
        changed.length === 0
          ? `nothing to ${result.receipt.action} in profile ${result.profile}`
          : `${verb} ${changed.map(entryId => `\`${entryId}\``).join(', ')} in profile ${result.profile}`,
        ...changed.flatMap((entryId) => {
          const entry = result.receipt.snapshot.entries.find(candidate => candidate.entryId === entryId)
          return entry === undefined ? [] : [entryLine(entry)]
        }),
        `override file: ${result.statePath}`,
      ],
      exitCode: 0,
    }
  }

  const { report } = result
  const errors = report.findings.filter(finding => finding.severity === 'error').length
  return {
    lines: [
      header(result, report.pluginCount),
      report.findings.length === 0
        ? 'no problems found'
        : `${report.findings.length} finding(s), ${errors} error(s):`,
      ...report.findings.map(finding => `${finding.severity}: ${finding.message}`),
      `override file: ${report.statePath}`,
    ],
    exitCode: errors > 0 ? 1 : 0,
  }
}
