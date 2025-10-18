<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useMessage, useDialog } from "naive-ui";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import HistoryItem from "@/components/history/HistoryItem.vue";
import AiQuickActions from "@/components/ai/AiQuickActions.vue";
import { useHistoryStore } from "@/store/history";
import { useSettingsStore } from "@/store/settings";
import { useLocale } from "@/composables/useLocale";
import type { AiActionKind, ClipItem } from "@/types/history";
import { ClipKind } from "@/types/history";
import { extractFeaturesFromClip } from "@/utils/content-inspector";
import MdiContentCopy from "~icons/mdi/content-copy";
import MdiHeartOutline from "~icons/mdi/heart-outline";
import MdiHeart from "~icons/mdi/heart";
import MdiPinOutline from "~icons/mdi/pin-outline";
import MdiPin from "~icons/mdi/pin";
import MdiTranslate from "~icons/mdi/translate";
import MdiTextBoxSearchOutline from "~icons/mdi/text-box-search-outline";
import MdiFeather from "~icons/mdi/feather";
import MdiShareVariant from "~icons/mdi/share-variant";
import MdiOpenInNew from "~icons/mdi/open-in-new";
import MdiDeleteOutline from "~icons/mdi/delete-outline";
import MdiTextRecognition from "~icons/mdi/text-recognition";

const history = useHistoryStore();
const settings = useSettingsStore();
const message = useMessage();
const dialog = useDialog();
const { t, format } = useLocale();

const clipboardPreview = ref("");
const capturing = ref(false);
const searchInput = ref("");

const contextMenu = reactive({
  show: false,
  x: 0,
  y: 0,
  renderX: 0,
  renderY: 0,
  item: null as ClipItem | null,
});

const menuRef = ref<HTMLElement | null>(null);

const aiDialog = reactive({
  visible: false,
  loading: false,
  action: null as AiActionKind | null,
  source: null as ClipItem | null,
  result: "",
});

const filterOptions = computed(() => [
  { label: t("history.filterAll", "全部"), value: "all" },
  { label: t("history.filterPinned", "置顶"), value: "pinned" },
  { label: t("history.filterFavorite", "收藏"), value: "favorites" },
  { label: t("history.filterText", "文本"), value: "text" },
  { label: t("history.filterImage", "图片"), value: "images" },
  { label: t("history.filterFile", "文件"), value: "files" },
  { label: t("history.filterLink", "链接"), value: "links" },
  { label: t("history.filterCode", "代码"), value: "code" },
  { label: t("history.filterCommand", "命令"), value: "commands" },
  { label: t("history.filterJson", "JSON"), value: "json" },
]);

const contextOptions = computed(() => {
  const item = contextMenu.item;
  if (!item) return [] as {
    key: string;
    label: string;
    icon: any;
    danger?: boolean;
  }[];
  const features = extractFeaturesFromClip(item);
  const isText = item.kind === ClipKind.Text;
  const isImage = item.kind === ClipKind.Image;
  const items: { key: string; label: string; icon: any; danger?: boolean }[] = [
    { key: "copy", label: t("contextMenu.copy", "复制"), icon: MdiContentCopy },
    {
      key: "favorite",
      label: t("contextMenu.favorite", "收藏"),
      icon: item.isFavorite ? MdiHeart : MdiHeartOutline,
    },
    {
      key: "pin",
      label: t("contextMenu.pin", "置顶"),
      icon: item.isPinned ? MdiPin : MdiPinOutline,
    },
  ];
  if (isText) {
    items.push(
      {
        key: "translate",
        label: t("contextMenu.translate", "AI 翻译"),
        icon: MdiTranslate,
      },
      {
        key: "summarize",
        label: t("contextMenu.summarize", "AI 摘要"),
        icon: MdiTextBoxSearchOutline,
      },
      {
        key: "polish",
        label: t("contextMenu.polish", "AI 润色"),
        icon: MdiFeather,
      },
      {
        key: "share",
        label: t("contextMenu.share", "快速分享"),
        icon: MdiShareVariant,
      },
    );
  }
  if (isImage) {
    items.push({
      key: "ocr",
      label: t("contextMenu.ocr", "AI OCR 提取文字"),
      icon: MdiTextRecognition,
    });
  }
  if (isText && features.has("url")) {
    items.push({ key: "open", label: t("contextMenu.open", "打开链接"), icon: MdiOpenInNew });
  }
  items.push({ key: "delete", label: t("contextMenu.delete", "删除"), icon: MdiDeleteOutline, danger: true });
  return items;
});

