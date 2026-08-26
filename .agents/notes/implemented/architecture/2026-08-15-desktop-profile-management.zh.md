# Agent Note：Desktop profile 管理

[English](2026-08-15-desktop-profile-management.md) | 中文

## 问题

DSH Desktop 原本始终准备并启动产品自有的 `desktop` profile。已有 DSH 用户可能已经拥有 `web` profile，或者拥有多个由不同 bundle 与 patch 组成的专用 Web profile。普通官方 profile 中的 sessions、settings 与 storage 默认已经使用同一个 DSH home；在 profile 之间复制记录既会重复数据，也会错误表达 profile 的职责。真正缺少的能力，是选择由哪套插件组合承载 desktop generation。

Profile 选择发生在 Host Cordis 树及其 settings provider 创建之前，因此不能存放在被选 profile 的 settings namespace 中。若被选 profile 启动失败，在 renderer 与托盘都无法挂载时也必须能够恢复。

## 决策

Electron launcher 会在自身 user-data 目录下拥有一份私有且带版本的选择文档，其中记录 `active`、可选 `pending` 与 `lastKnownGood` profile 名称。写入使用私有目录、`0600` 临时文件与同目录原子 rename。发现过程中只读 profile manifest，不修改用户 patch 与依赖。

发现列表包含已有 profile manifest，以及可延迟创建的 `desktop` 与 `web` 默认项。非 desktop profile 只有在直接 bundle 顺序中先包含 `@deepseek-ai/dsh-base`、再包含 `@deepseek-ai/dsh-web-app` 时才可选择。Headless、损坏、顺序错误或已经内嵌 desktop bundle 的 profile 仍会显示，但处于禁用状态。`desktop` 仍是唯一由 launcher 管理的例外，并保留已有的安装前缀修复。选择尚不存在的 `web` 时会使用普通上游模板初始化路径。

`desktop-profiles` 是 launcher 自有 desktop layer 中的普通 Host 插件。Launcher 为它提供范围受限的 `desktopProfiles` capability。它向原生托盘贡献一个包含 profile radio 命令的子菜单，不增加 renderer、文件系统或进程 bridge。选择会先以 pending 状态持久化，再请求现有的 Electron 有序重启。

启动时，Launcher 会消费 pending 选择并准备对应 profile，但不会重写其 manifest、用户 patch 或依赖。上游约定的 launcher scratch root `cordis.yml` 仍保留在被选 profile 内，因为该目录是相对路径与 profile-local package 解析所需的 Loader base。Launcher 仍只在内存中于 `dsh-web-app` 后插入 desktop layer。

只有 `app-boot` 完成且原生窗口成功加载后，profile 才会被提升为 last-known-good。托盘只会在 Web surface 加载后创建，而且 Launcher 会在 Electron 能够分派托盘命令前同步提交 last-known-good。Pending generation 失败时会恢复到先前 last-known-good profile，并自动 relaunch 一次；last-known-good generation 自身失败时仍会 fail loud，从而避免重启循环。

兼容模式不会用官方 layout row 覆盖被选 profile。高级模式继续显式要求官方 layout、sidebar 与 conversation contract。Loopback 绑定、Windows browse picker 与 Windows PowerShell trampoline 等 Desktop 安全 overlay 仍然只作用于当前 generation。

打包终端只在被选 profile 成功启动后配置。其工作目录、欢迎信息、进程本地默认 profile 与私有 shim 目录都使用当前激活 profile。因此裸 `dsh`、配置 dump 与 plugin 命令会作用于激活 profile，而显式 `--profile` 始终优先；之后切换 profile 也不会改写已经打开的终端所使用的 shim。选择状态与生成命令会保留空格和 Unicode；路径段与控制字符会被拒绝，而原生 Windows 脚本编码仍属于目标平台 release check。

## 记录与设置

官方 `desktop` 与 `web` 组合默认共用 `$DSH_HOME/sessions`、`$DSH_HOME/settings.yaml` 与 `$DSH_HOME/storages`。Profile 切换不会迁移或复制记录。自定义 profile 可以通过自身 patch 主动重定向这些根，因此产品只对普通组合承诺记录共享。

Shell 模式仍存放在当前 file-settings provider 的 `dsh-desktop` namespace 中。Profile 选择必须在该 provider 组合之前解析，因此单独存储。

## 验证

Focused test 覆盖只读发现、bundle 顺序、损坏与重复 desktop layer、Unicode 名称、原子私有状态、pending 与 last-known-good 转换、profile 删除、托盘 radio 命令、先持久化再重启的顺序、激活 profile 的终端默认值、被选 Web profile 的组合，以及兼容模式保留行为。Build 与 packaged-runtime gate 要求同时包含 profile manager 与 Host profile selector 产物。完整 profile smoke 会提供 launcher capability，并验证托盘 contribution。

目标平台发布验证仍需在打包后的 macOS 与 Windows 应用中实际执行 profile 切换和终端命令，其中应包含一个 profile-local 第三方插件。

## 考虑过的替代方案

**把 `web` 的插件或记录复制到 `desktop`。** 这会形成两套持续漂移的组合，并重复复制官方 profile 原本就共享的数据。

**把选择保存在 `settings.yaml`。** 被选 profile 可以改变 settings provider，而 profile 又必须在 provider 启动之前确定，因此会形成循环依赖。

**以子进程方式启动 `dsh web`。** 若不新增第二套控制协议，desktop Host capability 与 launcher 自有 Cordis 插件无法跨越该进程边界。

**静默向所有被选 profile 添加 Web bundle。** 这会修改用户拥有的组合，并可能把 headless 或刻意定制的 profile 变成另一种产品。

## 结果

DSH Desktop 现在可以管理多个 Web-capable profile，而不接管其插件 roster 或记录。切换具有明确的重启边界，终端跟随激活 profile，失败的 pending 选择会恢复到最近成功挂载的 profile。Launcher 增加了一份很小的持久化控制文档与一个 Host 托盘 contribution；上游 checkout 与 renderer 隔离保持不变。
