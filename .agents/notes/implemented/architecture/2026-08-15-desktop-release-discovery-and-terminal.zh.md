# Agent Note: Desktop release 发现与终端环境

Status: implemented

[English](2026-08-15-desktop-release-discovery-and-terminal.md) | 中文

## 问题

DSH Desktop 需要两项不属于上游 Web 呈现的原生操作。用户需要在不持续关注仓库的情况下发现较新的 stable desktop release；只使用安装器的用户也需要一个终端，在无需另外安装 DSH CLI 或 pnpm 的情况下运行普通 `dsh --profile desktop` 插件工作流。

这些操作必须保留兼容模式与高级模式已经建立的产品边界。固定的上游 checkout 保持不变；兼容模式继续使用没有 override 的官方 Web client；沙箱 renderer 不获得 Electron、Node、文件系统、进程或终端能力。desktop package 也不能修改用户的全局 `PATH` 或 shell 启动文件。

公开 release service 提供一份 no-cache 版本文档与两个计数用 installer redirect，但不提供 Squirrel.Mac 所需的签名 ZIP feed，也不提供 NSIS updater 的 publisher metadata。因此 Desktop 可以负责经用户确认的下载与原生 installer 交接，但不能宣称无人值守替换或经过验证的 publisher 身份。

## 决策

Desktop 原生操作是围绕同一个 Electron adapter 组合的独立 Cordis Host contribution。profile 会在普通 Web bundle 之后组合 `desktop-shell`、`desktop-terminal` 与 `desktop-updates`。Electron runtime 拥有实体托盘并提供有序 item registry；每个 Host plugin 都在 `ctx.effect()` 中注册命令，并在该 generation dispose 时移除命令。Shell 继续拥有窗口与模式生命周期，terminal 与 update plugin 只拥有各自的命令状态。

该组合在兼容模式与高级模式中完全相同，不增加 Client face、preload bridge、Electron IPC 方法或 renderer global API。托盘菜单构造只对 contribution 分组，不检查上游或第三方 Web 元素。Linux 会在 profile 中禁用 terminal row；如果在 Linux 上直接激活该 Host plugin，则会明确失败，而不会显示一个无法启动的命令。

## Stable release 更新交接

`desktop-updates` 只查询 `https://www.dshdesktop.cn/api/desktop/version`。其显式配置默认启用后台检查：首次延迟 60 秒，每次检查完成六小时后安排下一次，并为每个请求设置 15 秒期限。只有 Electron 报告为打包应用时才会自动调度。开发运行与其他未打包启动会保留手工托盘命令，但不会主动发起后台网络流量。

手工检查与定时检查共用一个 in-flight request。Checker 使用 no-cache 语义发送 `GET`，拒绝 redirect 与非 200 响应，把响应正文限制为 4 KiB，并且只接受名为 `version` 的 JSON string 字段及规范的 stable Semantic Versioning。比较过程不会把 SemVer identifier 转成 JavaScript number。定时检查遇到无效、相同、旧版本、HTTP、timeout、cancellation、正文超限与网络结果时保持静默。手工检查得到相同或旧版本时会显示包含当前安装版本的“已是最新”对话框；请求或校验失败时则显示一条固定重试提示，不暴露响应或错误细节。

只有严格更新的远端版本才会进入可用状态。托盘会显示空闲、检查中、下载中或可用版本。后台结果会为每个版本跨重启显示一次原生 **Download** 或 **Later** 提示；手工选择托盘命令时可以再次询问，并直接以该提示作为结果对话框，不会额外弹出通知。Updater 会在 Electron user-data 目录下原子写入 version-2 JSON 文档。文件上限为 4 KiB，只保存 `lastPromptedVersion`，绝不会在未查询 service 的情况下从状态恢复可用 release。状态不存在时从空状态开始；旧版、格式损坏、体积超限或包含不安全值的状态会被静默替换，而不会被信任。

只有用户选择 **Download** 后，固定的 macOS 或 Windows 下载入口才会被访问。Checker 会先重复版本请求，只有仍然发布同一个更新版本时才继续。Electron `net.fetch` 会跟随 service redirect，把不超过 1 GiB 的文件流式写入私有、按版本划分的 user-data 目录，同步并原子重命名完整文件，并在失败或取消后清理 partial 文件。这个即时复查可以缩小 release rotation 窗口，但不能把固定 endpoint 与版本建立加密绑定；后续 service 应返回 versioned URL 与平台 hash。交接前要求 macOS 产物包含 UDIF `koly` trailer，Windows 产物包含 DOS 与 PE signature。这些检查可以拒绝 HTML error 或结构错误的产物，但不能证明 publisher 身份。

