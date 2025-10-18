<script setup lang="ts">
import { computed, onMounted, onErrorCaptured, ref, watch } from "vue";
import { useMessage } from "naive-ui";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import AiQuickActions from "@/components/ai/AiQuickActions.vue";
import GlobalContextMenu from "@/components/system/GlobalContextMenu.vue";
import { useHistoryStore } from "@/store/history";
import { useSettingsStore } from "@/store/settings";
import { useBridgeStore } from "@/store/bridge";
import type { ClipboardBridgePayload } from "@/store/bridge";
import { ClipKind, type AiActionKind } from "@/types/history";
import { useLocale } from "@/composables/useLocale";
import { useContextMenu, type ContextMenuItem } from "@/composables/useContextMenu";
import MdiContentCopy from "~icons/mdi/content-copy";
import MdiContentSave from "~icons/mdi/content-save";
import MdiDeleteOutline from "~icons/mdi/delete-outline";

const history = useHistoryStore();
const settings = useSettingsStore();
const bridge = useBridgeStore();
const message = useMessage();
const { t } = useLocale();
const contextMenu = useContextMenu();

const input = ref("");
const output = ref("");
const pageError = ref<string | null>(null);
const isLoading = ref(false);

const assistantMessages = ref<{ role: "user" | "assistant"; content: string }[]>([]);
const assistantInput = ref("");
const assistantLoading = ref(false);
const clipboardBridge = ref<ClipboardBridgePayload | null>(null);

const resultContextMenuItems = computed<ContextMenuItem[]>(() => [
  { key: "copy", label: t("ai.copy", "复制结果"), icon: MdiContentCopy },
  { key: "save", label: t("ai.save", "保存到历史"), icon: MdiContentSave },
]);

const assistantMessageContextMenuItems = computed<ContextMenuItem[]>(() => [
  { key: "copy", label: t("assistant.copy", "复制回答"), icon: MdiContentCopy },
  { key: "delete", label: t("contextMenu.delete", "删除"), icon: MdiDeleteOutline, danger: true },
]);

function ensureAssistantIntro() {
  if (!assistantMessages.value.length) {
    assistantMessages.value.push({
      role: "assistant",
      content: t("ai.assistantWelcome", "你好！随时向我提问，或输入需要翻译、摘要或润色的文字。"),
    });
  }
}

function applyBridgeSeed(payload: ClipboardBridgePayload) {
  if (!payload.content?.trim()) {
    return;
  }
  if (payload.kind === ClipKind.Image) {
    clipboardBridge.value = { ...payload };
    if (payload.mode === "assistant") {
      ensureAssistantIntro();
      assistantInput.value = `请描述这张图片：${payload.content}`;
    }
    message.success(t("ai.bridgeImageReady", "已载入剪贴板图片"));
    return;
  }

  clipboardBridge.value = null;
  input.value = payload.content;
  if (payload.mode === "assistant") {
    ensureAssistantIntro();
    assistantInput.value = payload.content;
  }
  message.success(t("ai.bridgeLoaded", "已载入剪贴板内容"));
}

watch(
  () => bridge.clipboardSeed,
  payload => {
    if (!payload) return;
    applyBridgeSeed(payload);
    bridge.consumeClipboardSeed();
  },
  { immediate: true }
);

function applyBridgeToInput() {
  const payload = clipboardBridge.value;
  if (!payload) return;
  input.value = payload.content;
  message.success(t("ai.bridgeApplied", "已填充到输入区"));
}

function sendBridgeToAssistant() {
  const payload = clipboardBridge.value;
  if (payload) {
    ensureAssistantIntro();
    assistantInput.value =
      payload.kind === ClipKind.Image
        ? `请描述这张图片：${payload.content}`
        : payload.content;
    void sendAssistantMessage();
    clipboardBridge.value = null;
    return;
  }
  if (input.value.trim()) {
    ensureAssistantIntro();
    assistantInput.value = input.value;
    void sendAssistantMessage();
  }
}

function clearBridgeSeed() {
  clipboardBridge.value = null;
}

function reportError(label: string, error: unknown) {
  console.error(label, error);
  const detail = error instanceof Error ? error.message : String(error ?? "");
  message.error(`${label}${detail ? `：${detail}` : ""}`);
}

