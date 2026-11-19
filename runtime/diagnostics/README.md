# acryl-diagnostics

What every ACRYL surface shares for support: per-day log files with rotation and a size cap (`LogFileSink`), secret
masking (`maskSecrets`), the Cordis logger exporter that feeds the files (`FileExporter`), and the support archive
(`buildDiagnosticsArchive`: system facts plus the recent, masked logs). Desktop adds its crash dumps and lifecycle
evidence on top; Web serves the archive as a download.
