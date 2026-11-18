# acrylblends 1.5.13

Packed products open side by side: each one keeps its own Electron folder (`~/.acryl/electron/<product>`). With the one shared folder, Electron's one-process-per-folder lock made ACRYL ADE quit as if it were a second ACRYL Control Center, so the two could not be open at the same time. A product's window settings from the shared folder (its size, the sidebar it remembered) start fresh once; apps and their data are untouched.
