# Agent Note：打包 profile 的物理 fallback

状态：已实现

[English](2026-08-15-packaged-profile-fallback.md) | 中文

## 问题

DSH profile 插件通过 `$DSH_HOME/profiles/node_modules` 下的符号链接解析安装内置包。打包后的 Electron 进程可以通过虚拟 `app.asar` 文件系统直接读取文件，但操作系统符号链接无法进入该虚拟归档。若把逻辑打包 manifest 作为安装锚点，就会生成在 Loader 激活 Web bundle 前以 `ENOTDIR` 失败的链接。

## 决策

Electron Builder 将 desktop deployment manifest、Cordis patch、运行时模块与资产，以及 `node_modules` 一起解包。Desktop Host 在调用 `healProfilesModuleFallback` 前，把安装锚点从 `app.asar/package.json` 映射到 `app.asar.unpacked/package.json`；普通源码与 npm 启动仍保留原有物理路径。Packaged-runtime hook 会在签名前同时要求物理 manifest、desktop 插件子路径与原生资产，以及运行时依赖哨兵存在。

## 验证

聚焦测试覆盖 ASAR 路径映射、打包声明，以及缺少物理 manifest 或 desktop 插件子路径时拒绝产物。随后未封装产物门禁验证真实的 `app.asar.unpacked` 树；packaged profile-resolution smoke 使用私有 Harness home，证明生成的 fallback 链接在发布前就能解析到物理 package 目录。

## 备选方案

**继续让 profile 链接指向 `app.asar`。** Electron 可以直接读取 ASAR 路径，但 Node 通过操作系统链接访问 profile 依赖时，该归档路径不是真实目录。

**只复制两个 profile bundle package。** 第三方插件可能使用 deployment closure 中任意位置的 peer 或 provider；不完整的 fallback 会在其他插件组合下再次产生解析失败。

**关闭 ASAR。** 这能避免虚拟路径，但会放弃既有打包布局，以及不需要物理执行的代码所使用的完整性边界。

## 结果

物理 desktop package 会在解包依赖树旁保留一份副本。每次启动都能修复由旧安装位置遗留的链接，而不会修改所选 profile 的 manifest 或 patch layer。如果根锚点或必需运行时入口缺失，打包会在签名前失败。
