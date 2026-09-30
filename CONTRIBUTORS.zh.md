# 贡献者

ACRYL 以开放方式构建，社区贡献者正在不断加入。每一个 issue 报告、
想法和 PR 都是实实在在的项目工作 —— 无论经验多少都欢迎参与。
本文件是完整的逐项贡献记录，按时间段分组，最新的排在最前，方便浏览。

实时名单见 [GitHub 贡献者页面](https://github.com/acryldev/acryl/graphs/contributors)。
规划与规格见 [`specs/`](specs/) 目录；发布记录见
[`CHANGELOG-0.2.0.md`](CHANGELOG-0.2.0.md)。

## 如何让名字出现在这里

每条路径都算数，每一条都会带着你的名字和链接记录在下方：

- **报告 bug 或异常行为** —— 一份清晰的复现步骤就是一份贡献。
- **提出功能或改进建议** —— issue 会真实影响路线图。
- **修小东西** —— 文档、链接、翻译、示例。
- **写一个插件或 Blend** —— 生态就是产品本身。
- **评审 PR** —— 多一双眼睛就是维护者级别的帮助。

维护者原则：报告和 PR 都是真实的项目工作，即使补丁在合入前需要收窄、
延后或重写。署名会始终保留在提交历史、发布说明和本文件中。

## 组织致谢

- **[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)** —— ACRYL 桌面产品所基于的上游 Harness，以未修改的子模块形式固定引入。Thanks to the upstream Harness project.
- **[Cordis](https://github.com/deepseek-ai/cordis)** —— 支撑每一个 ACRYL 插件、服务和工具的插件框架。Thanks to the Cordis plugin framework.

## 维护者

- **[musichen](https://github.com/musichen)** —— 创建者与维护者。

## 按时间排列的贡献者

<details open>
<summary><strong>2026 年 9 月 —— 首批社区贡献</strong></summary>

**已合入或经改写的贡献**

- **[kuishou68](https://github.com/kuishou68)** —— 中英双语修复贡献指南：把 issue 入口从已跳转的上游旧仓库改回本仓库，按当前 `apps/` / `plugins/` 布局修正全部包路径，并修复了 README 锚点 ([#57](https://github.com/acryldev/acryl/pull/57))。
- **[levonk](https://github.com/levonk)** —— 新增带子模块自动初始化的 `upstream:sync` 脚本 ([#3](https://github.com/acryldev/acryl/pull/3))，提供源码构建、预构建和桌面端三种产物的 Nix flake 打包 ([#5](https://github.com/acryldev/acryl/pull/5))，并澄清"直接在 main 上工作"仅适用于维护者而非 fork 贡献者 ([#7](https://github.com/acryldev/acryl/pull/7))。大型 Devin ACP agent provider 集成正在评审中 ([#56](https://github.com/acryldev/acryl/pull/56))。

**推动改进的报告与想法**

- **[levonk](https://github.com/levonk)** —— 他的每个 PR 都始于自己先提的 issue：子模块自动初始化 ([#2](https://github.com/acryldev/acryl/issues/2))、Nix 可复现安装 ([#4](https://github.com/acryldev/acryl/issues/4))、AGENTS.md 中会误导第三方贡献者的流程问题 ([#6](https://github.com/acryldev/acryl/issues/6))。值得借鉴的模式：发现问题、清晰记录、顺手修好。

</details>

---

漏掉了谁？欢迎提 issue 或 PR —— 署名记录会持续更新，名字随时补上。
参与方式见 [CONTRIBUTING.md](CONTRIBUTING.md)。