async function handleAiRun(payload: {
  action: AiActionKind;
  input: string;
  language: string;
  customPrompt?: string;
}) {
  if (!payload.input.trim()) {
    message.warning(t("ai.placeholder", "输入内容"));
    return;
  }
  if (!settings.apiKey) {
    message.warning("请在设置页配置 OpenAI 兼容接口 Key");
    return;
  }
  try {
    const response = await history.runAiAction(
      {
        action: payload.action,
        input: payload.input,
        language: payload.language,
        customPrompt: payload.customPrompt,
        apiKey: settings.apiKey,
        baseUrl: settings.apiBaseUrl,
        model: settings.model,
        temperature: settings.temperature,
      },
      { persist: false, copy: false }
    );
    output.value = response.result;
    message.success("AI 操作完成");
  } catch (error) {
    reportError("AI 操作失败", error);
  }
}

async function pasteFromClipboard() {
  try {
    input.value = await readText();
  } catch (error) {
    reportError("读取系统剪贴板失败", error);
  }
}

function clearWorkspace() {
  input.value = "";
  output.value = "";
}

async function copyResult() {
  if (!output.value) return;
  try {
    await history.markSelfCapture({ kind: ClipKind.Text, content: output.value });
    await writeText(output.value);
    message.success(t("ai.copy", "复制结果"));
  } catch (error) {
    reportError(t("ai.copy", "复制结果"), error);
  }
}

async function saveResult() {
  if (!output.value.trim()) return;
  try {
    await history.insertClip({
      kind: ClipKind.Text,
      text: output.value,
      preview: output.value.slice(0, 120),
      extra: "AI 工具生成",
    });
    message.success(t("ai.save", "保存到历史"));
  } catch (error) {
    reportError(t("ai.save", "保存到历史"), error);
  }
}

async function sendAssistantMessage() {
  const question = assistantInput.value.trim();
  if (!question) return;
  if (!settings.apiKey) {
    message.warning("请在设置页配置 OpenAI 兼容接口 Key");
    return;
  }
  ensureAssistantIntro();
  assistantMessages.value.push({ role: "user", content: question });
  assistantInput.value = "";
  assistantLoading.value = true;
  try {
    const historySlice = assistantMessages.value
      .slice(-6)
      .map(entry => `${entry.role === "user" ? "User" : "Assistant"}: ${entry.content}`)
      .join("\n");
    const prompt = `${historySlice}\nAssistant:`;
    const response = await history.runAiAction(
      {
        action: "custom",
        input: prompt,
        language: settings.preferredLanguage,
        customPrompt:
          "You are VibeClip Pro, an expert productivity assistant. Reply concisely and keep markdown formatting when appropriate.",
        apiKey: settings.apiKey,
        baseUrl: settings.apiBaseUrl,
        model: settings.model,
        temperature: settings.temperature,
      },
      { persist: false, copy: false }
    );
    assistantMessages.value.push({ role: "assistant", content: response.result });
  } catch (error) {
    reportError("AI 助理失败", error);
  } finally {
    assistantLoading.value = false;
  }
}

function copyAssistantResponse(entry: { role: "user" | "assistant"; content: string }) {
  if (entry.role !== "assistant") return;
  void (async () => {
    try {
      await history.markSelfCapture({ kind: ClipKind.Text, content: entry.content });
      await writeText(entry.content);
      message.success(t("assistant.copy", "复制回答"));
    } catch (error) {
      reportError(t("assistant.copy", "复制回答"), error);
    }
  })();
}

function handleResultContextMenu(event: MouseEvent) {
  if (!output.value) return;
  contextMenu.showContextMenu(event, resultContextMenuItems.value, {
    type: "ai-result",
    data: { content: output.value },
    position: { x: event.clientX, y: event.clientY },
  });
}

function handleAssistantMessageContextMenu(event: MouseEvent, message: { role: "user" | "assistant"; content: string }, index: number) {
  if (message.role !== "assistant") return;
  contextMenu.showContextMenu(event, assistantMessageContextMenuItems.value, {
    type: "ai-message",
    data: { message, index },
    position: { x: event.clientX, y: event.clientY },
  });
}