macOS 会打开经过校验的 DMG，并说明用户必须替换 `Applications` 中的 DSH Desktop 后重新打开；它不会自行 mount 并修改已安装的签名 bundle。Windows 会在 NSIS installer 准备完成后再次询问。选择 **Restart and Install** 会使用准确 argv 且不经过 shell 启动 installer，等待其 spawn event，然后在当前应用退出前请求既有的有界 Cordis teardown。选择 **Later**，或任何下载、文件系统与 installer 打开错误，都不会显示 failure UI，同时会保留托盘中的可重试版本操作。手工检查失败会使用上述固定重试对话框。

发布顺序是一项运维 invariant：必须先准备好两个 installer artifact 及其 redirect，再修改 Upstash Redis key `deepseek-harness-desktop:release:version`。更新该 key 会立即让版本可被发现，无需重新部署 service。Key 缺失、服务不可用或值无效时，公开 endpoint 不会返回可用版本，Desktop checker 会直接忽略。

## 隔离终端环境

Launcher 会在 Host plugin 能够提供 terminal 命令之前，用解析后的当前激活 profile 目录与 DSH home 对 Electron adapter 完成一次配置。在 macOS 与 Windows 上，`desktop-terminal` 会注册 **Open DSH Terminal**。每次调用都会在应用 user-data 的 `cli` 目录下重新生成私有启动文件，并以 profile 目录为工作目录打开一个独立的 system terminal。

生成的 `bin` 目录包含 `dsh`、`pnpm` 与 `node` shim。它们会复用打包后的 Electron executable 的 Node mode，而不依赖系统 Node 安装。Electron Builder 会把生产依赖树输出到 `app.asar.unpacked`，desktop CLI 与 pnpm shim 会进入这棵物理依赖树；因此 profile fallback 的符号链接会指向真实 package 目录，而不是虚拟 ASAR 路径。`dsh` shim 会使用 `--expose-internals` 启动 Node mode，从而保留普通 profile 与 HMR 所需的 internal ESM hook，随后进入 desktop 自有 bootstrap。在这个专用终端中，只有当调用没有选择 profile 时，该 bootstrap 才会补充打开终端时选择的 profile，包括裸 `dsh`、`dsh --dump-config` 与 plugin 子命令；显式 `--profile` 与上游 `web` alias 仍然拥有最终决定权。随后，它会在导入固定且已 unpack 的 `@deepseek-ai/dsh` CLI 入口前，移除所有大小写形式的 `ELECTRON_RUN_AS_NODE`。通用 Node 与 pnpm shim 只在自身子进程树中启用 Node mode。pnpm shim 还会局部设置 `npm_config_runtime=electron`、打包 Electron 版本与 Electron headers URL，使安装到所选 profile 的原生依赖面向当前 Electron ABI。

Terminal child 启动时会移除 Electron Node mode，把 `DSH_HOME` 固定为 Launcher 当前使用的 home，以 desktop profile 为工作目录，并且只在该 child 的 `PATH` 前置生成的 `bin` 目录。Electron main process 环境、操作系统环境与用户 shell 文件都不会被修改。欢迎信息会显示 DSH Desktop 版本、profile、profile 目录与 DSH home，随后给出配置 dump、插件 add、remove、update 命令，以及必须重启应用的提示。

在 macOS 上，LaunchServices 会打开生成的 `welcome.command`。受控的交互式 zsh 或 bash 启动会先读取用户普通的交互式 rc 文件，随后移除 Electron Node mode 并恢复 desktop 自有 home 与 shim path，避免用户 rc 意外丢弃这些值。在 Windows 上，Launcher 会依次解析 PowerShell 7、Windows PowerShell 与命令提示符，并优先使用新的 Windows Terminal 窗口承载所选 shell。如果 `wt.exe` 不可用，生成的 batch broker 会通过内置 `start` 命令分配可见控制台。Windows command 文件与 PowerShell welcome 源码只包含 ASCII；本地化 profile 名称和路径通过 Unicode child environment 传入，而不依赖当前 code page。Electron 进程始终使用 executable 与 argv 并设置 `shell: false` 来调用 launcher；同步启动失败、异步 spawn 错误与 broker 非正常退出都会进入原生错误对话框。生成的 PowerShell 或 batch welcome 文件会完成最终环境设置。

System terminal 是由本地用户显式发起的能力，而不是 renderer 或模型能力。Web 内容无法通过 JavaScript 调用该命令，也没有原始 process handle 或 terminal stream 穿过 loopback Web carrier。插件安装仍以本地用户普通权限执行，并修改持久化 desktop profile，因此欢迎信息会要求先重启 desktop，当前 Cordis generation 才能使用这些变化。

