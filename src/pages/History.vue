<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useMessage, useDialog, type DropdownOption } from "naive-ui";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import AppSidebar from "@/components/layout/AppSidebar.vue";
import HistoryItem from "@/components/history/HistoryItem.vue";
import AiQuickActions from "@/components/ai/AiQuickActions.vue";
import { useHistoryStore } from "@/store/history";
import { useSettingsStore } from "@/store/settings";
import { ClipKind, type AiActionKind, type ClipItem, type HistoryFilter } from "@/types/history";
import { useRouter } from "vue-router";

const history = useHistoryStore();
const settings = useSettingsStore();
const message = useMessage();
const dialog = useDialog();
const router = useRouter();

const searchValue = computed({
  get: () => history.searchTerm,
  set: value => {
    history.searchTerm = value;
    history.scheduleFetch();
  },
});

const capturing = ref(false);
const clipboardPreview = ref("");
const initializing = computed(() => !history.initialized);

const filterOptions = [
  { label: "全部", value: "all" },
  { label: "置顶", value: "pinned" },
  { label: "收藏", value: "favorites" },
  { label: "文本", value: "text" },
  { label: "图像", value: "images" },
  { label: "文件", value: "files" },
] as const;

const aiLabels: Record<AiActionKind, string> = {
  translate: "翻译",
  summarize: "摘要",
  polish: "润色",
  jsonify: "结构化",
  custom: "自定义",
};

const contextMenu = reactive({
  show: false,
  x: 0,
  y: 0,
  item: null as ClipItem | null,
});

const contextOptions: DropdownOption[] = [
  { label: aiLabels.translate, key: "translate" },
  { label: aiLabels.summarize, key: "summarize" },
  { label: aiLabels.polish, key: "polish" },
];

const aiDialog = reactive({
  visible: false,
  loading: false,
  action: null as AiActionKind | null,
  result: "",
  source: null as ClipItem | null,
});

const aiDialogTitle = computed(() => {
  if (!aiDialog.action) return "AI 结果";
  return `${aiLabels[aiDialog.action]}结果`;
});

const contextActionLanguage: Partial<Record<AiActionKind, string | undefined>> = {
  translate: "zh",
};

function reportError(label: string, error: unknown) {
  console.error(label, error);
  const reason = error instanceof Error ? error.message : String(error ?? "");
  message.error(`${label}${reason ? `：${reason}` : ""}`);
}

async function syncSystemClipboard() {
  try {
    capturing.value = true;
    clipboardPreview.value = await readText();
  } catch (error) {
    reportError("同步系统剪贴板失败", error);
  } finally {
    capturing.value = false;
  }
}

function handlePaste(event: ClipboardEvent) {
  const data = event.clipboardData;
  if (!data) return;
  const text = data.getData("text/plain");
  if (text) {
    history.insertClip({
      kind: ClipKind.Text,
      text,
      preview: text.slice(0, 120),
    });
    return;
  }
  const items = Array.from(data.items ?? []);
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (!file) continue;
      const reader = new FileReader();
      reader.onload = async () => {
        const result = reader.result as string;
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        await history.insertClip({
          kind: ClipKind.Image,
          imageBase64: base64,
          preview: file.name,
        });
      };
      reader.readAsDataURL(file);
      break;
    }
  }
}

function closeContextMenu() {
  contextMenu.show = false;
  contextMenu.item = null;
}

function handleContextMenu(item: ClipItem, event: MouseEvent) {
  if (item.kind !== ClipKind.Text) {
    closeContextMenu();
    return;
  }
  event.preventDefault();
  contextMenu.item = item;
  contextMenu.x = event.clientX;
  contextMenu.y = event.clientY;
  contextMenu.show = true;
}

async function handleContextSelect(key: string | number) {
  const target = contextMenu.item;
  closeContextMenu();
  if (!target) return;
  const action = String(key) as AiActionKind;
  await runContextAction(target, action);
}

