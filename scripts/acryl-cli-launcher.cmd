@echo off
rem ACRYL CLI launcher (Windows).
rem Runs on the host's Node; never bundles node.exe. --expose-internals is
rem required by the Cordis HMR boot guard.
setlocal
set "DIR=%~dp0"
node --expose-internals "%DIR%..\lib\bin.js" %*
exit /b %ERRORLEVEL%
