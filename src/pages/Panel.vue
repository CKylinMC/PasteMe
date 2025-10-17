<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useHistoryStore } from "@/store/history";
import { useSettingsStore } from "@/store/settings";
import { useMessage } from "naive-ui";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

const history = useHistoryStore();
const settings = useSettingsStore();
const message = useMessage();

const items = computed(() => history.filteredItems.slice(0, 6));

async function copyItem(id: number) {
  const item = history.items.find(entry => entry.id === id);
  if (!item) return;
  await history.copyClip(item);
  message.success("已复制到剪贴板");
}

async function pasteAndClose(id: number) {
  await copyItem(id);
  const current = getCurrentWebviewWindow();
  await current.hide();
}

onMounted(async () => {
  await settings.bootstrap();
  await history.syncStatus();
  if (!history.items.length) {
    await history.refresh();
  }
});
</script>

<template>
  <div class="panel">
    <header class="panel-header">
      <h2>VibeClip Pro</h2>
      <p class="muted">最近剪贴板 · 快速粘贴</p>
    </header>
    <main class="panel-body">
      <n-scrollbar style="max-height: 360px;">
        <n-list hoverable>
          <n-list-item v-for="item in items" :key="item.id" class="clip-item">
            <div class="clip-meta">
              <h3>{{ item.preview ?? item.content.slice(0, 60) }}</h3>
              <p>{{ new Date(item.updatedAt).toLocaleTimeString() }}</p>
            </div>
            <div class="clip-actions">
              <n-button size="tiny" secondary @click="copyItem(item.id)">复制</n-button>
              <n-button size="tiny" type="primary" @click="pasteAndClose(item.id)">粘贴</n-button>
            </div>
          </n-list-item>
        </n-list>
      </n-scrollbar>
    </main>
    <footer class="panel-footer">
      <span>Ctrl / Cmd + Shift + V</span>
      <span>共 {{ history.items.length }} 条记录</span>
    </footer>
  </div>
</template>

<style scoped>
.panel {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
  background: rgba(22, 27, 45, 0.86);
  color: rgba(255, 255, 255, 0.92);
}

.panel-header h2 {
  margin: 0;
  font-size: 20px;
}

.panel-header .muted {
  margin: 6px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.panel-body {
  flex: 1;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 12px;
}

.clip-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.clip-item h3 {
  margin: 0;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.92);
}

.clip-item p {
  margin: 4px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.clip-actions {
  display: flex;
  gap: 8px;
}

.panel-footer {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}
</style>
