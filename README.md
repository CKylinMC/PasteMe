# VibeClip Pro

> VibeClip Pro 是一款面向创作者与效率爱好者的跨平台剪贴板控制台，整合本地历史、AI 快捷操作与深色/浅色视觉体系，让 "复制 → 处理 → 粘贴" 变成一次呼吸间的流程。

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

## 功能亮点

- **连续剪贴板捕获**：后台监听器以 250~400 ms 节流轮询系统剪贴板，自动保存文本、图像（Base64）与文件路径，并支持来源黑名单过滤与内容哈希去重。
- **历史体验升级**：内置筛选（全部 / 文本 / 图像 / 文件）、关键字前缀搜索、虚拟滚动与分页「加载更多」，图片仍保持懒加载，长列表依旧顺滑。
- **AI 右键菜单**：历史文本右键即可翻译 / 摘要 / 润色，结果支持复制或写回历史，未配置 API Key 时提示跳转设置且不阻塞其他操作。
- **多入口导航**：全新侧栏整合「剪贴板 / 历史记录 / 收藏 / AI 工具 / 设置」，与窗口拖拽、托盘操作保持连贯。
- **运行偏好自定义**：设置页提供去重开关、容量与保留天数、来源黑名单、日志等级（info/debug）与 VACUUM 清理。
- **两种主题 / 自定义行距**：220 px 渐变侧栏 + 卡片化主界面，浅色与深色自动切换，字体、圆角、过渡统一调性。
- **系统级控制**：默认全局快捷键 `Ctrl+Shift+V`，托盘可一键显示/隐藏、暂停监听或切换离线模式，关于页展示运行时版本号。
- **导入导出**：JSON 备份/恢复历史，保留 `id`、`kind`、`timestamp` 信息，便于跨设备迁移。

## PasteMe 对标追踪

`v1.3.4` 开发周期内，我们整理了与 PasteMe 的差异条目，方便逐项补齐：

- [PasteMe 对标差异清单](docs/paste-me-gap-analysis.md)

## 快速开始

```bash
pnpm install
pnpm dev        # Vite 前端调试（自动复用 pnpm exec）
pnpm tauri dev  # Tauri 桌面端调试
```

> **提示**：项目默认使用 `pnpm`。如需生成锁文件，请执行 `pnpm install` 以创建 `pnpm-lock.yaml`。

> **Windows 快速启动**：克隆仓库后执行 `pnpm i && pnpm tauri dev` 即可一次完成依赖安装与桌面端调试。

## 核心工作流

### 剪贴板历史

- 面板自动记录新内容；在暂停模式下仍可手动保存当前系统剪贴板。
- 列表支持 `全部 / 置顶 / 收藏 / 文本 / 图像 / 文件` 六种筛选。
- 每项提供复制、粘贴、置顶、收藏与删除动作，图像项以 DataURL 方式回显；底部支持分页「加载更多」。

### AI 快捷操作

1. 在首页卡片或浮动面板粘贴内容；
2. 选择动作（翻译/摘要/润色/JSON/自定义）；
3. 配置语言与 Prompt；
4. 结果自动写入历史与系统剪贴板。

### 系统集成

- 托盘菜单：显示/隐藏窗口、暂停监听、开启离线模式、退出。
- 自动启动：调用 Tauri Autostart 插件（macOS LaunchAgent、Windows Registry）。
- 键盘：`Ctrl+Shift+V` 呼出面板；`Esc` 关闭浮动窗；`F12` 调试工具。

## 技术栈 & 体积优化

- **前端**：Vue 3 + Pinia + Vue Router + Naive UI（按需加载）+ Iconify（自动导入）。
- **桌面**：Tauri 2 + Rust（rusqlite、reqwest、tracing），SQLite WAL 模式保障并发。
- **优化策略**：
  - 仅在需要时调用 AI；离线模式直接短路。
  - 所有图像以 Base64 文本存储，避免额外文件读写。
  - `vite.config.ts` 配置 alias `@` 指向 `src`，保证按需构建。
  - Rust 端集中封装数据库命令，前端调用 `invoke` 即可；`reqwest` 使用 `rustls` 禁用系统 OpenSSL 依赖。

## 开发命令

| 场景 | 命令 |
|------|------|
| 安装依赖 | `pnpm install` |
| 前端热更新 | `pnpm dev` |
| 桌面调试 | `pnpm tauri dev` |
| 类型检查 | `pnpm lint` |
| 生产构建 | `pnpm build` |

## 发布流程

```bash
pnpm build
pnpm tauri build
```

生成的安装包位于 `src-tauri/target/release/bundle`。发布建议：

1. 创建 `release/v1.3.4` 分支并推送：
   ```bash
   git checkout -b release/v1.3.4
   git push -u origin release/v1.3.4
   git tag -a v1.3.4 -m "VibeClip Pro v1.3.4"
   git push origin v1.3.4
   ```
2. 新建 GitHub Release：
   - **Title**：`VibeClip Pro v1.3.4`
   - **Highlights**：恢复剪贴板监听模块编译、清理 Rust 警告、统一版本号并验证 `pnpm tauri dev`。
   - **Assets**：`*.msi`、`*.dmg`、`latest.json` 等。
   - **Screenshots**：可附上本文档中的 SVG 预览或自行截取界面。

## 许可

- 代码遵循 [MIT License](LICENSE)。
- 第三方服务（例如 OpenAI）请遵守各自使用条款。