## 验证

Headless update 测试覆盖 strict SemVer 顺序、固定版本与下载 endpoint、no-cache 请求选项、定时检查失败静默、手工结果对话框、响应与 installer 体积上限、version-2 状态解析、定时与手工请求共享、timeout 与下载 cancellation、计数请求之前的确认和版本复查、单一下载任务、DMG 与 PE rejection、partial 文件清理、动态托盘 label，以及 effect disposal。Electron adapter 测试会在不打开真实窗口的情况下覆盖原生确认与结果对话框、macOS DMG 打开、Windows installer 在退出前 spawn、普通原生通知，以及有序、可 dispose 的托盘 contribution registry。

Headless terminal 测试会检查生成的 macOS 与 Windows 文件、空格与 shell metacharacter quoting、通过 child environment 携带本地化路径的 ASCII Windows 模板、私有 POSIX mode、`DSH_HOME` 与 `PATH` 隔离、`--expose-internals`、不会覆盖显式 profile 或 `web` alias 的 default-desktop 参数注入、继承 Electron Node mode 的移除、交互式 shell 启动、Windows Terminal 选择、可见控制台 broker、PowerShell 与命令提示符 fallback、launcher 错误处理，以及对不支持平台或不安全生成脚本值的明确拒绝。Packaged-runtime gate 会在签名前要求 `app.asar` 包含 terminal 与 update 模块及 desktop CLI bootstrap，并要求 `app.asar.unpacked` 以物理文件形式包含上游 DSH CLI、Web runtime sentinel 与内置 pnpm 入口。

测试不会启动图形终端、显示操作系统对话框、请求任一生产下载 endpoint、替换 macOS 应用、安装第三方原生 package、验证 Authenticode 或执行签名 installer。这些行为仍是打包后 macOS 与 Windows 产物的目标平台检查。

## 考虑过的替代方案

**立即使用 Electron `autoUpdater` 或 `electron-updater`。** 当前 macOS endpoint 跳转到 DMG，而不是通过 Squirrel.Mac feed 暴露签名应用 ZIP；Windows release path 也尚未建立无人值守 NSIS 更新所需的 publisher 校验。经确认的下载与 installer 交接可以直接利用现有 service，而不虚构不兼容的 update metadata。

**在 Web renderer 中嵌入终端。** 嵌入式终端需要 renderer UI、preload 与 IPC protocol、pseudo-terminal 所有权、进程 teardown，以及更大的安全面。所需的插件管理工作流只需要一个具有受控环境且由用户显式打开的 system terminal。

**将 PowerShell 或命令提示符作为 detached Electron child 启动。** Electron 的内嵌 Node 进程会隐藏控制台子进程，而 Windows detached-process 标志不会分配新控制台。两者组合会让交互式 shell 在没有可见窗口的情况下运行。因此 Windows Terminal 是首选 host，并由生成的 `cmd start` broker 提供兼容 fallback。

**修改用户的全局 `PATH` 或 shell rc。** 全局修改会在应用退出后继续存在，与其他 DSH 或 Node 安装产生冲突，并且需要卸载修复路径。私有生成 shim 会把所有权与清理保留在 DSH Desktop 内。

**要求系统安装 Node、DSH 与 pnpm。** 这会保留本功能原本要解决的 installer-only 缺口，并使行为依赖无关的宿主版本。打包 Electron Node mode 与内置 CLI 入口能提供版本匹配的环境。

**在 Electron tray builder 中硬编码所有命令。** 单体原生菜单会耦合无关操作并绕过 Cordis disposal。Effect-scoped item registration 可以保留 plugin 所有权、确定性顺序与未来 Host 组合能力。

## 结果

打包后的 DSH Desktop 只有在用户明确确认后才能发现并下载较新的 stable release，同时仍可提供普通 desktop-profile 插件工作流，而无需修改上游 checkout 或削弱 renderer 隔离。macOS 替换仍由用户手工完成；Windows 会在第二次确认后使用下载好的 NSIS 程序安装。生成的 CLI 环境仍只存在于从托盘打开的终端内。

公开 DSH Desktop 版本 service 现在是 release version 的权威来源；各平台 download redirect 则保留为计数用 delivery entry，检查阶段绝不会探测它们。Desktop package 也开始拥有内置 pnpm 版本和生成 shim 行为，这会扩大打包 runtime closure，并且必须持续与 Electron ABI 对齐。Linux 保留兼容模式，但在形成独立平台设计前既没有 installer download path，也没有 desktop 终端。