async function runContextAction(item: ClipItem, action: AiActionKind) {
  if (!settings.apiKey) {
    dialog.warning({
      title: "未配置 API Key",
      content: "使用 AI 功能需要先配置 OpenAI 兼容接口的 API Key。是否现在前往设置页面进行配置？",
      positiveText: "前往设置",
      negativeText: "取消",
      onPositiveClick: () => {
        router.push("/settings");
      },
    });
    return;
  }
  aiDialog.visible = true;
  aiDialog.loading = true;
  aiDialog.action = action;
  aiDialog.source = item;
  aiDialog.result = "";
  try {
    const response = await history.runAiAction(
      {
        action,
        input: item.content,
        language: contextActionLanguage[action],
        apiKey: settings.apiKey,
        baseUrl: settings.apiBaseUrl,
        model: settings.model,
        temperature: settings.temperature,
      },
      { persist: false, copy: false }
    );
    aiDialog.result = response.result;
  } catch (error) {
    aiDialog.visible = false;
    reportError("AI 操作失败", error);
  } finally {
    aiDialog.loading = false;
  }
}

function handleContextVisibility(value: boolean) {
  if (!value) {
    closeContextMenu();
  } else {
    contextMenu.show = value;
  }
}

function handleAiDialogToggle(value: boolean) {
  if (aiDialog.loading) {
    aiDialog.visible = true;
    return;
  }
  aiDialog.visible = value;
  if (!value) {
    aiDialog.result = "";
    aiDialog.action = null;
    aiDialog.source = null;
  }
}

async function copyAiResult() {
  if (!aiDialog.result) return;
  try {
    await history.markSelfCapture({
      kind: ClipKind.Text,
      content: aiDialog.result,
    });
    await writeText(aiDialog.result);
    message.success("已复制到剪贴板");
  } catch (error) {
    reportError("复制结果失败", error);
  }
}