const aiDialogTitle = computed(() => {
  switch (aiDialog.action) {
    case "translate":
      return t("contextMenu.translate", "AI 翻译");
    case "summarize":
      return t("contextMenu.summarize", "AI 摘要");
    case "polish":
      return t("contextMenu.polish", "AI 润色");
    default:
      return "AI";
  }
});

const resultCountLabel = computed(() =>
  format("history.total", "共 {count} 条记录", { count: history.filteredItems.length })
);

const clipboardCountLabel = computed(() =>
  format("history.total", "共 {count} 条记录", { count: history.items.length })
);

const historySummary = computed(() => {
  const stats = {
    total: history.items.length,
    text: 0,
    images: 0,
    files: 0,
    favorites: 0,
    pinned: 0,
  };
  for (const item of history.items) {
    if (item.kind === ClipKind.Text) stats.text += 1;
    if (item.kind === ClipKind.Image) stats.images += 1;
    if (item.kind === ClipKind.File) stats.files += 1;
    if (item.isFavorite) stats.favorites += 1;
    if (item.isPinned) stats.pinned += 1;
  }
  return [
    { key: "total", label: t("history.summaryTotal", "总计"), value: stats.total },
    { key: "text", label: t("history.summaryText", "文本"), value: stats.text },
    { key: "images", label: t("history.summaryImages", "图片"), value: stats.images },
    { key: "favorites", label: t("history.summaryFavorites", "收藏"), value: stats.favorites },
    { key: "pinned", label: t("history.summaryPinned", "置顶"), value: stats.pinned },
  ];
});

watch(
  () => history.searchTerm,
  value => {
    if (value !== searchInput.value) {
      searchInput.value = value;
    }
  },
  { immediate: true }
);

watch(searchInput, value => {
  history.searchTerm = value;
  history.scheduleFetch();
});

function reportError(label: string, error: unknown) {
  console.error(label, error);
  const detail = error instanceof Error ? error.message : String(error ?? "");
  message.error(`${label}${detail ? `：${detail}` : ""}`);
}

async function syncSystemClipboard() {
  try {
    capturing.value = true;
    const text = await readText();
    clipboardPreview.value = text || "";
  } catch (error) {
    clipboardPreview.value = "";
    console.log("剪贴板当前为空或不包含文本");
  } finally {
    capturing.value = false;
  }
}

async function handleSavePreview() {
  if (!clipboardPreview.value.trim()) {
    message.info(t("clipboard.empty", "暂无文本内容，可使用 Ctrl+C 复制后刷新查看。"));
    return;
  }
  try {
    await history.captureText(clipboardPreview.value);
    message.success(t("clipboard.save", "保存到历史"));
  } catch (error) {
    reportError(t("clipboard.save", "保存到历史"), error);
  }
}

async function handleCopy(item: ClipItem) {
  try {
    await history.copyClip(item);
    message.success(t("contextMenu.copy", "复制"));
  } catch (error) {
    reportError(t("contextMenu.copy", "复制"), error);
  }
}

async function handlePin(item: ClipItem) {
  try {
    await history.updateFlags(item.id, { pinned: !item.isPinned });
  } catch (error) {
    reportError("更新置顶状态失败", error);
  }
}

async function handleFavorite(item: ClipItem) {
  try {
    await history.updateFlags(item.id, { favorite: !item.isFavorite });
  } catch (error) {
    reportError("更新收藏状态失败", error);
  }
}

