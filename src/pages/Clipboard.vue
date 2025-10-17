<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useMessage } from "naive-ui";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import AppSidebar from "@/components/layout/AppSidebar.vue";
import HistoryItem from "@/components/history/HistoryItem.vue";
import AiQuickActions from "@/components/ai/AiQuickActions.vue";
import { useHistoryStore } from "@/store/history";
import { useSettingsStore } from "@/store/settings";
import type { AiActionKind } from "@/types/history";

const history = useHistoryStore();
const settings = useSettingsStore();
const message = useMessage();

const clipboardPreview = ref("");
const capturing = ref(false);

const recentItems = computed(() => history.items.slice(0, 8));

function reportError(label: string, error: unknown) {
  console.error(label, error);
  const detail = error instanceof Error ? error.message : String(error ?? "");
  message.error(`${label}${detail ? `：${detail}` : ""}`);
}

async function syncClipboard() {
  try {
    capturing.value = true;
    clipboardPreview.value = await readText();
  } catch (error) {
    reportError("同步系统剪贴板失败", error);
  } finally {
    capturing.value = false;
  }
}

async function saveClipboard() {
  if (!clipboardPreview.value.trim()) {
    message.info("当前剪贴板为空");
    return;
  }
  try {
    await history.captureText(clipboardPreview.value);
    message.success("已保存到历史");
  } catch (error) {
    reportError("保存剪贴板失败", error);
  }
}

async function handleCopy(item: (typeof history.items)[number]) {
  try {
    await history.copyClip(item);
    message.success("已写入系统剪贴板");
  } catch (error) {
    reportError("复制失败", error);
  }
}

async function handlePin(item: (typeof history.items)[number]) {
  try {
    await history.updateFlags(item.id, { pinned: !item.isPinned });
  } catch (error) {
    reportError("更新置顶状态失败", error);
  }
}

async function handleFavorite(item: (typeof history.items)[number]) {
  try {
    await history.updateFlags(item.id, { favorite: !item.isFavorite });
  } catch (error) {
    reportError("更新收藏状态失败", error);
  }
}

async function handleRemove(item: (typeof history.items)[number]) {
  try {
    await history.removeClip(item.id);
    message.success("已删除");
  } catch (error) {
    reportError("删除失败", error);
  }
}

async function handleAiRun(payload: {
  action: AiActionKind;
  input: string;
  language: string;
  customPrompt?: string;
}) {
  if (!settings.apiKey) {
    message.error("请先在设置中配置 OpenAI 兼容接口 Key");
    return;
  }
  try {
    await history.runAiAction({
      action: payload.action,
      input: payload.input,
      language: payload.language,
      customPrompt: payload.customPrompt,
      apiKey: settings.apiKey,
      baseUrl: settings.apiBaseUrl,
      model: settings.model,
      temperature: settings.temperature,
    });
    message.success("AI 操作已完成并写入剪贴板");
  } catch (error) {
    reportError("AI 操作失败", error);
  }
}

onMounted(async () => {
  if (!history.items.length) {
    try {
      await history.refresh();
    } catch (error) {
      reportError("加载历史记录失败", error);
    }
  }
  await syncClipboard();
});
</script>

<template>
  <div class="clipboard-page">
    <AppSidebar />
    <section class="main">
      <header class="page-header">
        <div>
          <h1>剪贴板中心</h1>
          <p>查看系统剪贴板并快速保存或调用历史记录</p>
        </div>
        <n-button size="small" secondary :loading="capturing" @click="syncClipboard">刷新剪贴板</n-button>
      </header>

      <div class="clipboard-grid">
        <article class="clipboard-card">
          <header>
            <h2>当前剪贴板</h2>
            <p>上次同步后捕获的文本内容</p>
          </header>
          <div class="clipboard-preview">
            <p v-if="clipboardPreview" class="preview-text">{{ clipboardPreview }}</p>
            <p v-else class="placeholder">暂无文本内容，可使用 Ctrl+C 复制后刷新查看。</p>
          </div>
          <footer class="clipboard-actions">
            <n-button type="primary" size="small" :disabled="!clipboardPreview" @click="saveClipboard">
              保存到历史
            </n-button>
            <n-button quaternary size="small" @click="syncClipboard">重新同步</n-button>
          </footer>
        </article>

        <AiQuickActions
          class="ai-actions-card"
          :loading="history.aiBusy"
          :source-text="clipboardPreview"
          :on-run="handleAiRun"
        />

        <aside class="recent-card">
          <div class="recent-header">
            <h2>最近历史</h2>
            <span>共 {{ history.items.length }} 条</span>
          </div>
          <n-empty v-if="!recentItems.length" description="暂无历史记录">
            <template #extra>
              <n-button size="small" @click="history.refresh()">立即加载</n-button>
            </template>
          </n-empty>
          <n-scrollbar v-else class="recent-scroll">
            <HistoryItem
              v-for="item in recentItems"
              :key="item.id"
              :item="item"
              @copy="handleCopy"
              @pin="handlePin"
              @favorite="handleFavorite"
              @remove="handleRemove"
            />
          </n-scrollbar>
        </aside>
      </div>
    </section>
  </div>
</template>

<style scoped>
.clipboard-page {
  display: flex;
  height: 100%;
}

.main {
  flex: 1;
  padding: 28px 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  overflow: hidden;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.page-header h1 {
  margin: 0;
  font-size: 26px;
}

.page-header p {
  margin: 6px 0 0;
  color: var(--vibe-text-muted);
}

.clipboard-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0.9fr);
  gap: 20px;
  min-height: 0;
}

.ai-actions-card {
  height: 100%;
}

.clipboard-card {
  background: var(--vibe-bg-surface);
  border-radius: var(--vibe-radius-lg);
  border: 1px solid var(--vibe-border-soft);
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.clipboard-card header h2 {
  margin: 0;
  font-size: 20px;
}

.clipboard-card header p {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--vibe-text-muted);
}

.clipboard-preview {
  flex: 1;
  min-height: 160px;
  background: rgba(12, 27, 56, 0.04);
  border-radius: var(--vibe-radius-md);
  padding: 16px;
  overflow: auto;
}

.preview-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--vibe-text-primary);
  line-height: 1.6;
}

.placeholder {
  margin: 0;
  color: var(--vibe-text-muted);
}

.clipboard-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.recent-card {
  background: var(--vibe-bg-surface);
  border-radius: var(--vibe-radius-lg);
  border: 1px solid var(--vibe-border-soft);
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}

.recent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--vibe-text-muted);
  font-size: 13px;
}

.recent-scroll {
  flex: 1;
  min-height: 0;
  max-height: 460px;
}

.recent-scroll :deep(.history-item) {
  margin-bottom: 12px;
}

.recent-scroll :deep(.history-item:last-child) {
  margin-bottom: 0;
}

@media (max-width: 1280px) {
  .clipboard-grid {
    grid-template-columns: 1fr;
  }

  .ai-actions-card {
    order: 2;
  }

  .recent-card {
    order: 3;
  }

  .recent-scroll {
    max-height: none;
  }
}
</style>
