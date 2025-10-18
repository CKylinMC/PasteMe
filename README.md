# VibeClip Pro

> VibeClip Pro 是一款面向创作者与效率爱好者的跨平台剪贴板控制台，整合本地历史、AI 快捷操作与深色/浅色视觉体系，让“复制 → 处理 → 粘贴”变成一次呼吸间的流程。

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Built with Tauri](https://img.shields.io/badge/Desktop-Tauri%202-blue.svg)](https://tauri.app)
[![Vue 3](https://img.shields.io/badge/Web-Vue%203-42b983.svg)](https://vuejs.org)

<div align="center">
  <svg width="520" height="240" viewBox="0 0 520 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="bg" x1="0%" x2="100%" y1="0%" y2="100%">
        <stop stop-color="#f6f8ff" offset="0%"/>
        <stop stop-color="#e7fbff" offset="55%"/>
        <stop stop-color="#f1f4ff" offset="100%"/>
      </linearGradient>
      <linearGradient id="card" x1="0%" x2="100%" y1="0%" y2="100%">
        <stop stop-color="#ffffff" stop-opacity="0.92" offset="0%"/>
        <stop stop-color="#f3f6ff" stop-opacity="0.95" offset="100%"/>
      </linearGradient>
    </defs>
    <rect width="520" height="240" rx="28" fill="url(#bg)"/>
    <rect x="32" y="36" width="140" height="168" rx="22" fill="#4c6ef5" fill-opacity="0.92"/>
    <text x="52" y="86" font-family="Inter, sans-serif" font-size="18" fill="#ffffff">VibeClip</text>
    <text x="52" y="112" font-family="Inter, sans-serif" font-size="12" fill="#d7e0ff">Pro · History</text>
    <rect x="196" y="48" width="280" height="68" rx="18" fill="url(#card)" stroke="#dfe3ff" stroke-opacity="0.5"/>
    <text x="218" y="78" font-family="Inter, sans-serif" font-size="14" fill="#1c2340">系统剪贴板 · 文本</text>
    <text x="218" y="96" font-family="Inter, sans-serif" font-size="11" fill="#6470a3">按一次即可保存到历史</text>
    <rect x="196" y="136" width="280" height="68" rx="18" fill="url(#card)" stroke="#dfe3ff" stroke-opacity="0.5"/>
    <text x="218" y="166" font-family="Inter, sans-serif" font-size="14" fill="#1c2340">AI 快捷操作 · 翻译 / 摘要 / JSON 化</text>
    <text x="218" y="184" font-family="Inter, sans-serif" font-size="11" fill="#6470a3">Ctrl+Shift+V 呼出 · 支持离线模式切换</text>
  </svg>
</div>

## 目录

- [✨ 主要特性](#-主要特性)
- [🚀 快速开始](#-快速开始)
- [🖥️ 菜单与界面概览](#️-菜单与界面概览)
- [🤖 AI 快速处理指南](#-ai-快速处理指南)
- [🛠️ 开发者常用命令](#️-开发者常用命令)
- [📦 发布流程（v1.4.2 准备）](#-发布流程v142-准备)
- [📚 额外资料](#-额外资料)
- [📄 许可](#-许可)

## ✨ 主要特性

- **连续剪贴板捕获**：后台监听器以 250~400 ms 节流轮询系统剪贴板，自动保存文本、图像（Base64）与文件路径，并支持来源黑名单过滤、内容哈希去重。
- **四大核心页面**：首页总览、实时剪贴板、历史记录与 AI 工具，侧边栏快捷切换，搭配毛玻璃卡片化视觉。
- **AI 快捷操作**：内置翻译、摘要、润色与 JSON 化能力，支持自定义 Prompt；结果可复制、写回历史或同步到系统剪贴板。
- **AI 快捷按钮库**：在设置页开启/关闭快捷指令，调整默认语言或 Prompt 模板，并新增自定义动作与说明。
- **右键快捷菜单**：在历史记录中右键即可复制、收藏、置顶或直接触发 AI 翻译/摘要/润色，让日常操作更顺手。
- **内联剪贴板编辑器**：在剪贴板卡片直接修改文本并一键写回系统，无需离开应用即可完成调整。
- **运行偏好自定义**：去重、容量与保留天数、来源黑名单、日志等级、离线模式、开机自启等设置一应俱全。
- **系统级控制**：默认全局快捷键 `Ctrl+Shift+V` 呼出浮动面板，托盘菜单支持显示/隐藏、暂停监听、切换离线模式。
- **跨平台桌面应用**：基于 Tauri 2 + Vue 3，Rust 端封装数据库与系统能力，前端调用 `invoke` 即可完成交互。

## 🚀 快速开始

```bash
pnpm install                # 安装依赖
pnpm dev                    # 启动 Vite 开发服务器
pnpm tauri dev              # 启动桌面端调试（会同时跑前端）
```

> **提示**：项目使用 `pnpm` 进行包管理，如需生成锁文件请执行 `pnpm install`。Windows 用户可直接运行 `pnpm i && pnpm tauri dev` 完成安装与桌面调试。

## 🖥️ 菜单与界面概览

| 菜单 | 说明 |
| --- | --- |
| **首页** | 欢迎横幅、系统状态和最近历史的概览，提供入口快速跳转到四大功能。 |
| **剪贴板** | 实时展示最新捕获内容，可一键保存、置顶、收藏或执行 AI 快捷操作。 |
| **历史记录** | 支持类型筛选、关键字搜索、分页加载，文本/图像/文件均有对应操作与预览。 |
| **AI 工具** | 集成输入区、AI 快捷操作卡片与输出结果区，支持复制、保存与粘贴回系统。 |
| **设置** | 覆盖主题、快捷键、AI 接口配置、运行参数、导入导出等项目级偏好。 |

界面遵循统一的渐变与毛玻璃风格，卡片圆角、阴影与留白在 4 个页面之间保持一致，可在深浅色主题间自动切换。

## 🤖 AI 快速处理指南

1. 在 **设置** 菜单配置 OpenAI 兼容的 `API Base URL` 与 `API Key`，默认已内置 [FreeAPI](https://api.freekey.site) 端点与 `gemini-2.5-flash` 模型，可直接替换为自己的 Key。
2. 返回 **AI 工具** 页面，在输入区粘贴文本或使用“粘贴剪贴板”按钮快速导入当前剪贴板内容。
3. 在右侧 **AI 快捷操作** 卡片选择动作（翻译、摘要、润色、JSON、自定义）与目标语言/Prompt。
4. 点击“执行”后，结果会显示在输出区域，并可一键复制或保存到历史列表。
5. 若未配置 API Key，系统会引导跳转到设置页；离线模式下会阻止调用并给出提示。

以上逻辑已在 v1.4.2 版本中完成校验，替换为您的 API Key 便可体验 AI 功能与右键快捷动作。

## 🛠️ 开发者常用命令

| 场景 | 命令 |
| --- | --- |
| 安装依赖 | `pnpm install` |
| 前端热更新 | `pnpm dev` |
| 桌面调试 | `pnpm tauri dev` |
| 类型检查 | `pnpm lint` |
| 生产构建 | `pnpm build` |

Rust 端命令位于 `src-tauri/`，例如 `cargo check`、`cargo fmt` 等；数据库、托盘、剪贴板等系统能力均封装在 `src-tauri/src` 内的模块中。

## 📦 发布流程（v2.2.1 准备）

1. 核对版本号（已同步 `package.json`、Tauri 配置、`Cargo.toml`/`Cargo.lock` 与 `AppInfo.ts` 至 **2.2.1**）。
2. 构建产物：
   ```bash
   pnpm build
   pnpm tauri build
   ```
   - `pnpm build` 产出的前端静态资源位于 `dist/`，供调试浮窗或 Web 预览使用。
   - `pnpm tauri build` 会在 `src-tauri/target/release/bundle/` 下生成安装包与签名，需要宿主机已安装 `glib-2.0` 等系统依赖。
3. 创建发布分支与标签：
   ```bash
   git checkout -b release/v2.2.1
   git push -u origin release/v2.2.1
   git tag -a v2.2.1 -m "VibeClip Pro v2.2.1"
   git push origin v2.2.1
   ```
4. 在 GitHub Release 页面撰写更新摘要（建议突出 AI 快捷按钮库、剪贴板即时编辑、历史统计卡片与托盘新增指令等要点），并上传与 PasteMe 一致的资产：
   - `latest.json`
   - Windows 安装包 `VibeClip_2.2.1_x64-setup.exe` 与对应 `.sig`
   - Windows MSI 包 `VibeClip_2.2.1_x64.msi` 与对应 `.sig`
   - `Source code (zip)`、`Source code (tar.gz)`
   如需 macOS / Linux 安装包，可在本地增加 `--target` 参数构建后同步上传。

## 📚 额外资料

- [PasteMe 对标差异清单](docs/paste-me-gap-analysis.md)：追踪与 PasteMe 功能差异的对照表。

## 📄 许可

- 代码遵循 [MIT License](LICENSE)。
- 集成的第三方服务（如 OpenAI 或兼容接口）请遵守各自的使用条款。
