# Agent Note：原生 Windows x64 NSIS 测试安装包

状态：已实现

[English](2026-08-15-windows-local-nsis-installer.md) | 中文

## 决策

DSH Desktop 提供 `yarn dist:win` 作为原生 Windows x64 打包命令。它会先执行 build、全部 TypeScript compiler face、Windows 可运行的打包与原生 shell 聚焦测试，以及 runtime-closure verifier，再让 Electron Builder 为版本 `2.0.0` 创建 NSIS 安装向导。POSIX 执行测试仍由跨平台 CI suite 持有，不会阻塞原生 Windows 打包。安装器支持当前用户安装和提升权限后的所有用户安装、可选安装目录，以及开始菜单和桌面快捷方式。稳定的 application ID 仍是 NSIS 的升级身份。

该命令会拒绝非 Windows 与非 x64 宿主，并要求使用官方 runtime 仍包含 Corepack 的 Node 22.19+ 或 Node 24.x。它会移除 Windows 证书变量，在保留 Windows resource editing 的同时关闭 executable signing，关闭发布，并关闭 Electron Builder 的通用原生重建。`node-pty` 会提供 Windows x64 Node-API 二进制，因此构建安装包不依赖 Python 或 Visual Studio C++ Build Tools。生成的安装包用于本地安装和原生 smoke 测试；它不是 Authenticode release，也不会建立 SmartScreen 信誉。

## 产物校验

Electron Builder 现有的 `afterPack` hook 会在 NSIS 封装前校验 application archive、物理 runtime tree 与必需的 Windows x64 `node-pty` prebuild。打包完成后，第二个 gate 会要求准确版本的安装器与 `win-unpacked/DSH Desktop.exe` 存在，验证两者都是非空普通文件，并检查其 DOS `MZ` 与 Windows `PE\0\0` signature。其他版本遗留的安装包无法通过该 gate。

## 原生发布边界

Windows 打包必须使用原生 Windows x64 dependency installation，从而让 Koffi 等平台 package 解析到 Windows variant。安装器 UI、升级与卸载、Mica、托盘终端、Windows ACL sandbox、console window 抑制、Authenticode 与 SmartScreen 仍是 Windows 机器上的验证 gate。未来的签名命令必须使用独立的证书 preflight，并校验安装器、卸载器与应用程序签名，而不能削弱这个未签名命令。
