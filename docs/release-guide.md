# VibeClip Pro v2.1.0 发布检查清单

## 发布前验证
- 执行 `pnpm lint`，确保 Vue + TypeScript 代码通过严格类型检查。
- 执行 `pnpm build`，生成将被 Tauri 打包的生产版前端资源。
- （可选）执行 `pnpm tauri dev`，确认桌面外壳在开发模式下一切正常。首次启动会等待 `beforeDevCommand`（`pnpm dev`）完成，因此可能需要一分钟左右才会出现窗口。

## 构建安装程序
- Windows：提前安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（含 MSVC、Windows 10/11 SDK）与 [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)。
- Linux：安装 GTK/GLib 运行时（如 `libgtk-3-dev`、`libglib2.0-dev`、`libappindicator3-dev` 等）及打包所需依赖。
- 在具备桌面依赖的环境中执行 `pnpm tauri build`。命令会一次性生成 Windows `setup.exe`（NSIS 安装包）与 `.msi`，以及 Linux `.deb` / `.rpm` 包。
- 检查生成的安装包体积保持在 100 MB 以内，并完成基本的安装与启动冒烟测试。

## 发布
- 创建并推送标签（`git tag v2.1.0 && git push origin v2.1.0`）。
- 上传构建产物并更新变更日志、发布说明。
- 对外公告版本上线，指导用户下载安装。
