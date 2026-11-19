/** Logging and diagnostics shared by every ACRYL surface: log files, masking, the Cordis exporter and the support archive. */

export { buildDiagnosticsArchive, DEFAULT_MAX_ARCHIVE_LOG_BYTES } from './archive.ts'
export type { DiagnosticsArchive, DiagnosticsArchiveInput } from './archive.ts'
export { FileExporter } from './file-exporter.ts'
export { isDiagnosticLogFileName, LogFileSink, logFileName } from './log-files.ts'
export type { LogFileSinkOptions } from './log-files.ts'
export { isErrorType, shouldEmit } from './log-level.ts'
export type { LogLevel, LogType } from './log-level.ts'
export { maskSecrets } from './mask-secrets.ts'
