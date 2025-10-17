// 快速检查脚本
console.log("检查关键文件...");

const fs = require('fs');
const path = require('path');

const files = [
    'src/main.ts',
    'src/pages/Clipboard.vue',
    'src/pages/Favorites.vue',
    'src/pages/AiTools.vue',
    'src/pages/Settings.vue',
    'src/components/ai/AiQuickActions.vue'
];

files.forEach(file => {
    const fullPath = path.join(__dirname, file);
    if (fs.existsSync(fullPath)) {
        console.log(`✓ ${file} 存在`);
    } else {
        console.log(`✗ ${file} 不存在!`);
    }
});

console.log("\n所有文件检查完成。");
console.log("\n建议执行:");
console.log("1. 停止当前开发服务器 (Ctrl+C)");
console.log("2. 清理缓存: rm -rf node_modules/.vite dist");
console.log("3. 重新启动: pnpm tauri dev");

