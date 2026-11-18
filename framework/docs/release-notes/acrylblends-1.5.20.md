# acrylblends 1.5.20

`acrylblends upgrade` leaves package.json on the release it upgraded to. Before, it printed "acrylblends is now ^1.5.19" while the frame step wrote the old range back (an app upgraded from 1.5.8 still said `^1.5.8`; npm installed the new release anyway, because the range allows it). A checkout's `file:` spec stays as it is.

The desktop packer (`scripts/pack-blank-mac.mjs`) packs an app that leaves out the LibreOffice engine: it declares the placeholder with the override's own spec, where npm refused the pack with EOVERRIDE.
