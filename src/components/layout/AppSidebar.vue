<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useMessage } from "naive-ui";
import { useHistoryStore } from "@/store/history";
import { useSettingsStore } from "@/store/settings";
import AppInfo from "@/AppInfo";
import { useLocale } from "@/composables/useLocale";
import { prefetchRoute, type RoutePrefetchKey } from "@/utils/routePrefetch";
import MdiHistory from "~icons/mdi/history";
import MdiCogOutline from "~icons/mdi/cog-outline";
import MdiClipboardTextOutline from "~icons/mdi/clipboard-text-outline";
import MdiRobotOutline from "~icons/mdi/robot-outline";

const router = useRouter();
const route = useRoute();
const history = useHistoryStore();
const settings = useSettingsStore();
const message = useMessage();
const { t, format } = useLocale();

const rawNavItems = [
  {
    key: "clipboard",
    labelKey: "nav.clipboard",
    fallback: "剪贴板",
    icon: MdiClipboardTextOutline,
    path: "/clipboard",
  },
  {
    key: "history",
    labelKey: "nav.history",
    fallback: "历史记录",
    icon: MdiHistory,
    path: "/history",
  },
  {
    key: "ai-tools",
    labelKey: "nav.ai",
    fallback: "AI 工具",
    icon: MdiRobotOutline,
    path: "/ai",
  },
  {
    key: "settings",
    labelKey: "nav.settings",
    fallback: "设置",
    icon: MdiCogOutline,
    path: "/settings",
  },
] as const satisfies ReadonlyArray<{
  key: string;
  labelKey: string;
  fallback: string;
  icon: any;
  path: RoutePrefetchKey;
}>;

const navItems = computed(() =>
  rawNavItems.map(item => ({
    ...item,
    label: t(item.labelKey, item.fallback),
  }))
);

const activeKey = computed(() => (route.name as string) ?? "clipboard");

function navigate(path: string) {
  if (route.path !== path) {
    router.push(path).catch(error => {
      console.error("导航失败", error);
    });
  }
}

function warmRoute(path: RoutePrefetchKey) {
  prefetchRoute(path);
}

async function updateListening(value: boolean) {
  try {
    await history.setListening(value);
    message.success(
      value
        ? t("nav.recording", "已开启剪贴板监听")
        : t("nav.paused", "已暂停剪贴板监听")
    );
  } catch (error) {
    console.error("更新监听状态失败", error);
    message.error(t("nav.listenError", "无法切换剪贴板监听"));
  }
}

function updateAiConnection(value: boolean) {
  settings.offlineMode = !value;
  message.success(
    value
      ? t("nav.online", "AI 服务已连接")
      : t("nav.offlineEnabled", "AI 服务已断开")
  );
}

const listeningStatusLabel = computed(() =>
  history.listening ? t("nav.recording", "实时监听") : t("nav.paused", "已暂停")
);

const listeningDescription = computed(() =>
  history.listening
    ? t("nav.recordingHint", "自动捕获系统剪贴板内容")
    : t("nav.pausedHint", "暂停后将不会自动保存剪贴板")
);

const aiConnected = computed(() => !settings.offlineMode);

const aiStatusLabel = computed(() =>
  aiConnected.value
    ? t("nav.online", "AI 已连接")
    : t("nav.offlineEnabled", "AI 已断开")
);

const aiStatusDescription = computed(() =>
  aiConnected.value
    ? t("nav.onlineHint", "AI 快捷操作可用")
    : t("nav.offlineHint", "断开后保留本地功能")
);

const versionLabel = computed(() => `${t("settings.version", "版本")} ${AppInfo.version.value}`);

const historyCountLabel = computed(() =>
  format("settings.historyCount", "剪贴板条目 {count}", { count: history.items.length })
);
</script>

<template>
  <aside class="sidebar" data-tauri-drag-region>
    <div class="brand" data-tauri-drag-region>
      <div class="brand-mark">⎋</div>
      <div class="brand-meta">
        <span class="brand-tag">{{ t("nav.tagline", "AI 快捷操作") }}</span>
        <h1>VibeClip Pro</h1>
      </div>
      <span class="version-chip">{{ versionLabel }}</span>
    </div>

    <nav class="nav" data-tauri-drag-region="false">
      <button
        v-for="item in navItems"
        :key="item.key"
        type="button"
        class="nav-item"
        :class="{ active: activeKey === item.key }"
        :data-active="activeKey === item.key"
        :aria-current="activeKey === item.key ? 'page' : undefined"
        @click="navigate(item.path)"
        @mouseenter="warmRoute(item.path)"
        @focus="warmRoute(item.path)"
      >
        <n-icon size="18" :component="item.icon" />
        <span>{{ item.label }}</span>
      </button>
    </nav>

    <div class="control-panel" data-tauri-drag-region="false">
      <div class="control-card">
        <div class="control-text">
          <div class="control-header">
            <span class="control-name">{{ t("nav.clipboardMonitor", "剪贴板监听") }}</span>
            <span class="control-state" :class="{ active: history.listening }">
              {{ listeningStatusLabel }}
            </span>
          </div>
          <p>{{ listeningDescription }}</p>
        </div>
        <n-switch
          size="small"
          :value="history.listening"
          @update:value="updateListening"
        />
      </div>

      <div class="control-card">
        <div class="control-text">
          <div class="control-header">
            <span class="control-name">{{ t("nav.aiServices", "AI 服务") }}</span>
            <span class="control-state" :class="{ active: aiConnected }">
              {{ aiStatusLabel }}
            </span>
          </div>
          <p>{{ aiStatusDescription }}</p>
        </div>
        <n-switch
          size="small"
          :value="aiConnected"
          @update:value="updateAiConnection"
        />
      </div>
    </div>

    <footer class="footer" data-tauri-drag-region="false">
      <span>{{ historyCountLabel }}</span>
      <span class="muted">{{ t("nav.deviceReady", "准备就绪") }}</span>
    </footer>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border-radius: calc(var(--vibe-radius-xl) - 6px);
  background: color-mix(in srgb, var(--vibe-panel-surface) 92%, rgba(255, 255, 255, 0.12));
  border: 1px solid color-mix(in srgb, var(--vibe-panel-border) 45%, transparent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
  position: sticky;
  top: 0;
  z-index: 20;
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-app-region: drag;
}

