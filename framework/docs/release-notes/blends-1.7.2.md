# @acryldev/blends 1.7.2

Released 2026-11-20.

## Fixed

- `npm create @acryldev/blends` makes a whole app again. 1.7.1 was packed without its `prepack` step, so the package had no copy of the
  framework docs, and every new app stopped with "acrylblends cannot find the framework docs" before its plugins were written. 1.7.2 is
  the same code as 1.7.1, packed with the docs. Apps made with 1.7.1 are half made: delete the folder and make the app again.