async function handleContextMenuSelect(key: string) {
  const ctx = contextMenu.state.context;
  contextMenu.closeContextMenu();
  
  if (!ctx) return;
  
  if (ctx.type === "ai-result") {
    switch (key) {
      case "copy":
        await copyResult();
        break;
      case "save":
        await saveResult();
        break;
    }
  } else if (ctx.type === "ai-message") {
    const { message: msg, index } = ctx.data;
    switch (key) {
      case "copy":
        try {
          await history.markSelfCapture({ kind: ClipKind.Text, content: msg.content });
          await writeText(msg.content);
          message.success(t("assistant.copy", "复制回答"));
        } catch (error) {
          reportError(t("assistant.copy", "复制回答"), error);
        }
        break;
      case "delete":
        if (index >= 0 && index < assistantMessages.value.length) {
          assistantMessages.value.splice(index, 1);
        }
        break;
    }
  }
}

onMounted(async () => {
  isLoading.value = true;
  ensureAssistantIntro();
  try {
    await new Promise<void>(resolve => {
      if (settings.hydrated) {
        resolve();
      } else {
        const unwatch = watch(
          () => settings.hydrated,
          hydrated => {
            if (hydrated) {
              unwatch();
              resolve();
            }
          }
        );
        setTimeout(() => {
          unwatch();
          resolve();
        }, 3000);
      }
    });
  } catch (error) {
    pageError.value = error instanceof Error ? error.message : "页面初始化失败";
  } finally {
    isLoading.value = false;
  }
});

onErrorCaptured((err, _instance, info) => {
  console.error("[AiTools] Error captured:", err, info);
  pageError.value = err instanceof Error ? err.message : "组件渲染错误";
  return false;
});
</script>

<template>
  <div class="ai-tools-page">
    <section class="main">
      <n-alert v-if="pageError" type="error" title="页面加载失败" closable @close="pageError = null">
        {{ pageError }}
      </n-alert>

      <div v-if="isLoading" class="loading-skeleton">
        <n-skeleton height="60px" :sharp="false" />
        <n-skeleton height="400px" :sharp="false" style="margin-top: 16px;" />
      </div>

      <template v-else>
        <header class="page-header">
          <div>
            <h1>{{ t("ai.title", "AI 工具集") }}</h1>
            <p>{{ t("ai.subtitle", "选择合适的动作处理文本，结果可复制或保存到历史") }}</p>
          </div>
          <div class="header-actions">
            <n-button size="tiny" secondary @click="pasteFromClipboard">
              {{ t("ai.paste", "粘贴剪贴板") }}
            </n-button>
            <n-button size="tiny" quaternary @click="clearWorkspace">
              {{ t("ai.clear", "清空") }}
            </n-button>
          </div>
        </header>

        <div class="content-scroll thin-scrollbar">
          <section v-if="clipboardBridge" class="card bridge-card">
            <header class="bridge-header">
              <div>
                <h2>{{ clipboardBridge.title ?? t("ai.bridgeTitle", "来自剪贴板") }}</h2>
                <p>{{ t("ai.bridgeSubtitle", "快速继续处理或发送给 AI 助理") }}</p>
              </div>
            </header>
            <div class="bridge-body">
              <img
                v-if="clipboardBridge.kind === ClipKind.Image"
                :src="clipboardBridge.content"
                alt="clipboard preview"
                class="bridge-image"
              />
              <p v-else class="bridge-text">{{ clipboardBridge.content }}</p>
            </div>
            <footer class="bridge-actions">
              <n-button size="tiny" tertiary @click="applyBridgeToInput">
                {{ t("ai.bridgeApply", "填充到输入区") }}
              </n-button>
              <n-button size="tiny" type="primary" @click="sendBridgeToAssistant">
                {{ t("ai.bridgeSend", "发送给助手") }}
              </n-button>
              <n-button size="tiny" quaternary @click="clearBridgeSeed">
                {{ t("ai.bridgeClear", "清除") }}
              </n-button>
            </footer>
          </section>

          <section class="card input-card">
            <h2>{{ t("ai.input", "输入内容") }}</h2>
            <n-input
              v-model:value="input"
              type="textarea"
              :autosize="{ minRows: 6, maxRows: 10 }"
              :placeholder="t('ai.placeholder', '在此输入需要处理的文本，或点击上方按钮同步系统剪贴板')"
            />
          </section>

          <AiQuickActions
            class="card ai-card"
            :loading="history.aiBusy"
            :source-text="input"
            :on-run="handleAiRun"
          />

          <section class="card result-card">
            <div class="result-header">
              <h2>{{ t("ai.output", "AI 输出") }}</h2>
              <div class="result-actions">
                <n-button size="tiny" secondary :disabled="!output" @click="copyResult">
                  {{ t("ai.copy", "复制结果") }}
                </n-button>
                <n-button size="tiny" type="primary" :disabled="!output" @click="saveResult">
                  {{ t("ai.save", "保存到历史") }}
                </n-button>
              </div>
            </div>
            <div class="result-body" @contextmenu="handleResultContextMenu">
              <pre v-if="output">{{ output }}</pre>
              <p v-else class="placeholder">{{ t("ai.placeholder", "在此输入需要处理的文本，或点击上方按钮同步系统剪贴板") }}</p>
            </div>
          </section>

          <section class="card assistant-card">
            <header class="assistant-header">
              <div>
                <h2>{{ t("ai.assistantTitle", "AI 助理") }}</h2>
                <p>{{ t("ai.assistantSubtitle", "自由提问或让 AI 帮助翻译、摘要与润色") }}</p>
              </div>
            </header>
            <div class="assistant-messages thin-scrollbar">
              <template v-if="assistantMessages.length">
                <div
                  v-for="(message, index) in assistantMessages"
                  :key="index"
                  :class="['assistant-message', message.role]"
                  @dblclick="copyAssistantResponse(message)"
                  @contextmenu="handleAssistantMessageContextMenu($event, message, index)"
                >
                  <p>{{ message.content }}</p>
                </div>
              </template>
              <p v-else class="placeholder">{{ t("assistant.empty", "还没有对话，开始输入吧。") }}</p>
            </div>
            <div class="assistant-input">
              <n-input
                v-model:value="assistantInput"
                type="textarea"
                :autosize="{ minRows: 2, maxRows: 4 }"
                :placeholder="t('ai.assistantPlaceholder', '输入想要询问或处理的内容')"
                @keyup.enter.exact.prevent="sendAssistantMessage"
              />
              <n-button type="primary" size="tiny" :loading="assistantLoading" @click="sendAssistantMessage">
                {{ t("ai.assistantSend", "发送") }}
              </n-button>
            </div>
          </section>
        </div>
      </template>
    </section>

    <GlobalContextMenu
      :show="contextMenu.state.show"
      :x="contextMenu.state.renderX"
      :y="contextMenu.state.renderY"
      :items="contextMenu.state.items"
      :ref="contextMenu.menuRef"
      @select="handleContextMenuSelect"
      @close="contextMenu.closeContextMenu"
    />
  </div>
