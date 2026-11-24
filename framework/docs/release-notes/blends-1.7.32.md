# @acryldev/blends 1.7.32

Released 2026-11-24.

- **A desktop app that was updated no longer ends with nothing on screen** (`@acryldev/desktop-shell` 0.1.12, carried in the library). A Windows 11
  report: after an update the .exe did nothing when clicked. The start now writes its own log from the first line (`data/logs/desktop-YYYY-MM-DD.log`,
  beside the host's), and the update's copy over the app's source runs after the single-instance lock, behind a small "Updating ..." window, so a
  second double-click cannot copy at the same time. A locked file is tried again; if it stays locked (or the copy waits 60 s without an answer), a
  window says which file and the old version starts. A second start before any window exists queues its focus request instead of quitting
  silently. A frame host that cannot start shows its reason. Fixed on the way: closing the "Updating ..." window quit the app after the copy.