async function saveAiResult() {
  if (!aiDialog.result) return;
  try {
    const extraParts: string[] = [];
    if (aiDialog.action) {
      extraParts.push(aiLabels[aiDialog.action]);
    }
    if (aiDialog.source) {
      extraParts.push(`来源 #${aiDialog.source.id}`);
    }
    await history.insertClip({
      kind: ClipKind.Text,
      text: aiDialog.result,
      preview: aiDialog.result.slice(0, 120),
      extra: extraParts.length ? extraParts.join(" · ") : undefined,
    });
    message.success("结果已保存到历史");
  } catch (error) {
    reportError("保存结果失败", error);
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

onMounted(() => {
  void (async () => {
    try {
      await history.syncStatus();
    } catch (error) {
      reportError("同步应用状态失败", error);
    }
    try {
      await history.refresh();
    } catch (error) {
      reportError("加载历史记录失败", error);
    }
    await syncSystemClipboard();
  })();
  window.addEventListener("paste", handlePaste);
  window.addEventListener("click", closeContextMenu);
});

onBeforeUnmount(() => {
  window.removeEventListener("paste", handlePaste);
  window.removeEventListener("click", closeContextMenu);
});

function handleFilterChange(value: string) {
  history.filter = value as HistoryFilter;
  history.scheduleFetch();
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
    console.log('Toggling pin for item:', item.id, 'current state:', item.isPinned);
    await history.updateFlags(item.id, { pinned: !item.isPinned });
    console.log('Pin toggle successful');
  } catch (error) {
    console.error('Pin toggle error:', error);
    reportError("更新置顶状态失败", error);
  }
}

async function handleFavorite(item: (typeof history.items)[number]) {
  try {
    console.log('Toggling favorite for item:', item.id, 'current state:', item.isFavorite);
    await history.updateFlags(item.id, { favorite: !item.isFavorite });
    console.log('Favorite toggle successful');
  } catch (error) {
    console.error('Favorite toggle error:', error);
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

async function handleSavePreview() {
  if (!clipboardPreview.value.trim()) return;
  try {
    await history.captureText(clipboardPreview.value);
    message.success("已保存至历史");
  } catch (error) {
    reportError("保存失败", error);
  }
}

async function handleRefresh() {
  try {
    await history.refresh();
  } catch (error) {
    reportError("刷新历史失败", error);
  }
}

async function handleLoadMore() {
  try {
    await history.loadMore();
  } catch (error) {
    reportError("加载更多历史失败", error);
  }
}

async function handleImport() {
  try {
    await history.importHistory();
    message.success("已导入历史记录");
  } catch (error) {
    reportError("导入失败", error);
  }
}

async function handleExport() {
  try {
    await history.exportHistory();
    message.success("历史记录已导出");
  } catch (error) {
    reportError("导出失败", error);
  }
}

async function handleClear() {
  try {
    await history.clearHistory();
    message.success("历史记录已清空");
  } catch (error) {
    reportError("清空失败", error);
  }
}
</script>

<template>
  <div class="history-page">
    <AppSidebar />
    <section class="main">
      <div v-if="initializing" class="boot-skeleton">
        <n-skeleton height="48px" :sharp="false" class="skeleton-line" />
        <div class="skeleton-grid">
          <n-skeleton v-for="i in 2" :key="`card-${i}`" height="180px" :sharp="false" class="skeleton-card" />
        </div>
        <n-skeleton height="36px" :sharp="false" class="skeleton-line" />
        <div class="skeleton-list">
          <n-skeleton v-for="i in 4" :key="`row-${i}`" height="96px" :sharp="false" />
        </div>
      </div>
      <template v-else>
        <header class="top-bar">
          <n-input
            v-model:value="searchValue"
            placeholder="搜索历史内容或使用 Ctrl+Shift+V 呼出"
            clearable
            size="large"
            @clear="handleRefresh"
          />
          <div class="top-actions">
            <n-button quaternary size="small" @click="handleRefresh">刷新</n-button>
            <n-button quaternary size="small" @click="handleImport">导入</n-button>
            <n-button quaternary size="small" @click="handleExport" :loading="history.isExporting">导出</n-button>
            <n-popconfirm @positive-click="handleClear">
              <template #trigger>
                <n-button size="small" tertiary type="error">清空</n-button>
              </template>
              确认清空所有历史记录？
            </n-popconfirm>
          </div>
        </header>

        <div class="top-grid">
          <div class="live-card">
            <div class="card-header">
              <div>
                <h2>系统剪贴板</h2>
                <p>随时同步当前剪贴板内容</p>
              </div>
              <n-button size="tiny" secondary :loading="capturing" @click="syncSystemClipboard">同步</n-button>
            </div>
            <div class="card-body">
              <p v-if="clipboardPreview" class="preview-text">{{ clipboardPreview }}</p>
              <p v-else class="placeholder">剪贴板暂无文本，可在应用中粘贴图片或文件以自动收集。</p>
            </div>
            <div class="card-footer">
              <n-button size="small" type="primary" :disabled="!clipboardPreview" @click="handleSavePreview">
                保存到历史
              </n-button>
            </div>
          </div>
          <AiQuickActions
            :loading="history.aiBusy"
            :source-text="history.latest?.content ?? clipboardPreview"
            :on-run="handleAiRun"
          />
        </div>

        <section class="filters">
          <div class="filter-tabs">
            <button
              v-for="option in filterOptions"
              :key="option.value"
              class="filter-tab"
              :class="{ active: history.filter === option.value }"
              @click="handleFilterChange(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
          <span class="result-count">共 {{ history.filteredItems.length }} 条记录</span>
        </section>

        <n-alert v-if="history.lastError" type="warning" class="history-alert" show-icon>
          {{ history.lastError }}
        </n-alert>

        <section class="history-list" :style="{ '--line-height': settings.lineHeight }">
          <div class="history-scroll">
            <n-virtual-list
              v-if="history.filteredItems.length"
              class="history-virtual-list"
              :items="history.filteredItems"
              key-field="id"
              :item-size="190"
              :show-scrollbar="false"
            >
              <template #default="{ item }">
                <div class="history-row" @contextmenu.prevent="handleContextMenu(item, $event)">
                  <HistoryItem
                    :item="item"
                    @copy="handleCopy"
                    @pin="handlePin"
                    @favorite="handleFavorite"
                    @remove="handleRemove"
                  />
                </div>
              </template>
            </n-virtual-list>
            <div v-if="history.hasMore" class="load-more">
              <n-button tertiary block :loading="history.isLoading" @click="handleLoadMore">
                加载更多
              </n-button>
            </div>
            <n-empty v-else-if="!history.isLoading" description="还没有保存的剪贴板内容">
              <template #extra>
                <n-button size="small" @click="syncSystemClipboard">立即同步</n-button>
              </template>
            </n-empty>
          </div>
        </section>
      </template>
    </section>
  </div>

  <n-dropdown
    trigger="manual"
    :options="contextOptions"
    :show="contextMenu.show"
    :x="contextMenu.x"
    :y="contextMenu.y"
    @update:show="handleContextVisibility"
    @select="handleContextSelect"
  />

  <n-modal
    v-model:show="aiDialog.visible"
    preset="card"
    :title="aiDialogTitle"
    :mask-closable="!aiDialog.loading"
    :close-on-esc="!aiDialog.loading"
    @update:show="handleAiDialogToggle"
  >
    <n-spin :show="aiDialog.loading">
      <div v-if="aiDialog.result" class="ai-result-text">
        <pre>{{ aiDialog.result }}</pre>
      </div>
      <div v-else class="ai-result-placeholder">AI 正在生成中，请稍候…</div>
    </n-spin>
    <template #footer>
      <div class="ai-dialog-actions">
        <n-button size="small" secondary @click="copyAiResult" :disabled="!aiDialog.result || aiDialog.loading">
          复制
        </n-button>
        <n-button size="small" type="primary" @click="saveAiResult" :disabled="!aiDialog.result || aiDialog.loading">
          保存到历史
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.history-page {
  display: flex;
  height: 100%;
  width: 100%;
}

.main {
  flex: 1;
  padding: 28px 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  overflow: hidden;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.top-bar :deep(.n-input) {
  flex: 1;
}

.top-actions {
  display: flex;
  gap: 8px;
}

.top-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

@media (max-width: 1080px) {
  .top-grid {
    grid-template-columns: 1fr;
  }
}

.live-card {
  background: var(--vibe-bg-surface);
  border-radius: var(--vibe-radius-lg);
  border: 1px solid var(--vibe-border-soft);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-header h2 {
  margin: 0;
  font-size: 20px;
}

.card-header p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--vibe-text-muted);
}

.card-body {
  min-height: 90px;
}

.preview-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--vibe-text-primary);
  white-space: pre-wrap;
}

.placeholder {
  margin: 0;
  font-size: 13px;
  color: var(--vibe-text-muted);
}

.card-footer {
  display: flex;
  justify-content: flex-end;
}

.filters {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.filter-tabs {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  background: rgba(12, 27, 56, 0.04);
  border-radius: 12px;
  border: 1px solid var(--vibe-border-soft);
}

.filter-tab {
  position: relative;
  padding: 8px 18px;
  font-size: 14px;
  font-weight: 500;
  color: var(--vibe-text-muted);
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
  user-select: none;
}

.filter-tab:hover {
  color: var(--vibe-text-primary);
  background: rgba(255, 255, 255, 0.6);
}

.filter-tab.active {
  color: var(--vibe-primary-color, #5161ff);
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08),
              0 1px 2px rgba(0, 0, 0, 0.04);
  transform: translateY(-1px);
}

.filter-tab:active {
  transform: translateY(0);
}

.result-count {
  font-size: 13px;
  font-weight: 500;
  color: var(--vibe-text-muted);
}

.history-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.history-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-right: 6px;
}

.history-virtual-list {
  min-height: 100%;
  padding: 6px 0 20px;
}

.load-more {
  padding: 12px 0 24px;
}

.history-row {
  padding-bottom: 12px;
}

.history-row:last-child {
  padding-bottom: 0;
}

.history-row :deep(.history-item) {
  margin: 0;
  width: 100%;
}

.history-alert {
  margin-bottom: 12px;
}

.boot-skeleton {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding-top: 8px;
}

.skeleton-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.skeleton-card,
.skeleton-line,
.skeleton-list :deep(.n-skeleton)
{
  border-radius: var(--vibe-radius-lg);
}

.skeleton-line {
  border-radius: var(--vibe-radius-md);
}

.skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.ai-result-text {
  max-height: 320px;
  overflow: auto;
  background: rgba(12, 27, 56, 0.04);
  border-radius: var(--vibe-radius-md);
  padding: 12px 14px;
  color: var(--vibe-text-primary);
}

.ai-result-text pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-result-placeholder {
  color: var(--vibe-text-muted);
  font-size: 13px;
  padding: 6px 2px;
}

.ai-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