</template>

<style scoped>
.ai-tools-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  overflow: hidden;
}

.main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
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

.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.content-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 4px;
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

.bridge-card {
  gap: 10px;
}

.bridge-header h2 {
  margin: 0;
  font-size: 16px;
}

.bridge-header p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--vibe-text-muted);
}

.bridge-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bridge-image {
  width: 100%;
  max-height: 150px;
  object-fit: contain;
  border-radius: var(--vibe-radius-md);
  border: 1px solid var(--vibe-panel-border);
}

.bridge-text {
  margin: 0;
  font-size: 12px;
  color: var(--vibe-text-secondary);
  word-break: break-word;
}

.bridge-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.result-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.result-header h2 {
  margin: 0;
  font-size: 16px;
}

.result-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.result-body {
  max-height: 180px;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.5;
}

.result-body pre {
  margin: 0;
  white-space: pre-wrap;
}

.assistant-card {
  gap: 10px;
}

.assistant-header h2 {
  margin: 0;
  font-size: 16px;
}

.assistant-header p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--vibe-text-muted);
}

.assistant-messages {
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.assistant-message {
  padding: 10px 12px;
  border-radius: 14px;
  font-size: 13px;
  line-height: 1.5;
}

.assistant-message.assistant {
  background: rgba(81, 97, 255, 0.12);
  color: var(--vibe-text-primary);
}

.assistant-message.user {
  align-self: flex-end;
  background: rgba(255, 255, 255, 0.68);
}

.assistant-input {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.placeholder {
  margin: 0;
  color: var(--vibe-text-muted);
  font-size: 12px;
}

.loading-skeleton {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

@media (max-width: 520px) {
  .card {
    padding: 12px;
  }

  .assistant-message.assistant {
    background: rgba(122, 209, 245, 0.18);
  }
}
</style>
