<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useHistoryStore } from "@/store/history";
import { useSettingsStore } from "@/store/settings";
import AppInfo from "@/AppInfo";
import MdiHistory from "~icons/mdi/history";
import MdiCogOutline from "~icons/mdi/cog-outline";
import MdiClipboardTextOutline from "~icons/mdi/clipboard-text-outline";
import MdiRobotOutline from "~icons/mdi/robot-outline";
import MdiPauseCircleOutline from "~icons/mdi/pause-circle-outline";
import MdiPlayCircleOutline from "~icons/mdi/play-circle-outline";
import MdiCloudOffOutline from "~icons/mdi/cloud-off-outline";
import MdiCloudCheckOutline from "~icons/mdi/cloud-check-outline";

const router = useRouter();
const route = useRoute();
const history = useHistoryStore();
const settings = useSettingsStore();

const navItems = [
  { key: "clipboard", label: "剪贴板", icon: MdiClipboardTextOutline, path: "/clipboard" },
  { key: "history", label: "历史记录", icon: MdiHistory, path: "/history" },
  { key: "ai-tools", label: "AI 工具", icon: MdiRobotOutline, path: "/ai" },
  { key: "settings", label: "设置 / 关于", icon: MdiCogOutline, path: "/settings" },
];

const activeKey = computed(() => (route.name as string) ?? "history");

function navigate(path: string) {
  if (route.path !== path) {
    router.push(path);
  }
}

async function toggleListening() {
  await history.setListening(!history.listening);
}

async function toggleOffline() {
  settings.offlineMode = !settings.offlineMode;
}
</script>

<template>
  <aside class="sidebar" data-tauri-drag-region>
    <div class="brand">
      <div class="brand-icon">⎋</div>
      <div class="brand-meta">
        <h1>VibeClip Pro</h1>
        <p>精致而冷静的剪贴板伴侣</p>
      </div>
    </div>
    <nav class="sidebar-nav">
      <button
        v-for="item in navItems"
        :key="item.key"
        :class="['nav-item', activeKey === item.key ? 'active' : '']"
        @click="navigate(item.path)"
      >
        <n-icon size="18" :component="item.icon" />
        <span>{{ item.label }}</span>
      </button>
    </nav>
    <div class="sidebar-actions">
      <div class="action-row">
        <div class="action-meta">
          <p class="action-title">监听剪贴板</p>
          <span class="action-desc">
            <n-icon size="14" :component="history.listening ? MdiPlayCircleOutline : MdiPauseCircleOutline" />
            {{ history.listening ? '实时记录' : '暂停中' }}
          </span>
        </div>
        <n-switch :value="history.listening" @update:value="toggleListening" size="small" />
      </div>
      <div class="action-row">
        <div class="action-meta">
          <p class="action-title">离线模式</p>
          <span class="action-desc">
            <n-icon size="14" :component="settings.offlineMode ? MdiCloudOffOutline : MdiCloudCheckOutline" />
            {{ settings.offlineMode ? '已断开 AI 服务' : '连接服务' }}
          </span>
        </div>
        <n-switch :value="settings.offlineMode" @update:value="toggleOffline" size="small" />
      </div>
    </div>
    <footer class="sidebar-footer">
      <span>版本 {{ AppInfo.version }}</span>
      <span class="muted">剪贴板条目 {{ history.items.length }}</span>
    </footer>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 220px;
  padding: 28px 24px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: var(--vibe-sidebar-bg);
  color: var(--vibe-sidebar-text);
  border-top-right-radius: var(--vibe-radius-xl);
  border-bottom-right-radius: var(--vibe-radius-xl);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
  -webkit-app-region: drag;
}

.brand {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px;
}

.brand-icon {
  width: 52px;
  height: 52px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.18);
  display: grid;
  place-items: center;
  font-size: 24px;
  font-weight: 700;
  color: #ffffff;
}

.brand-meta h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}

.brand-meta p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--vibe-sidebar-muted);
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 12px;
  -webkit-app-region: no-drag;
}

.nav-item {
  border: none;
  background: transparent;
  color: inherit;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: var(--vibe-radius-md);
  font-size: 14px;
  transition: background var(--vibe-transition), transform var(--vibe-transition);
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.18);
  transform: translateX(2px);
}

.nav-item.active {
  background: rgba(255, 255, 255, 0.28);
  box-shadow: 0 8px 18px rgba(12, 27, 56, 0.18);
}

.sidebar-actions {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: auto;
  padding-top: 32px;
  -webkit-app-region: no-drag;
}

.action-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: rgba(255, 255, 255, 0.14);
  border-radius: var(--vibe-radius-lg);
  padding: 12px 16px;
}

.action-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.action-desc {
  font-size: 12px;
  color: var(--vibe-sidebar-muted);
}

.sidebar-footer {
  margin-top: 32px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--vibe-sidebar-muted);
  -webkit-app-region: no-drag;
}

.sidebar-footer .muted {
  opacity: 0.85;
}
</style>
