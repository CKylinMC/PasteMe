# PasteMe!

让AI辅助你复制和粘贴！

------

## 这是什么？

一个剪贴板工具，可以让你通过AI辅助你复制和粘贴。原本是一直在等PowerToys的AdvancedPaste的自定义端点功能，但是苦等这么久也没出，干脆自己试着做一个。熬夜做出来的，可能有很多问题，欢迎提issue。

## 如何使用？

### 基本功能

1. 按下快捷键（默认 `Ctrl+Shift+V`）呼出面板
2. 面板将显示当前剪贴板内容的预览
3. 选择需要的功能：
   - 统计：查看文本的字符数、行数等统计信息
   - 编辑：直接修改剪贴板内容
   - 转为纯文本：清除格式，保留纯文本

### AI 功能

需要先在设置中启用 AI 功能并配置 API Key。

- 转为 JSON：AI 将帮你把内容转换为 JSON 格式
- 询问 AI：让 AI 分析或解答关于剪贴板内容的问题
- AI 创作：基于剪贴板内容，让 AI 继续创作

### 快捷操作

- `Esc`：关闭面板
- `Backspace`：返回主菜单
- `↑/↓`：键盘导航菜单
- `Enter`：选择当前菜单项
- 点击托盘图标：显示设置窗口
- 最小化设置窗口：自动隐藏到托盘

### 设置说明

1. 全局配置
   - 开机自启：设置是否随系统启动
   - 全局快捷键：自定义呼出面板的快捷键

2. AI 配置
   - AI 功能开关：是否启用 AI 相关功能
   - API Key：OpenAI 或兼容服务的密钥
   - 服务端点：API 服务器地址
   - AI 模型：使用的模型名称

## 提示

- 面板会跟随鼠标位置显示
- 可以通过托盘图标右键菜单退出程序
- AI 功能需要稳定的网络连接


