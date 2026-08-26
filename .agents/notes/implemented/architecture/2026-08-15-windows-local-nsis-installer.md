# Agent Note: Native Windows x64 NSIS test installer

Status: implemented

English | [中文](2026-08-15-windows-local-nsis-installer.zh.md)

## Decision

DSH Desktop provides `yarn dist:win` as a native Windows x64 packaging command. It runs the build, all TypeScript compiler faces, Windows-safe packaging and native-shell focused tests, and the runtime-closure verifier before Electron Builder creates an assisted NSIS installer for version `2.0.0`. POSIX execution tests remain in the cross-platform CI suite instead of blocking a native Windows package. The installer supports per-user and elevated all-users installation, a selectable destination, and Start Menu and desktop shortcuts. The stable application ID remains the NSIS upgrade identity.

The command rejects non-Windows and non-x64 hosts and requires Node 22.19+ or Node 24.x so the official runtime includes Corepack. It removes Windows certificate variables, disables executable signing without disabling Windows resource editing, disables publishing, and disables Electron Builder's generic native rebuild. `node-pty` supplies Windows x64 Node-API binaries, so the installer build does not depend on Python or Visual Studio C++ Build Tools. The resulting installer is intended for local installation and native smoke testing; it is not an Authenticode release and does not establish SmartScreen reputation.

## Artifact verification

Electron Builder's existing `afterPack` hook verifies the application archive, physical runtime tree, and required Windows x64 `node-pty` prebuilds before NSIS packaging. After packaging, a second gate requires the exact versioned installer and `win-unpacked/DSH Desktop.exe`, verifies that both are non-empty regular files, and checks their DOS `MZ` and Windows `PE\0\0` signatures. A stale installer from another version cannot satisfy the gate.

## Native release boundary

Windows packaging runs on a native Windows x64 dependency installation so Koffi and other platform packages resolve to their Windows variants. Installer UI, upgrade and uninstall behavior, Mica, the tray terminal, the Windows ACL sandbox, console-window suppression, Authenticode, and SmartScreen remain Windows-machine verification gates. A future signed command must use a dedicated certificate preflight and verify the installer, uninstaller, and application signatures instead of weakening this unsigned command.
