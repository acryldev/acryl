@echo off
rem ACRYL portable CLI launcher (Windows).
rem Uses the bundled node.exe from this archive; never touches the host's
rem Node/npm/pnpm. --expose-internals is required by the Cordis HMR boot guard.
setlocal
set "DIR=%~dp0"
"%DIR%node.exe" --expose-internals "%DIR%..\lib\bin.js" %*
exit /b %ERRORLEVEL%
