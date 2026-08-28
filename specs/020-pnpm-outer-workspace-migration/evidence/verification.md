# PNPM Migration Verification

## Automated evidence

All commands ran from the outer ACRYL repository root.

- `corepack pnpm install --frozen-lockfile` passed with PNPM 11.7.0.
  - PNPM reported eight workspace projects: the root and seven ACRYL-owned packages.
  - `deepseek-harness/` was absent from the workspace list.
- `corepack pnpm run upstream:version` passed and reported PNPM 11.7.0 from the pinned upstream checkout.
- `git diff --exit-code -- deepseek-harness/` passed.
- `corepack pnpm run check:layout` passed.
  - Bilingual documentation gate: 42 records and 84 documents consistent.
  - Market architecture gate: 37 source files independent of Desktop implementation.
  - Layout gate confirmed upstream pin `b150a551b8`.
- `corepack pnpm run typecheck` passed.
- `corepack pnpm run test` passed.
  - 1,144 tests passed, with four expected skips.
  - Desktop recovery tests intentionally print simulated renderer failures while asserting recovery behavior.
- `corepack pnpm run build` passed.
- `corepack pnpm run package:dir` passed.
  - Electron Builder rebuilt `node-pty` for macOS arm64 and produced `dsh-plugin-desktop/dist/mac-arm64/ACRYL.app`.

## Renderer health observation

An isolated development Electron launch completed renderer boot as healthy. Its lifecycle event log recorded `renderer.boot.completed` with `rendererStatus: healthy`; the layout, sidebar, and conversation client plugins were active. The earlier recovery page reporting missing `layout` was not reproducible.

## Product-owner smoke

The product owner ran `corepack pnpm dev` and confirmed:

1. Electron opened and the desktop window rendered.
2. Chat and prompt submission completed through the selected model.
3. The advanced renderer URL `http://127.0.0.1:43120/?dsh-desktop-mode=advanced&dsh-desktop-platform=darwin` activated sidebar and conversation successfully.
4. Model selection, prompt execution, and custom Development Canvas plugin enable, disable, and reload all worked.
5. Closing Electron stopped the embedded Web server cleanly.

The bare `http://127.0.0.1:43120/` URL intentionally lacks the Electron advanced-mode query values. It is not the independent `acryl-web` surface planned in the roadmap and therefore leaves advanced-only sidebar and conversation plugins pending. The future owner-or-attach Web runtime must provide its own complete surface rather than reuse this embedded Electron renderer.
