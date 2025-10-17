<script setup lang="ts">
import { computed, reactive } from "vue";
import { useRouter } from "vue-router";
import type { AiActionKind } from "@/types/history";
import { useSettingsStore } from "@/store/settings";
import MdiSparkle from "~icons/mdi/sparkles";
import MdiLanguage from "~icons/mdi/translate";

const props = defineProps<{
  loading: boolean;
  onRun: (payload: { action: AiActionKind; input: string; language: string; customPrompt?: string }) => Promise<void>;
  sourceText: string;
}>();

const settings = useSettingsStore();
const router = useRouter();

const state = reactive({
  action: "translate" as AiActionKind,
  language: settings.preferredLanguage,
  customPrompt: "",
  input: "",
});

const settingsReady = computed(() => settings.hydrated);
const needsSetup = computed(() => !settings.apiKey);

const languageOptions = [
  { label: "中文", value: "zh-CN" },
  { label: "English", value: "en" },
  { label: "日本語", value: "ja" },
  { label: "한국어", value: "ko" },
  { label: "Français", value: "fr" },
] as const;

type LanguageOption = (typeof languageOptions)[number];

const renderLanguageLabel = (option: LanguageOption) => option.label;

const actions = [
  { key: "translate", label: "翻译", description: "翻译到目标语言" },
  { key: "summarize", label: "摘要", description: "生成摘要" },
  { key: "polish", label: "润色", description: "提升表达" },
  { key: "jsonify", label: "JSON 化", description: "结构化输出" },
  { key: "custom", label: "自定义", description: "使用自定义 Prompt" },
] as const;

const placeholder = computed(() => {
  if (state.action === "translate") return "输入想要翻译的内容";
  if (state.action === "summarize") return "输入需要总结的内容";
  if (state.action === "polish") return "输入需要润色的段落";
  if (state.action === "jsonify") return "输入需要结构化的内容";
  return "输入内容";
});

async function handleSubmit() {
  const input = state.input.trim() || props.sourceText.trim();
  if (!input) return;
  await props.onRun({
    action: state.action,
    input,
    language: state.language || settings.preferredLanguage,
    customPrompt: state.customPrompt.trim() || undefined,
  });
  state.input = "";
}

function openSettings() {
  router.push("/settings");
}
</script>

<template>
  <div class="ai-card">
    <div v-if="!settingsReady" class="ai-skeleton">
      <n-skeleton height="20px" :sharp="false" />
      <n-skeleton height="18px" :sharp="false" />
      <n-skeleton height="120px" :sharp="false" />
    </div>
    <div v-else-if="needsSetup" class="ai-placeholder">
      <n-empty description="AI 功能未配置">
        <template #extra>
          <n-button size="small" type="primary" @click="openSettings">前往设置 API Key</n-button>
        </template>
      </n-empty>
    </div>
    <template v-else>
      <header class="ai-header">
        <div class="title-group">
          <n-icon :component="MdiSparkle" size="20" />
          <div>
            <h3>AI 快捷操作</h3>
            <p>翻译、摘要、润色或快速 JSON 化</p>
          </div>
        </div>
        <n-select
          v-model:value="state.language"
          class="language-select"
          size="small"
          :options="languageOptions"
          :render-label="renderLanguageLabel"
        />
      </header>
    <div class="action-tabs">
      <n-button
        v-for="item in actions"
        :key="item.key"
        size="tiny"
        quaternary
        class="tab-button"
        :type="state.action === item.key ? 'primary' : 'default'"
        @click="state.action = item.key"
      >
        {{ item.label }}
      </n-button>
    </div>
    <n-input
      v-model:value="state.input"
      type="textarea"
      :autosize="{ minRows: 3, maxRows: 6 }"
      :placeholder="placeholder"
      class="action-input"
    />
    <n-input
      v-if="state.action === 'custom'"
      v-model:value="state.customPrompt"
      type="textarea"
      :autosize="{ minRows: 2, maxRows: 4 }"
      placeholder="输入自定义 Prompt，支持 {{clipboard}} 占位符"
      class="action-input"
    />
    <div class="action-footer">
      <div class="helper">
        <n-icon :component="MdiLanguage" size="16" />
        <span>默认使用上方语言；留空时使用系统首选</span>
      </div>
      <n-button type="primary" size="small" :loading="loading" @click="handleSubmit">
        执行
      </n-button>
    </div>
    </template>
  </div>
</template>

<style scoped>
.ai-card {
  background: var(--vibe-bg-surface);
  border: 1px solid var(--vibe-border-soft);
  border-radius: var(--vibe-radius-lg);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
}

.ai-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.title-group {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--vibe-text-primary);
}

.title-group h3 {
  margin: 0;
  font-size: 18px;
}

.title-group p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--vibe-text-muted);
}

.language-select {
  width: 140px;
}

.action-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tab-button {
  border-radius: 999px;
  padding: 4px 14px;
}

.action-input {
  width: 100%;
}

.action-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.helper {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--vibe-text-muted);
}

.ai-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
}
</style>