.brand {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.brand-mark {
  width: 32px;
  height: 32px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 16px;
  color: #fff;
  background: linear-gradient(135deg, var(--vibe-accent), var(--vibe-accent-strong));
  -webkit-app-region: no-drag;
}

.brand-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.brand-meta h1 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.brand-tag {
  font-size: 10px;
  color: var(--vibe-text-muted);
}

.version-chip {
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--vibe-control-bg);
  font-size: 11px;
  color: var(--vibe-text-secondary);
  -webkit-app-region: no-drag;
}

.nav {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.nav-item {
  border: none;
  border-radius: var(--vibe-radius-md);
  padding: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  background: color-mix(in srgb, var(--vibe-control-bg) 95%, rgba(255, 255, 255, 0.05));
  color: var(--vibe-text-secondary);
  cursor: pointer;
  position: relative;
  z-index: 0;
  overflow: hidden;
  isolation: isolate;
  transition:
    transform 180ms var(--vibe-transition),
    color 160ms ease,
    background 200ms ease,
    box-shadow 220ms var(--vibe-transition);
  -webkit-app-region: no-drag;
}

.nav-item::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(120% 120% at 50% 50%, rgba(81, 97, 255, 0.18), transparent 65%);
  opacity: 0;
  transform: scale(0.92);
  transition:
    opacity 220ms var(--vibe-transition),
    transform 220ms var(--vibe-transition);
  z-index: -1;
}

.nav-item:hover {
  background: color-mix(in srgb, var(--vibe-control-hover) 90%, rgba(255, 255, 255, 0.06));
  transform: translateY(-1px);
}

.nav-item:hover::after,
.nav-item:focus-visible::after {
  opacity: 1;
  transform: scale(1);
}

.nav-item.active {
  background: linear-gradient(135deg, var(--vibe-accent), var(--vibe-accent-strong));
  color: var(--vibe-nav-text-active);
  box-shadow: 0 12px 28px rgba(62, 88, 255, 0.16);
  animation: nav-activate 420ms cubic-bezier(0.33, 1, 0.68, 1);
}

.nav-item:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--vibe-accent) 58%, transparent);
  outline-offset: 2px;
}

.nav-item:active {
  transform: translateY(0);
  box-shadow: none;
}

.nav-item span {
  font-size: 10px;
  font-weight: 600;
}

.control-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.control-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px;
  border-radius: calc(var(--vibe-radius-lg) - 2px);
  background: color-mix(in srgb, var(--vibe-panel-surface-strong) 94%, rgba(255, 255, 255, 0.14));
  border: 1px solid color-mix(in srgb, var(--vibe-panel-border) 42%, transparent);
  -webkit-app-region: no-drag;
  transition:
    transform 200ms var(--vibe-transition),
    border-color 180ms ease,
    background 200ms ease;
}

.control-card:hover,
.control-card:focus-within {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--vibe-accent) 24%, transparent);
  background: color-mix(in srgb, var(--vibe-panel-surface-strong) 98%, rgba(255, 255, 255, 0.18));
}

.control-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.control-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.control-name {
  font-weight: 600;
  font-size: 11px;
  color: var(--vibe-text-primary);
}

.control-state {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  background: var(--vibe-control-bg);
  color: var(--vibe-text-secondary);
}

.control-state.active {
  background: var(--vibe-accent);
  color: var(--vibe-nav-text-active);
}

.control-text p {
  margin: 0;
  font-size: 10px;
  color: var(--vibe-text-muted);
  line-height: 1.3;
}

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  color: var(--vibe-text-secondary);
}

.muted {
  color: var(--vibe-text-muted);
}

@media (min-width: 460px) {
  .nav {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@keyframes nav-activate {
  0% {
    transform: translateY(4px) scale(0.96);
  }

  60% {
    transform: translateY(-4px) scale(1.02);
  }

  100% {
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nav-item,
  .nav-item::after,
  .control-card,
  .control-card:hover,
  .control-card:focus-within {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    transform: none !important;
    box-shadow: none !important;
  }
}
</style>