function handleRemove(item: ClipItem) {
  dialog.warning({
    title: t("contextMenu.delete", "删除"),
    content: t("history.confirmDelete", "确定删除该条记录吗？"),
    positiveText: t("contextMenu.delete", "删除"),
    negativeText: t("common.cancel", "取消"),
    onPositiveClick: async () => {
      try {
        await history.removeClip(item.id);
        message.success(t("contextMenu.delete", "删除"));
      } catch (error) {
        reportError(t("contextMenu.delete", "删除"), error);
      }
    },
  });
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

function handleFilterChange(value: string) {
  history.filter = value as typeof history.filter;
  history.scheduleFetch();
}

function handleContextMenu(item: ClipItem, event: MouseEvent) {
  event.preventDefault();
  contextMenu.item = item;
  contextMenu.x = event.clientX;
  contextMenu.y = event.clientY;
  contextMenu.show = true;
  nextTick(adjustMenuPosition);
}

function adjustMenuPosition() {
  const menu = menuRef.value;
  if (!menu) return;
  const rect = menu.getBoundingClientRect();
  const { innerWidth, innerHeight } = window;
  let left = contextMenu.x;
  let top = contextMenu.y;
  if (left + rect.width > innerWidth - 8) {
    left = innerWidth - rect.width - 8;
  }
  if (top + rect.height > innerHeight - 8) {
    top = innerHeight - rect.height - 8;
  }
  contextMenu.renderX = Math.max(8, left);
  contextMenu.renderY = Math.max(8, top);
}

function closeContextMenu() {
  contextMenu.show = false;
  contextMenu.item = null;
}

function handleOutside(event: PointerEvent) {
  if (!menuRef.value) return;
  if (!menuRef.value.contains(event.target as Node)) {
    closeContextMenu();
  }
}

watch(
  () => contextMenu.show,
  value => {
    if (value) {
      document.addEventListener("pointerdown", handleOutside, true);
      window.addEventListener("resize", closeContextMenu);
      nextTick(adjustMenuPosition);
    } else {
      document.removeEventListener("pointerdown", handleOutside, true);
      window.removeEventListener("resize", closeContextMenu);
    }
  }
);

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleOutside, true);
  window.removeEventListener("resize", closeContextMenu);
});

async function handleContextSelect(key: string) {
  const target = contextMenu.item;
  if (!target) return;
  closeContextMenu();
  switch (key) {
    case "copy":
      await handleCopy(target);
      break;
    case "favorite":
      await handleFavorite(target);
      break;
    case "pin":
      await handlePin(target);
      break;
    case "translate":
    case "summarize":
    case "polish":
      await openAiDialog(key as AiActionKind, target);
      break;
    case "ocr":
      if (target.kind === ClipKind.Image) {
        await openAiDialog("custom", target);
      }
      break;
    case "share":
      await shareClip(target);
      break;
    case "open":
      try {
        await openUrl(target.content);
        message.success(t("contextMenu.open", "打开链接"));
      } catch (error) {
        reportError(t("contextMenu.open", "打开链接"), error);
      }
      break;
    case "delete":
      await handleRemove(target);
      break;
    default:
      break;
  }
}

