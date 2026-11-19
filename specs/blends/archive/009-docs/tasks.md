# Tasks: Documentation

- [x] T901 Docs harness: snippets, links, anchors, index, reference completeness, no em dash
- [x] T902 Getting started and concepts
- [x] T903 Guides and error catalogue
- [x] T904 Reference pages for every package
- [x] T905 Architecture and status
- [x] T906 Root README rewritten with real status and links
- [x] T907 `pnpm run check` green; checkpoint pushed

## Findings during implementation

- **A number I wrote from memory was wrong.** The docs said the shared HTTP contract suite has 19 tests; it has 15 (the 19 per host included each host's own tests). The numbers were removed rather than replaced, and the docs avoid counts that can drift.
- **An unverified claim was softened.** The installation page recommended TypeScript 5.9; only 6.0 is built and tested, so it now says other versions are untested.
- The reference completeness test first required the bare name alone in backticks; signatures such as `layerPlugin({ id, ... })` are better documentation, so the test accepts any whole-word identifier inside an inline code span.
- Every `E_*` code found in any source file must appear in `guides/errors.md` (a test enforces it); 27 codes were catalogued.
- Snippets that need third-party packages (valibot, Effect) are plain `ts` blocks and are not executed; the reference and the examples cover those.
- Logo: `aimbrace_logo_v4.png` is the finished mark (isometric line art with the wordmark); `v3` is a different, unrelated mark and the board is exploration.
