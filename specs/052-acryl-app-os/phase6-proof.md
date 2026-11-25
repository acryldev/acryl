# Spec 052 Phase 6 - one OS id per app, proven on Ubuntu, Windows and macOS (2026-11-25)

T056-T059 of [`tasks.md`](tasks.md). Code: commit 503b746ef395d56a2ccfda241916d783dea91964 (measured as a740b21f, the same change before its rebase). An app's id
(`.acryl/app.json`) gives one OS id, `com.acrylblends.app.<id>`
(`osAppIdOf` in `@acryldev/instance`): the macOS bundle id of the running app, the Windows AppUserModelID of the Start shortcut and of the
running app, and on Linux the `.desktop` file's `StartupWMClass` and the window's class.

Measured on Linux first: under Electron 44 only `app.setDesktopName` sets the window class. `app.setName` and the `--class` switch leave it
"electron".

## Method

On each test host, on a scratch HOME and ACRYL home: two Notes apps (the second one's extra disk), made by `create-acrylblends@1.7.33`,
with this commit's `desktop-shell` and `instance` packed into them, each with its own solid-colour `assets/icon.png`, installed through the
shared Program. The first was added to Applications with the packed `acryl`, opened from that entry, checked, and removed. Then both passed
the start checks of [`step1-proof.md`](step1-proof.md). The script (`step1-proof.mjs`, phase `t059`) and the logs are in the measuring
session's scratch folder (`evidence/t59-*`).

## Results

| | z370n (Ubuntu) | mbpi9win (Windows 10) | AION (macOS 26) |
|---|---|---|---|
| Entry | `acryl-notes-os.desktop`, valid (`desktop-file-validate`) | `notes-os.lnk` under Start Menu `ACRYL` | `notes-os.app` in `~/Applications` |
| Opened from the entry | `gio launch`: yes, 3.1 s | the shortcut: yes | `open`: yes, 11.8 s |
| The OS's id for the app | window class = `StartupWMClass` (`xwininfo`) | the `.lnk` carries the AppUserModelID | running bundle id `com.acrylblends.app.<id>` (`lsappinfo`) |
| Name | the Blend's, `notes-os` | the Blend's, `notes-os` | the Blend's, `notes-os` |
| Icon | an icon file written; its picture not compared | not checked | the clone's Dock icon is the app's png (centre pixel equal) |
| Found by the OS's search | not measured (no desktop session) | **not listed** (below) | `mdfind`, 2.2 s, on a copy on the main disk |
| Removed from Applications | nothing left | nothing left | nothing left |
| First app (becomes the Program) | 705 MB | 762 MB | 1,151 MB free space |
| Second app | 6.9 MB | 11.3 MB | 11.3 MB free space |
| Start checks | all passed | all passed | all passed except koffi inside Electron (Intel Node, below) |

- The name is `notes-os` because the Notes starter names the Blend after the app's folder.
- No open time is given for Windows: the timed span included the 180 s Start search wait.
- AION's test disk image is not indexed by Spotlight, so the search check uses a copy of the entry on the main disk.
- The extra disk of the macOS branded clone and of the launcher files was not measured on its own.

## What the proof did on mbpi9win's real account, and what changed

The coordinator allowed one write outside the scratch folder: a copy of the shortcut in user alexa's Start menu, for Start's own list
(`Get-StartApps`), removed after. Full exports were taken five minutes before the run, right before it and after it, and compared key by key:

- Start menu `Programs` (every file's hash) and `HKCU\...\Uninstall`: identical.
- `HKCU\Software\Classes`: unchanged over the five minutes before. After the run two values differed, the `PCT`/`PTT` time stamps under
  `Local Settings\...\AppModel\SystemAppData` for `Microsoft.WindowsStore` and `MicrosoftWindows.Client.CBS`. No key was added or removed, and
  no key or value names the run. Nothing was removed or restored.
- The first run kept only hashes, which differed. A search of all of `Classes` for the run's names found nothing, and what changed then
  cannot be shown.

## Known gaps

1. **Windows Start search:** the entry is in the Start menu with its AppUserModelID, `Get-StartApps` did not list it within 180 s on a locked
   session; retest on an unlocked one. The lock state itself was not read: it is inferred from the black capture below. Indexing settings
   were not touched.
2. **Windows taskbar grouping is unproven** for lack of a screen: the taskbar capture is all black.
3. **Windows: the running window's AppUserModelID was not read.** Only the shortcut's is measured; the app was stopped first.
4. **macOS: the entry and the running app have different bundle ids** (`io.github.acrylblends.<list id>` and `com.acrylblends.app.<id>`).
   Opening the entry works. Keeping the running app in the Dock was not tried; the Dock would hold the clone, which takes no arguments.
5. **Linux:** no desktop session on z370n, so no dock or app menu was looked at; the class match is the evidence. `gio launch` was used,
   not `gtk-launch`.
6. **Icons on Windows and Linux were not looked at.** Only macOS's was compared with the app's png.

## koffi on AION (corrects step1-proof.md finding 3 and baseline.md finding 5)

The proofs reached AION through a non-login ssh shell, which picks `/usr/local/bin/node`, an Intel build. The machine's login shell uses
NVM's arm64 Node. With `~/.nvm/versions/node/v24.14.0/bin` first on PATH, a fresh Notes app installed Electron 44.9.3 for arm64, and koffi and
node-pty loaded in Node and inside Electron. Only that load check was run on the arm64 Node; the table above was measured on the Intel one.
