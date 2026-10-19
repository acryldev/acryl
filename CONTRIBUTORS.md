# Contributors

ACRYL is built in the open with a growing community of contributors. Every
issue report, idea, and pull request is real project work — welcome at any
experience level. This is the full per-contribution record, grouped into time
bands with the newest band first so it stays scannable.

For the live list, see the
[GitHub contributors page](https://github.com/acryldev/acryl/graphs/contributors).
Planning and specs live under [`specs/`](specs/); releases are recorded in
[`CHANGELOG-0.2.0.md`](CHANGELOG-0.2.0.md).

## How to get your name here

Every path counts, and every one is recorded below with your name and a link:

- **Report a bug or odd behavior** — a clear reproduction is a contribution.
- **Propose a feature or improvement** — issues shape the roadmap.
- **Fix something small** — docs, links, translations, examples.
- **Build a plugin or a Blend** — the ecosystem is the product.
- **Review a PR** — a second pair of eyes is maintainer-grade help.

The maintainer rule: reports and PRs are real project work, even when the
final patch has to be narrowed, delayed, or reworked before it lands. Credit
stays visible in the commit history, release notes, and this file.

## Organizational thanks

- **[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)** — the pinned upstream harness ACRYL's desktop product is built around, kept unmodified as a submodule. 感谢上游 Harness 项目。
- **[Cordis](https://github.com/deepseek-ai/cordis)** — the plugin framework underneath every ACRYL plugin, service, and tool. 感谢 Cordis 插件框架。

## Maintainer

- **[musichen](https://github.com/musichen)** — creator and maintainer.

## Contributors by time

<details open>
<summary><strong>October 2026 — packaged Desktop fixes</strong></summary>

**Merged or adapted contributions**

- **[smrifat1411](https://github.com/smrifat1411)** (MD Rifat Hossain) — traced why every in-app settings save failed in installed Desktop builds with "profile reload requires the root Include entry": Loader imports resolved through the physical `app.asar.unpacked` path while the main process used the logical `app.asar` path, so profile plugins got a second copy of `dsh-app-boot`. Fixed the anchor and tightened the test so it can no longer pass by accident ([#58](https://github.com/acryldev/acryl/pull/58)).

</details>

<details open>
<summary><strong>September 2026 — first community contributions</strong></summary>

**Merged or adapted contributions**

- **[kuishou68](https://github.com/kuishou68)** — fixed the contributing guide in both languages: pointed issue reports at this repo instead of the redirected upstream one, corrected every package path to the current `apps/` / `plugins/` layout, and repaired the README anchors ([#57](https://github.com/acryldev/acryl/pull/57)).
- **[levonk](https://github.com/levonk)** — added the `upstream:sync` script with submodule auto-init ([#3](https://github.com/acryldev/acryl/pull/3)), Nix flake packaging with source, prebuilt, and desktop outputs ([#5](https://github.com/acryldev/acryl/pull/5)), and clarified that work-on-main applies to maintainers, not fork contributors ([#7](https://github.com/acryldev/acryl/pull/7)). A large Devin ACP agent-provider integration is under review ([#56](https://github.com/acryldev/acryl/pull/56)).

**Reports and ideas that shaped the work**

- **[levonk](https://github.com/levonk)** — every one of his PRs started as a self-filed issue: submodule auto-init ([#2](https://github.com/acryldev/acryl/issues/2)), Nix reproducible installs ([#4](https://github.com/acryldev/acryl/issues/4)), and the contributor-workflow pitfall in AGENTS.md ([#6](https://github.com/acryldev/acryl/issues/6)). The pattern to copy: spot a problem, file it clearly, land the fix.

</details>

---

Missed someone? Open an issue or PR — credit is kept current, and names are
happily added. See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.
