# create-acrylblends 1.5.10

Starting from a registry entry works on Windows with Git's Unix tools on PATH. Asks for [acrylblends 1.5.10](acrylblends-1.5.10.md).

- **The downloaded entry is unpacked with Windows' own tar** (`System32\tar.exe`). A bare `tar` could be Git's GNU tar, which reads
  `C:\...` as a host named `C` and stopped every `--from` with "is not a readable tar.gz archive" (`acryl ade` and `acryl --gui` on such a PC).
