<script setup lang="ts">
import { ref, onMounted, onErrorCaptured, watch } from "vue";
import { useMessage } from "naive-ui";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import AppSidebar from "@/components/layout/AppSidebar.vue";
import AiQuickActions from "@/components/ai/AiQuickActions.vue";
import { useHistoryStore } from "@/store/history";
import { useSettingsStore } from "@/store/settings";
import { ClipKind, type AiActionKind } from "@/types/history";

const history = useHistoryStore();
const settings = useSettingsStore();
const message = useMessage();

const input = ref("");
const output = ref("");
const pageError = ref<string | null>(null);
const isLoading = ref(false);

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
    message.warning("请先输入需要处理的内容");
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

function clearInput() {
  input.value = "";
  output.value = "";
}

async function copyResult() {
  if (!output.value) return;
  try {
    await history.markSelfCapture({
      kind: ClipKind.Text,
      content: output.value,
    });
    await writeText(output.value);
    message.success("结果已复制");
  } catch (error) {
    reportError("复制结果失败", error);
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
    message.success("结果已保存到历史");
  } catch (error) {
    reportError("保存结果失败", error);
  }
}

function retryInit() {
  pageError.value = null;
  isLoading.value = false;
}

onMounted(async () => {
  isLoading.value = true;
  try {
    // 等待 settings store 加载完成
    await new Promise<void>((resolve) => {
      if (settings.hydrated) {
        resolve();
      } else {
        const unwatch = watch(() => settings.hydrated, (hydrated) => {
          if (hydrated) {
            unwatch();
            resolve();
          }
        });
        // 超时保护
        setTimeout(() => {
          unwatch();
          resolve();
        }, 3000);
      }
    });
  } catch (error) {
    console.error("[AiTools] Mount error:", error);
    pageError.value = error instanceof Error ? error.message : "页面初始化失败";
  } finally {
    isLoading.value = false;
  }
});

// 捕获子组件错误
onErrorCaptured((err, _instance, info) => {
  console.error("[AiTools] Error captured:", err, info);
  pageError.value = err.message || "组件渲染错误";
  return false; // 阻止错误继续传播
});
</script>

<template>
  <div class="ai-tools-page">
    <AppSidebar />
    <section class="main">
      <!-- 错误提示 -->
      <n-alert v-if="pageError" type="error" title="页面加载失败" closable @close="pageError = null">
        {{ pageError }}
        <template #action>
          <n-button size="small" @click="retryInit">重试</n-button>
        </template>
      </n-alert>

      <!-- 加载中骨架屏 -->
      <div v-if="isLoading" class="loading-skeleton">
        <n-skeleton height="60px" :sharp="false" />
        <n-skeleton height="400px" :sharp="false" style="margin-top: 24px;" />
      </div>

      <template v-else>
        <header class="page-header">
        <div>
          <h1>AI 工具集</h1>
          <p>选择合适的动作处理文本，结果可复制或保存到历史</p>
        </div>
        <div class="header-actions">
          <n-button size="small" secondary @click="pasteFromClipboard">粘贴剪贴板</n-button>
          <n-button size="small" quaternary @click="clearInput">清空</n-button>
        </div>
      </header>

      <div class="workspace">
        <section class="input-card">
          <h2>输入内容</h2>
          <n-input
            v-model:value="input"
            type="textarea"
            :autosize="{ minRows: 8, maxRows: 12 }"
            placeholder="在此输入需要处理的文本，或点击上方按钮同步系统剪贴板"
          />
        </section>

        <AiQuickActions
          class="actions-card"
          :loading="history.aiBusy"
          :source-text="input"
          :on-run="handleAiRun"
        />

        <section class="result-card">
          <div class="result-header">
            <h2>AI 输出</h2>
            <div class="result-actions">
              <n-button size="tiny" secondary :disabled="!output" @click="copyResult">复制结果</n-button>
              <n-button size="tiny" type="primary" :disabled="!output" @click="saveResult">保存到历史</n-button>
            </div>
          </div>
          <n-spin :show="history.aiBusy">
            <div v-if="output" class="result-body">
              <pre>{{ output }}</pre>
            </div>
            <p v-else class="result-placeholder">运行 AI 动作后，生成结果将展示在此处。</p>
          </n-spin>
        </section>
      </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.ai-tools-page {
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

.header-actions {
  display: flex;
  gap: 12px;
}

.workspace {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 0.9fr) minmax(0, 1.2fr);
  gap: 20px;
  min-height: 0;
}

.input-card,
.result-card {
  background: var(--vibe-bg-surface);
  border-radius: var(--vibe-radius-lg);
  border: 1px solid var(--vibe-border-soft);
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.actions-card {
  height: 100%;
}

.input-card h2,
.result-card h2 {
  margin: 0;
  font-size: 18px;
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.result-actions {
  display: flex;
  gap: 8px;
}

.result-body {
  background: rgba(12, 27, 56, 0.04);
  border-radius: var(--vibe-radius-md);
  padding: 14px 16px;
  max-height: 320px;
  overflow: auto;
}

.result-body pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.result-placeholder {
  margin: 0;
  color: var(--vibe-text-muted);
  font-size: 13px;
}

@media (max-width: 1280px) {
  .workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .actions-card {
    order: 3;
  }
}
</style>
