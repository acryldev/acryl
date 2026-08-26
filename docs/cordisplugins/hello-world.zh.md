# Hello World：在本仓库里写一个 Cordis 插件

这是面向 **当前 Desktop 仓库** 的学习指南，不是上游教程的复述。读完后你应能写出一个会挂载、会 `inject`、会注册可逆 effect、卸载时不留残渣的插件。

在写 Development Canvas 或任何 ACRYL 插件之前先读本文。

## 不变的规则

万物皆插件。桌面壳是插件。Agent loop 是插件。你的功能也应是插件。

Cordis 是组合内核：

| 概念 | 实践 |
| --- | --- |
| **Plugin** | Cordis 可以挂载/卸载的模块 |
| **Context** | `ctx`：按名字取服务，不要 import 具体实现 |
| **inject** | 硬依赖。服务不在时 fiber 保持 PENDING |
| **Effect** | 你创建的东西必须有 disposer |
| **Fiber** | 运行时实例：PENDING、LOADING、ACTIVE、FAILED、UNLOADING、DISPOSED |

上游精简参考：[Cordis primer](https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-primer)。可运行章节在 `deepseek-harness/docs/cordis-tutorial/`。**不要修改 `deepseek-harness/` 里的文件。** 从中学习，然后在子模块外编写自有插件。

## 本仓库实际如何启动

```text
Yarn 4 workspace（本仓库）
  dsh-plugin-desktop     Host + Client、Electron、打包
  dsh-community-fabric   文档脚手架
  dsh-community-market   文档/运行时脚手架
  deepseek-harness/      固定上游（pnpm，只读）

一次 Desktop generation
  Loader 读取 profile bundles + patches
  dsh-plugin-desktop/cordis.patch.yml 插入 desktop-* 行
  Host Cordis 树在 Electron main 启动
  loopback HTTP/WebSocket 承载 Web Client
  声明了 dsh.client 的包进入 window.__DSH_BOOT__
  Client Cordis 树在 renderer 启动
```

兼容模式不改上游 Web UI。高级模式才由 Desktop 拥有 `root` 的 slot（`sidebar`、`conversation`、`details`、`shell.overlay`）。新的界面应落在这些 slot 上，而不是私有 Electron IPC。

第三方 Host 插件可 inject 的公开服务只有 `desktopProfiles` 和 `desktopPnpm`。Electron 适配器上的其余能力都是私有的。

## 形态 1：函数插件（从这里开始）

插件通常导出 `apply`：

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello-world'

export function apply(ctx: Context) {
  ctx.logger.info('hello-world: loaded')
}
```

这就是完整单元。fiber 变为 ACTIVE 时 Cordis 调用 `apply`。文件里没有应用启动代码。

三种合法形态：

1. **函数** - `export function apply(ctx)`
2. **对象** - `{ name, apply(ctx) {} }`
3. **Service 子类** - `class Hello extends Service { constructor(ctx) { super(ctx, 'hello') } }`

在需要 *提供* 命名服务之前，用函数即可。

## 形态 2：先 inject，再 apply

加载顺序不是 YAML 列表顺序。需要服务就声明：

```ts
export const name = 'hello-greeter'
export const inject = ['logger']

export function apply(ctx: Context) {
  ctx.logger.info('hello-greeter: logger is ready')
}
```

缺少 `logger` 时 fiber 保持 **PENDING**。这是健康状态。改代码前先看 fiber。

可选依赖：探测，不要 inject：

```ts
const profiles = ctx.get('desktopProfiles')
if (profiles === undefined) {
  return
}
```

仅 Desktop 使用的插件写 `export const inject = ['desktopProfiles']`，在普通 `dsh web` 里保持 PENDING。这是正确行为。

## 形态 3：可逆 effect

任何活过函数返回的东西都需要 disposer。`ctx.on()` 已经跟踪监听器。定时器、进程、DOM、slot 注册要用 `ctx.effect()`。

插件卸载时 Cordis 执行逆操作。泄漏是架构缺陷。

只观察的 waterfall 监听器 **必须** 调用 `next()`。忘记调用会吞掉下游行为。

## 本仓库如何组合插件

Desktop Host 组合在 `dsh-plugin-desktop/cordis.patch.yml`。

要点：

- 每一行都要有 **稳定 `id`**。没有 id 时，一次编辑会被看成“删旧加新”，导致不必要的重新挂载。
- `name` 是包名或绝对模块路径。
- `config` 由插件导出的 `Config` schema 校验。
- `disabled: !!js ...` 在挂载时计算，表达式按代码对待。

Client 包还要声明 `dsh.client` 和 `exports["./client"]`。Host 扫描后提供 `/plugins/<id>/client.js`，浏览器 Cordis 树再挂载那个 `apply`。Renderer 插件使用 slot、路由和 RPC，绝不 import Electron。

## 演练：Host Hello World overlay

这是学习 overlay，不是产品包。路径必须是绝对路径。补丁不会改变 Loader 解析模块的 profile 目录。

在 Desktop 里，同样的想法是 profile 补丁或通过 `desktopPnpm` / `dsh plugin` 安装的 bundle 中的新 insert 行。不要为一次性实验手改 `dsh-plugin-desktop/cordis.patch.yml`，那是 Desktop 产品组合。

## 演练：Client Hello World 挂到 slot

Host 插件不能在 BrowserWindow 里画界面。UI 是 Client 插件，注册到已文档化的 slot。

高级 Desktop 的 `root` 子节点是 `sidebar`、`conversation`、`details`、`shell.overlay`。附加装饰放在 `shell.overlay`（list slot）。替换 Chat 会占用 `conversation`，除非你有意替换上游占用者。

Development Canvas 用同一机制，只是它在高级模式占据中心表面，而不是一枚小徽章。

## 如何测试

生命周期与功能同等重要：挂载、inject 消费者激活、卸载无泄漏、再挂载后消费者重新 ACTIVE。本仓库用 Vitest 做无头测试。`yarn dev` 是显式图形启动，不能替代这些测试。

## 下一步

1. 把本文当作编写清单。
2. 产品功能走 Spec Kit：`specs/<NNN-slug>/`。
3. Development Canvas 是第一个正式插件表面：`specs/015-development-canvas/`。
