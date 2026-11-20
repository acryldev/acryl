# @acryldev/blends 1.7.10

Released 2026-11-20.

## Fixed

- A desktop app whose host the watcher restarts (a saved file, or ACRYL Control Center copying its new files in on the first start after an
  update) loads its window again, so the page signs in to the new host instead of answering 401 and 404 until a manual reload
  (@acryldev/desktop-shell 0.1.6).