async function openAiDialog(action: AiActionKind, item: ClipItem) {
  if (!settings.apiKey) {
    message.error("请先在设置中配置 OpenAI 兼容接口 Key");
    return;
  }
  aiDialog.visible = true;
  aiDialog.loading = true;
  aiDialog.action = action;
  aiDialog.source = item;
  aiDialog.result = "";
  try {
    let customPrompt: string | undefined;
    let input = item.content;
    
    // 特殊处理图片OCR
    if (action === "custom" && item.kind === ClipKind.Image) {
      const base64Data = item.content;
      input = `data:image/png;base64,${base64Data}`;
      customPrompt = `You are VibeClip Pro Vision OCR. Extract all text from the following base64 encoded PNG image and respond in ${settings.preferredLanguage}. Return only the extracted text without any additional commentary.`;
    }
    
    const response = await history.runAiAction(
      {
        action,
        input,
        language: settings.preferredLanguage,
        customPrompt,
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

async function shareClip(item: ClipItem) {
  try {
    const payload = `VibeClip · ${item.extra ?? "Snippet"}\n${item.content}`;
    await history.markSelfCapture({ kind: ClipKind.Text, content: payload });
    await writeText(payload);
    message.success(t("contextMenu.share", "快速分享"));
  } catch (error) {
    reportError(t("contextMenu.share", "快速分享"), error);
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
    await history.markSelfCapture({ kind: ClipKind.Text, content: aiDialog.result });
    await writeText(aiDialog.result);
    message.success(t("history.aiDialogCopy", "复制"));
  } catch (error) {
    reportError(t("history.aiDialogCopy", "复制"), error);
  }
}

async function saveAiResult() {
  if (!aiDialog.result) return;
  try {
    await history.insertClip({
      kind: ClipKind.Text,
      text: aiDialog.result,
      preview: aiDialog.result.slice(0, 120),
      extra: aiDialog.action ? t(`contextMenu.${aiDialog.action}`, aiDialog.action) : undefined,
    });
    message.success(t("history.aiDialogSave", "保存到历史"));
  } catch (error) {
    reportError(t("history.aiDialogSave", "保存到历史"), error);
  }
}

async function loadMore() {
  await history.loadMore();
}

onMounted(async () => {
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
  void syncSystemClipboard();
});
</script>

<template>
  <div class="history-page">
    <section class="main">
      <header class="page-header">
        <div>
          <h1>{{ t("history.title", "历史记录") }}</h1>
          <p>{{ t("history.subtitle", "按标签筛选历史记录，并在右键菜单中快速操作") }}</p>
        </div>
      </header>

      <div class="content-scroll thin-scrollbar">
        <div class="history-summary">
          <div v-for="stat in historySummary" :key="stat.key" class="summary-chip">
            <span class="summary-value">{{ stat.value }}</span>
            <span class="summary-label">{{ stat.label }}</span>
          </div>
        </div>

        <section class="card clipboard-card">
          <div class="card-header">
            <div>
              <h2>{{ t("history.clipboardPreview", "剪贴板快照") }}</h2>
              <p>{{ clipboardCountLabel }}</p>
            </div>
            <n-button size="tiny" secondary :loading="capturing" @click="syncSystemClipboard">
              {{ t("history.syncClipboard", "同步") }}
            </n-button>
          </div>
          <div class="card-body">
            <p v-if="clipboardPreview" class="preview-text">{{ clipboardPreview }}</p>
            <p v-else class="placeholder">
              {{ t("history.clipboardPlaceholder", "剪贴板暂无文本，可在应用中粘贴图片或文件以自动收集。") }}
            </p>
          </div>
          <footer class="card-footer">
            <n-button size="tiny" type="primary" :disabled="!clipboardPreview" @click="handleSavePreview">
              {{ t("clipboard.save", "保存到历史") }}
            </n-button>
          </footer>
        </section>

        <AiQuickActions
          class="card ai-card"
          :loading="history.aiBusy"
          :source-text="history.latest?.content ?? clipboardPreview"
          :on-run="handleAiRun"
        />

        <section class="filters card">
          <div class="filter-tabs">
            <button
              v-for="option in filterOptions"
              :key="option.value"
              type="button"
              class="filter-tab"
              :class="{ active: history.filter === option.value }"
              @click="handleFilterChange(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
          <div class="filter-search">
            <n-input
              v-model:value="searchInput"
              size="small"
              clearable
              :placeholder="t('history.searchPlaceholder', '搜索历史...')"
            />
            <span class="muted">{{ resultCountLabel }}</span>
          </div>
        </section>

        <n-alert v-if="history.lastError" type="warning" show-icon class="history-alert">
          {{ history.lastError }}
        </n-alert>

        <section class="history-list card">
          <div class="history-scroll">
            <n-virtual-list
              v-if="history.filteredItems.length"
              class="history-virtual-list"
              :items="history.filteredItems"
              key-field="id"
              :item-size="184"
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
            <n-empty v-else :description="t('history.empty', '还没有保存的剪贴板内容')">
              <template #extra>
                <n-button size="tiny" @click="syncSystemClipboard">
                  {{ t("history.emptyAction", "立即同步") }}
                </n-button>
              </template>
            </n-empty>
            <div v-if="history.hasMore" class="load-more">
              <n-button tertiary block size="tiny" :loading="history.isLoading" @click="loadMore">
                {{ t("history.loadMore", "加载更多") }}
              </n-button>
            </div>
          </div>
        </section>
      </div>
    </section>

    <Teleport to="body">
      <transition name="menu-fade">
        <div v-if="contextMenu.show" class="context-container">
          <div class="context-menu" :style="{ left: `${contextMenu.renderX}px`, top: `${contextMenu.renderY}px` }" ref="menuRef">
            <header class="context-header">{{ t("contextMenu.header", "AI 快捷操作") }}</header>
            <ul>
              <li
                v-for="option in contextOptions"
                :key="option.key"
                :class="['context-item', option.danger ? 'danger' : '']"
                @click="handleContextSelect(option.key)"
              >
                <n-icon size="16" :component="option.icon" />
                <span>{{ option.label }}</span>
              </li>
            </ul>
          </div>
        </div>
      </transition>
    </Teleport>

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
          <n-button size="tiny" secondary @click="copyAiResult" :disabled="!aiDialog.result || aiDialog.loading">
            {{ t("history.aiDialogCopy", "复制") }}
          </n-button>
          <n-button size="tiny" type="primary" @click="saveAiResult" :disabled="!aiDialog.result || aiDialog.loading">
            {{ t("history.aiDialogSave", "保存到历史") }}
          </n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.history-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  overflow: hidden;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.page-header h1 {
  margin: 0;
  font-size: 20px;
}

.page-header p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--vibe-text-muted);
}

.content-scroll {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.history-summary {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  gap: 8px;
  padding-bottom: 4px;
}

.summary-chip {
  flex: 0 0 auto;
  min-width: 90px;
  padding: 8px 10px;
  border-radius: var(--vibe-radius-md);
  background: var(--vibe-panel-surface-strong);
  border: 1px solid color-mix(in srgb, var(--vibe-panel-border) 70%, transparent);
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: center;
  text-align: center;
}

.summary-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--vibe-text-primary);
}

.summary-label {
  font-size: 11px;
  color: var(--vibe-text-muted);
  white-space: nowrap;
}

.card {
  border-radius: var(--vibe-radius-lg);
  background: var(--vibe-panel-surface);
  border: 1px solid var(--vibe-panel-border);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.card-header h2 {
  margin: 0;
  font-size: 16px;
}

.card-body {
  max-height: 100px;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.placeholder {
  margin: 0;
  color: var(--vibe-text-muted);
  font-size: 12px;
}

.filters {
  gap: 10px;
}

.filter-tabs {
  display: flex;
  overflow-x: auto;
  gap: 6px;
  padding-bottom: 4px;
}

.filter-tab {
  border: none;
  border-radius: 999px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: var(--vibe-text-primary);
  transition: background 0.2s ease, transform 0.2s ease;
  white-space: nowrap;
  flex: 0 0 auto;
}

.filter-tab:hover {
  background: var(--vibe-control-hover);
  transform: translateY(-1px);
}

.filter-tab:focus-visible {
  outline: 2px solid var(--vibe-accent);
  outline-offset: 1px;
}

.filter-tab.active {
  background: linear-gradient(135deg, rgba(81, 97, 255, 0.9), rgba(122, 209, 245, 0.85));
  color: #fff;
  box-shadow: 0 10px 20px rgba(81, 97, 255, 0.26);
}

.filter-search {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.muted {
  font-size: 12px;
  color: var(--vibe-text-muted);
}

.history-list {
  gap: 10px;
}

.history-scroll {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.history-row {
  border-radius: var(--vibe-radius-md);
  overflow: hidden;
}

.load-more {
  margin-top: 8px;
}

.history-alert {
  border-radius: var(--vibe-radius-lg);
}

.context-container {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2000;
}

.context-menu {
  position: absolute;
  pointer-events: auto;
  min-width: 210px;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 18px;
  padding: 10px 0;
  box-shadow: 0 18px 40px rgba(18, 37, 68, 0.25);
  backdrop-filter: blur(18px);
}

.dark .context-menu {
  background: rgba(18, 24, 42, 0.95);
  box-shadow: 0 18px 40px rgba(6, 12, 26, 0.65);
}

.context-header {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.3px;
  padding: 0 16px 8px;
  color: var(--vibe-text-muted);
}

.context-item {
  list-style: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.18s ease, transform 0.18s ease;
}

.context-item:hover {
  background: rgba(81, 97, 255, 0.12);
  transform: translateX(2px);
}

.context-item.danger:hover {
  background: rgba(255, 99, 99, 0.18);
}

.menu-fade-enter-active,
.menu-fade-leave-active {
  transition: opacity 0.18s ease;
}

.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
}

.ai-result-text {
  max-height: 280px;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.6;
}

.ai-result-placeholder {
  color: var(--vibe-text-muted);
}

.ai-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 520px) {
  .filter-tabs {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .card {
    padding: 12px;
  }
}
</style>
