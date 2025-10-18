<script setup lang="ts">
import { computed, onMounted, onErrorCaptured, ref, watch } from "vue";
import {
  useSettingsStore,
  type ThemePreset,
  type CustomThemePalette,
  type QuickActionConfig,
  AI_PROVIDER_PRESETS,
} from "@/store/settings";
import { useHistoryStore } from "@/store/history";
import { useMessage } from "naive-ui";
import AppInfo from "@/AppInfo";
import { safeInvoke, isTauriRuntime } from "@/libs/tauri";
import { useLocale } from "@/composables/useLocale";
import { useContextMenu, type ContextMenuItem } from "@/composables/useContextMenu";
import GlobalContextMenu from "@/components/system/GlobalContextMenu.vue";
import type { AiActionKind } from "@/types/history";
import MdiContentCopy from "~icons/mdi/content-copy";
import MdiDeleteOutline from "~icons/mdi/delete-outline";
import MdiArrowUp from "~icons/mdi/arrow-up";
import MdiArrowDown from "~icons/mdi/arrow-down";
import MdiPlus from "~icons/mdi/plus";
import MdiCheckCircle from "~icons/mdi/check-circle";
import MdiCircleOutline from "~icons/mdi/circle-outline";

const settings = useSettingsStore();
const history = useHistoryStore();
const message = useMessage();
const { t, languageOptions, format } = useLocale();
const contextMenu = useContextMenu();

const pageError = ref<string | null>(null);
const isInitializing = ref(false);
const runtimeSummary = ref<{ appVersion: string; tauriVersion: string; rustcChannel: string } | null>(null);

const booting = computed(() => !settings.hydrated);

const historyLimitValue = computed({
  get: () => settings.historyLimit,
  set: value => {
    const normalized = Number.isFinite(value) ? Number(value) : 200;
    settings.historyLimit = Math.min(Math.max(normalized, 50), 2000);
  },
});

const retentionDaysValue = computed({
  get: () => settings.historyRetentionDays ?? 0,
  set: value => {
    const normalized = Number.isFinite(value) ? Number(value) : 0;
    settings.historyRetentionDays = normalized > 0 ? Math.round(normalized) : null;
  },
});

const themePresetValue = computed<ThemePreset>({
  get: () => settings.themePreset as ThemePreset,
  set: value => {
    settings.setThemePreset(value);
  },
});

const themePresetOptions = computed(() => [
  {
    value: "aurora" as ThemePreset,
    label: t("settings.presetAurora", "极光蓝"),
    preview: "linear-gradient(135deg, #5161ff 0%, #7ad1f5 100%)",
  },
  {
    value: "sunset" as ThemePreset,
    label: t("settings.presetSunset", "暮光橙"),
    preview: "linear-gradient(135deg, #ff7a6a 0%, #ffd86b 100%)",
  },
  {
    value: "midnight" as ThemePreset,
    label: t("settings.presetMidnight", "薄荷夜"),
    preview: "linear-gradient(135deg, #2b5876 0%, #4ecca3 100%)",
  },
  {
    value: "forest" as ThemePreset,
    label: t("settings.presetForest", "森野绿"),
    preview: "linear-gradient(135deg, #4caf50 0%, #8bc34a 100%)",
  },
  {
    value: "nebula" as ThemePreset,
    label: t("settings.presetNebula", "星云紫"),
    preview: "linear-gradient(135deg, #9b6bff 0%, #f7a8ff 100%)",
  },
  {
    value: "ember" as ThemePreset,
    label: t("settings.presetEmber", "炽焰金"),
    preview: "linear-gradient(135deg, #ff9f4d 0%, #ffc76b 100%)",
  },
  {
    value: "custom" as ThemePreset,
    label: t("settings.presetCustom", "自定义"),
    preview: "linear-gradient(135deg, var(--vibe-accent) 0%, rgba(255, 255, 255, 0.8) 100%)",
  },
]);

const customThemePreview = computed(() => settings.customThemePalette);

function updateCustomTheme<K extends keyof CustomThemePalette>(key: K, value: string) {
  settings.updateCustomTheme({ [key]: value } as Pick<CustomThemePalette, K>);
}

const handleCustomColorChange = (key: keyof CustomThemePalette) => (value: string) => {
  updateCustomTheme(key, value);
};

const ignoredSourcesText = computed({
  get: () => settings.ignoredSources.join("\n"),
  set: value => {
    settings.ignoredSources = value
      .split(/\r?\n/)
      .map(entry => entry.trim())
      .filter(entry => entry.length > 0);
  },
});

const historyCountLabel = computed(() =>
  format("settings.historyCount", "剪贴板条目 {count}", { count: history.items.length })
);

const quickActionKindOptions = computed(() => [
  { value: "translate" as AiActionKind, label: t("ai.actions.translate", "翻译") },
  { value: "summarize" as AiActionKind, label: t("ai.actions.summarize", "摘要") },
  { value: "polish" as AiActionKind, label: t("ai.actions.polish", "润色") },
  { value: "jsonify" as AiActionKind, label: t("ai.actions.jsonify", "结构化") },
  { value: "custom" as AiActionKind, label: t("ai.actions.custom", "自定义") },
]);

const quickActionLanguageOptions = computed(() => [
  { value: "", label: t("settings.quickActionsLanguageAuto", "跟随首选语言") },
  { value: "zh-CN", label: t("ai.languages.zh", "中文") },
  { value: "en", label: t("ai.languages.en", "English") },
  { value: "ja", label: t("ai.languages.ja", "日本語") },
  { value: "ko", label: t("ai.languages.ko", "한국어") },
  { value: "fr", label: t("ai.languages.fr", "Français") },
]);

function reportError(label: string, error: unknown) {
  console.error(label, error);
  const detail = error instanceof Error ? error.message : String(error ?? "");
  message.error(`${label}${detail ? `：${detail}` : ""}`);
}

async function handleAutoLaunchChange(value: boolean) {
  try {
    await settings.toggleAutoLaunch(value);
    message.success(value ? "已开启开机自启" : "已关闭开机自启");
  } catch (error) {
    reportError("更新开机自启失败", error);
  }
}

async function clearHistory() {
  try {
    await history.clearHistory();
    message.success("缓存已清理");
  } catch (error) {
    reportError("清理缓存失败", error);
  }
}

const showAddProviderDialog = ref(false);
const selectedPreset = ref<'openai' | 'gemini' | 'claude' | 'custom'>('openai');

const presetOptions = [
  { value: 'openai' as const, label: AI_PROVIDER_PRESETS.openai.name },
  { value: 'gemini' as const, label: AI_PROVIDER_PRESETS.gemini.name },
  { value: 'claude' as const, label: AI_PROVIDER_PRESETS.claude.name },
  { value: 'custom' as const, label: '自定义服务商' },
];

function openAddProviderDialog() {
  selectedPreset.value = 'openai';
  showAddProviderDialog.value = true;
}

function handleAddProvider() {
  const newProvider = settings.addAIProvider(selectedPreset.value);
  showAddProviderDialog.value = false;
  message.success(`已添加 ${newProvider.name}`);
}

function handleRemoveProvider(id: string) {
  const provider = settings.aiProviders.find(p => p.id === id);
  if (!provider) return;
  if (settings.aiProviders.length === 1) {
    message.error("至少需要保留一个服务商");
    return;
  }
  settings.removeAIProvider(id);
  message.success(`已删除 ${provider.name}`);
}

function handleToggleProvider(id: string) {
  const provider = settings.aiProviders.find(p => p.id === id);
  if (!provider) return;
  settings.updateAIProvider(id, { enabled: !provider.enabled });
  message.success(provider.enabled ? `已禁用 ${provider.name}` : `已启用 ${provider.name}`);
}

function handleSetActiveProvider(id: string) {
  settings.setActiveProvider(id);
  const provider = settings.aiProviders.find(p => p.id === id);
  if (provider) {
    message.success(`已切换到 ${provider.name}`);
  }
}

function updateQuickAction(id: string, patch: Partial<QuickActionConfig>) {
  const current = settings.quickActions.find(action => action.id === id);
  if (!current) return;
  settings.upsertQuickAction({ ...current, ...patch });
}

function setQuickActionEnabled(action: QuickActionConfig, value: boolean) {
  updateQuickAction(action.id, { enabled: value });
}

function setQuickActionLabel(action: QuickActionConfig, value: string) {
  updateQuickAction(action.id, { label: value });
}

function setQuickActionLanguage(action: QuickActionConfig, value: string | null) {
  const normalized = value && value.trim().length ? value : null;
  updateQuickAction(action.id, { language: normalized });
}

function setQuickActionPrompt(action: QuickActionConfig, value: string) {
  updateQuickAction(action.id, { promptTemplate: value });
}

function setQuickActionDescription(action: QuickActionConfig, value: string) {
  updateQuickAction(action.id, { description: value });
}

function handleQuickActionLanguageChange(action: QuickActionConfig, value: unknown) {
  if (typeof value === "string") {
    setQuickActionLanguage(action, value);
    return;
  }
  setQuickActionLanguage(action, null);
}

function setQuickActionAllowPrompt(action: QuickActionConfig, value: boolean) {
  updateQuickAction(action.id, { allowCustomPrompt: value });
}

function handleQuickActionKindChange(action: QuickActionConfig, value: unknown) {
  const kind = (typeof value === "string" ? value : action.kind) as AiActionKind;
  const patch: Partial<QuickActionConfig> = { kind };
  if (kind !== "custom") {
    patch.promptTemplate = null;
    patch.allowCustomPrompt = false;
  } else if (!action.promptTemplate) {
    patch.promptTemplate = "";
    patch.allowCustomPrompt = true;
  }
  updateQuickAction(action.id, patch);
}

function addQuickAction() {
  const id = `custom-${Date.now().toString(36)}`;
  settings.upsertQuickAction({
    id,
    label: t("settings.quickActionsNew", "新的快捷指令"),
    kind: "custom",
    enabled: true,
    description: "",
    language: settings.preferredLanguage,
    promptTemplate: "",
    allowCustomPrompt: true,
  });
}

function removeQuickAction(id: string) {
  settings.removeQuickAction(id);
}

function resetQuickActions() {
  settings.resetQuickActions();
  message.success(t("settings.quickActionsResetSuccess", "已恢复默认快捷指令"));
}

function getQuickActionContextMenuItems(_action: QuickActionConfig, index: number): ContextMenuItem[] {
  const items: ContextMenuItem[] = [
    { key: "copy", label: t("contextMenu.copy", "复制配置"), icon: MdiContentCopy },
  ];
  
  if (index > 0) {
    items.push({ key: "move-up", label: "上移", icon: MdiArrowUp });
  }
  
  if (index < settings.quickActions.length - 1) {
    items.push({ key: "move-down", label: "下移", icon: MdiArrowDown });
  }
  
  items.push(
    { key: "divider-1", label: "", divider: true },
    { 
      key: "delete", 
      label: t("settings.quickActionsRemove", "删除"), 
      icon: MdiDeleteOutline, 
      danger: true,
      disabled: settings.quickActions.length <= 1
    }
  );
  
  return items;
}

function handleQuickActionContextMenu(event: MouseEvent, action: QuickActionConfig, index: number) {
  const items = getQuickActionContextMenuItems(action, index);
  contextMenu.showContextMenu(event, items, {
    type: "quick-action",
    data: { action, index },
    position: { x: event.clientX, y: event.clientY },
  });
}

async function handleContextMenuSelect(key: string) {
  const ctx = contextMenu.state.context;
  contextMenu.closeContextMenu();
  
  if (!ctx || ctx.type !== "quick-action") return;
  
  const { action, index } = ctx.data;
  
  switch (key) {
    case "copy": {
      const copy = {
        ...action,
        id: `custom-${Date.now().toString(36)}`,
        label: `${action.label} (副本)`,
      };
      settings.upsertQuickAction(copy);
      message.success("已复制快捷指令");
      break;
    }
    case "move-up":
      if (index > 0) {
        const actions = [...settings.quickActions];
        [actions[index - 1], actions[index]] = [actions[index], actions[index - 1]];
        settings.quickActions = actions;
      }
      break;
    case "move-down":
      if (index < settings.quickActions.length - 1) {
        const actions = [...settings.quickActions];
        [actions[index], actions[index + 1]] = [actions[index + 1], actions[index]];
        settings.quickActions = actions;
      }
      break;
    case "delete":
      removeQuickAction(action.id);
      break;
  }
}

async function runVacuum() {
  try {
    if (!isTauriRuntime()) {
      message.warning("预览模式下无需整理数据库");
      return;
    }
    await safeInvoke("vacuum_database");
    message.success("数据库已整理");
  } catch (error) {
    reportError("整理数据库失败", error);
  }
}

onMounted(async () => {
  isInitializing.value = true;
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

    try {
      if (isTauriRuntime()) {
        runtimeSummary.value = await safeInvoke("get_runtime_summary");
      } else {
        runtimeSummary.value = {
          appVersion: AppInfo.version.value,
          tauriVersion: "preview",
          rustcChannel: "preview",
        };
      }
    } catch (error) {
      console.warn("[Settings] 无法获取运行时信息", error);
    }
  } catch (error) {
    console.error("[Settings] Mount error:", error);
    pageError.value = error instanceof Error ? error.message : "页面初始化失败";
  } finally {
    isInitializing.value = false;
  }
});

onErrorCaptured((err, _instance, info) => {
  console.error("[Settings] Error captured:", err, info);
  pageError.value = err instanceof Error ? err.message : "组件渲染错误";
  return false;
});
</script>

<template>
  <div class="settings-page">
    <section class="main">
      <n-alert v-if="pageError" type="error" title="页面错误" closable @close="pageError = null">
        {{ pageError }}
      </n-alert>

      <div v-if="booting || isInitializing" class="settings-skeleton">
        <n-skeleton height="36px" :sharp="false" />
        <div class="settings-skeleton-grid">
          <n-skeleton v-for="i in 3" :key="i" height="180px" :sharp="false" />
        </div>
      </div>
      <template v-else>
        <header class="page-header">
          <div>
            <h1>{{ t("settings.title", "设置") }}</h1>
            <p>{{ t("settings.subtitle", "自定义主题、快捷键与 AI 服务连接") }}</p>
          </div>
        </header>

        <n-alert v-if="settings.lastError" type="warning" show-icon class="settings-alert">
          {{ settings.lastError }}
        </n-alert>

        <div class="content-scroll thin-scrollbar">
          <section class="card">
            <h2>{{ t("settings.theme", "主题与显示") }}</h2>
            <n-radio-group v-model:value="settings.themeMode" name="theme">
              <div class="radio-grid">
                <n-radio value="light">{{ t("settings.themeOptions.light", "浅色") }}</n-radio>
                <n-radio value="dark">{{ t("settings.themeOptions.dark", "深色") }}</n-radio>
                <n-radio value="system">{{ t("settings.themeOptions.system", "跟随系统") }}</n-radio>
              </div>
            </n-radio-group>
            <div class="preset-grid">
              <button
                v-for="option in themePresetOptions"
                :key="option.value"
                type="button"
                class="preset-chip"
                :class="{ active: themePresetValue === option.value }"
                @click="themePresetValue = option.value"
              >
                <span class="preset-swatch" :style="{ background: option.preview }" />
                <span>{{ option.label }}</span>
              </button>
            </div>
            <div v-if="themePresetValue === 'custom'" class="custom-theme-grid">
              <div class="field-column">
                <label>{{ t("settings.customBackground", "背景色") }}</label>
                <n-color-picker
                  :value="customThemePreview.background"
                  size="small"
                  @update:value="handleCustomColorChange('background')($event)"
                />
              </div>
              <div class="field-column">
                <label>{{ t("settings.customSurface", "面板色") }}</label>
                <n-color-picker
                  :value="customThemePreview.surface"
                  size="small"
                  @update:value="handleCustomColorChange('surface')($event)"
                />
              </div>
              <div class="field-column">
                <label>{{ t("settings.customSurfaceStrong", "高亮面板") }}</label>
                <n-color-picker
                  :value="customThemePreview.surfaceStrong"
                  size="small"
                  @update:value="handleCustomColorChange('surfaceStrong')($event)"
                />
              </div>
              <div class="field-column">
                <label>{{ t("settings.customBorder", "边框色") }}</label>
                <n-color-picker
                  :value="customThemePreview.border"
                  size="small"
                  @update:value="handleCustomColorChange('border')($event)"
                />
              </div>
              <div class="field-column">
                <label>{{ t("settings.customTextPrimary", "主文本") }}</label>
                <n-color-picker
                  :value="customThemePreview.textPrimary"
                  size="small"
                  @update:value="handleCustomColorChange('textPrimary')($event)"
                />
              </div>
              <div class="field-column">
                <label>{{ t("settings.customTextSecondary", "次文本") }}</label>
                <n-color-picker
                  :value="customThemePreview.textSecondary"
                  size="small"
                  @update:value="handleCustomColorChange('textSecondary')($event)"
                />
              </div>
              <div class="field-column">
                <label>{{ t("settings.customTextMuted", "弱文本") }}</label>
                <n-color-picker
                  :value="customThemePreview.textMuted"
                  size="small"
                  @update:value="handleCustomColorChange('textMuted')($event)"
                />
              </div>
            </div>
            <div class="field-row">
              <label>{{ t("settings.lineHeight", "内容行高") }}</label>
              <n-slider v-model:value="settings.lineHeight" :step="0.1" :min="1.2" :max="2" style="flex: 1;" />
              <span class="field-value">{{ settings.lineHeight.toFixed(1) }}</span>
            </div>
            <div class="field-row">
              <label>{{ t("settings.accent", "强调颜色") }}</label>
              <n-color-picker v-model:value="settings.accentColor" size="small" />
            </div>
            <div class="field-row">
              <label>{{ t("settings.uiLanguage", "界面语言") }}</label>
              <n-select v-model:value="settings.uiLanguage" size="small" :options="languageOptions" />
            </div>
            <div class="field-row">
              <label>{{ t("settings.shortcut", "全局快捷键") }}</label>
              <n-input v-model:value="settings.globalShortcut" placeholder="CmdOrControl+Shift+V" />
            </div>
          </section>

          <section class="card onboarding-card">
            <div class="onboarding-callout">
              <div class="callout-text">
                <span class="callout-chip">{{ t("settings.quickstart", "快速上手指南") }}</span>
                <h3>{{ t("settings.quickstartTitle", "动画教学随时重播") }}</h3>
                <p>{{ t("settings.quickstartHint", "如果错过了首次安装提示，可在此重新打开引导。") }}</p>
              </div>
              <n-button type="primary" size="tiny" @click="settings.openOnboarding()">
                {{ t("settings.quickstartAction", "重新打开引导") }}
              </n-button>
            </div>
          </section>

          <section class="card">
            <h2>{{ t("settings.clipboard", "剪贴板与历史") }}</h2>
            <div class="field-row">
              <label>{{ t("settings.historyLimit", "历史条目上限") }}</label>
              <n-input-number v-model:value="historyLimitValue" :min="50" :max="2000" size="small" />
            </div>
            <div class="field-row">
              <label>{{ t("settings.retention", "保留天数 (0 表示无限)") }}</label>
              <n-input-number v-model:value="retentionDaysValue" :min="0" :max="365" size="small" />
            </div>
            <div class="switch-row">
              <span>{{ t("settings.dedupe", "启用去重") }}</span>
              <n-switch v-model:value="settings.dedupeEnabled" size="small" />
            </div>
            <div class="switch-row">
              <span>{{ t("settings.ignoreSelf", "忽略自复制") }}</span>
              <n-switch v-model:value="settings.ignoreSelfCopies" size="small" />
            </div>
            <div class="field-column">
              <label>{{ t("settings.ignoredSources", "忽略的来源关键字") }}</label>
              <n-input
                v-model:value="ignoredSourcesText"
                type="textarea"
                :autosize="{ minRows: 3, maxRows: 6 }"
                placeholder="每行一个关键词"
              />
            </div>
          </section>

          <section class="card">
            <div class="section-header">
              <h2>{{ t("settings.ai", "AI 服务商") }}</h2>
              <n-button size="tiny" type="primary" @click="openAddProviderDialog">
                <template #icon>
                  <n-icon :component="MdiPlus" />
                </template>
                添加服务商
              </n-button>
            </div>

            <div class="providers-list">
              <div
                v-for="provider in settings.aiProviders"
                :key="provider.id"
                class="provider-card"
                :class="{ active: settings.activeProviderId === provider.id, disabled: !provider.enabled }"
              >
                <div class="provider-header">
                  <div class="provider-info">
                    <n-icon
                      :component="settings.activeProviderId === provider.id ? MdiCheckCircle : MdiCircleOutline"
                      size="20"
                      :class="{ 'active-icon': settings.activeProviderId === provider.id }"
                      @click="handleSetActiveProvider(provider.id)"
                      style="cursor: pointer;"
                    />
                    <span class="provider-name">{{ provider.name }}</span>
                    <n-tag v-if="provider.preset" size="tiny" type="info">{{ provider.preset }}</n-tag>
                  </div>
                  <div class="provider-actions">
                    <n-button
                      size="tiny"
                      quaternary
                      :type="provider.enabled ? 'default' : 'success'"
                      @click="handleToggleProvider(provider.id)"
                    >
                      {{ provider.enabled ? '禁用' : '启用' }}
                    </n-button>
                    <n-button
                      size="tiny"
                      quaternary
                      type="error"
                      @click="handleRemoveProvider(provider.id)"
                    >
                      删除
                    </n-button>
                  </div>
                </div>

                <div class="provider-fields">
                  <div class="field-row">
                    <label>{{ t("settings.apiBase", "接口地址") }}</label>
                    <n-input
                      :value="provider.baseUrl"
                      @update:value="(val: string) => settings.updateAIProvider(provider.id, { baseUrl: val })"
                      placeholder="https://"
                      size="small"
                    />
                  </div>
                  <div class="field-row">
                    <label>{{ t("settings.apiKey", "API Key") }}</label>
                    <n-input
                      :value="provider.apiKey"
                      @update:value="(val: string) => settings.updateAIProvider(provider.id, { apiKey: val })"
                      type="password"
                      show-password-on="click"
                      size="small"
                    />
                  </div>
                  <div class="field-row">
                    <label>{{ t("settings.model", "模型") }}</label>
                    <n-input
                      :value="provider.model"
                      @update:value="(val: string) => settings.updateAIProvider(provider.id, { model: val })"
                      placeholder="gemini-2.5-flash"
                      size="small"
                    />
                  </div>
                  <div class="field-row">
                    <label>{{ t("settings.temperature", "温度") }}</label>
                    <n-slider
                      :value="provider.temperature"
                      @update:value="(val: number) => settings.updateAIProvider(provider.id, { temperature: val })"
                      :step="0.1"
                      :min="0"
                      :max="1"
                      style="flex: 1;"
                    />
                    <span class="field-value">{{ provider.temperature.toFixed(1) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <n-modal v-model:show="showAddProviderDialog" preset="dialog" title="添加 AI 服务商">
            <div class="field-column" style="gap: 16px;">
              <div class="field-row">
                <label>选择预设</label>
                <n-select v-model:value="selectedPreset" :options="presetOptions" />
              </div>
            </div>
            <template #action>
              <n-button @click="showAddProviderDialog = false">取消</n-button>
              <n-button type="primary" @click="handleAddProvider">添加</n-button>
            </template>
          </n-modal>

          <section class="card">
            <h2>{{ t("settings.quickActions", "AI 快捷按钮") }}</h2>
            <p class="muted">{{ t("settings.quickActionsHint", "自定义列表、语言与 Prompt，让浮窗与面板更贴合使用习惯") }}</p>
            <div class="quick-actions-list">
              <article 
                v-for="(action, index) in settings.quickActions" 
                :key="action.id" 
                class="quick-action-item"
                @contextmenu="handleQuickActionContextMenu($event, action, index)"
              >
                <div class="quick-action-header">
                  <n-switch
                    :value="action.enabled !== false"
                    size="small"
                    @update:value="setQuickActionEnabled(action, $event)"
                  />
                  <n-input
                    class="quick-action-name"
                    size="small"
                    :value="action.label"
                    :placeholder="t('settings.quickActionsNamePlaceholder', '快捷指令名称')"
                    @update:value="setQuickActionLabel(action, $event)"
                  />
                  <n-button
                    size="tiny"
                    quaternary
                    @click="removeQuickAction(action.id)"
                    :disabled="settings.quickActions.length <= 1"
                  >
                    {{ t("settings.quickActionsRemove", "删除") }}
                  </n-button>
                </div>
                <div class="quick-action-grid">
                  <n-select
                    class="quick-action-kind"
                    size="small"
                    :value="action.kind"
                    :options="quickActionKindOptions"
                    @update:value="handleQuickActionKindChange(action, $event)"
                  />
                  <n-select
                    class="quick-action-language"
                    size="small"
                    :value="action.language ?? ''"
                    :options="quickActionLanguageOptions"
                    @update:value="handleQuickActionLanguageChange(action, $event)"
                  />
                  <n-switch
                    v-if="action.kind === 'custom'"
                    size="small"
                    :value="action.allowCustomPrompt !== false"
                    @update:value="setQuickActionAllowPrompt(action, $event)"
                  >
                    {{ t("settings.quickActionsAllowEdit", "允许执行时编辑 Prompt") }}
                  </n-switch>
                </div>
                <n-input
                  v-if="action.kind === 'custom'"
                  type="textarea"
                  :value="action.promptTemplate ?? ''"
                  :autosize="{ minRows: 2, maxRows: 4 }"
                  :placeholder="t('settings.quickActionsPromptPlaceholder', '可选：执行时的默认 Prompt，支持 {{clipboard}} 占位符')"
                  @update:value="setQuickActionPrompt(action, $event)"
                />
                <n-input
                  type="textarea"
                  :value="action.description ?? ''"
                  :autosize="{ minRows: 1, maxRows: 2 }"
                  :placeholder="t('settings.quickActionsDescriptionPlaceholder', '可选：用于在面板中显示的说明')"
                  @update:value="setQuickActionDescription(action, $event)"
                />
              </article>
            </div>
            <div class="quick-action-footer">
              <n-button size="tiny" tertiary @click="addQuickAction">
                {{ t("settings.quickActionsAdd", "新增自定义指令") }}
              </n-button>
              <n-button size="tiny" quaternary @click="resetQuickActions">
                {{ t("settings.quickActionsReset", "恢复默认") }}
              </n-button>
            </div>
          </section>

          <section class="card">
            <h2>{{ t("settings.historyActions", "历史维护") }}</h2>
            <div class="switch-row">
              <span>{{ t("settings.autoLaunch", "开机自启") }}</span>
              <n-switch :value="settings.autoLaunch" size="small" @update:value="handleAutoLaunchChange" />
            </div>
            <div class="switch-row">
              <span>{{ t("settings.offline", "离线模式") }}</span>
              <n-switch v-model:value="settings.offlineMode" size="small" />
            </div>
            <div class="field-row">
              <label>{{ t("settings.languagePreference", "AI 输出语言") }}</label>
              <n-input v-model:value="settings.preferredLanguage" placeholder="zh-CN" />
            </div>
            <div class="button-grid">
              <n-button size="tiny" secondary @click="history.exportHistory">{{ t("settings.export", "导出历史") }}</n-button>
              <n-button size="tiny" secondary @click="history.importHistory">{{ t("settings.import", "导入历史") }}</n-button>
              <n-button size="tiny" secondary @click="runVacuum">{{ t("settings.vacuum", "整理数据库") }}</n-button>
              <n-button size="tiny" secondary @click="clearHistory">{{ t("settings.clearCache", "清除缓存") }}</n-button>
            </div>
          </section>

          <section class="card">
            <h2>{{ t("settings.version", "版本") }}</h2>
            <ul class="runtime-list">
              <li>{{ t("settings.version", "版本") }}：{{ AppInfo.version.value }}</li>
              <li v-if="runtimeSummary">Tauri：{{ runtimeSummary.tauriVersion }}</li>
              <li v-if="runtimeSummary">Rust：{{ runtimeSummary.rustcChannel }}</li>
              <li>{{ historyCountLabel }}</li>
            </ul>
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
.settings-page {
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

.page-header h1 {
  margin: 0;
  font-size: 20px;
}

.page-header p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--vibe-text-muted);
}

.settings-alert {
  border-radius: var(--vibe-radius-lg);
}

.quick-actions-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.quick-action-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: var(--vibe-radius-md);
  background: var(--vibe-panel-surface-strong);
  border: 1px solid color-mix(in srgb, var(--vibe-panel-border) 70%, transparent);
}

.quick-action-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.quick-action-name {
  flex: 1;
  min-width: 160px;
}

.quick-action-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.quick-action-kind,
.quick-action-language {
  width: 160px;
}

.quick-action-footer {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.providers-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.provider-card {
  border-radius: 12px;
  background: rgba(var(--vibe-accent-rgb), 0.05);
  border: 1px solid rgba(var(--vibe-accent-rgb), 0.15);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: all 0.2s ease;
}

.provider-card.active {
  background: rgba(var(--vibe-accent-rgb), 0.12);
  border-color: var(--vibe-accent);
}

.provider-card.disabled {
  opacity: 0.5;
}

.provider-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.provider-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.provider-name {
  font-weight: 600;
  font-size: 14px;
}

.active-icon {
  color: var(--vibe-accent);
}

.provider-actions {
  display: flex;
  gap: 6px;
}

.provider-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--vibe-panel-border);
}

.content-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 4px;
}

.card {
  border-radius: var(--vibe-radius-lg);
  background: var(--vibe-panel-surface);
  border: 1px solid var(--vibe-panel-border);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card h2 {
  margin: 0;
  font-size: 16px;
}

.field-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.field-row label {
  width: 100px;
  font-size: 12px;
  color: var(--vibe-text-muted);
}

.field-value {
  min-width: 40px;
  text-align: right;
  font-size: 13px;
}

.field-column {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.button-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.radio-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.preset-grid {
  margin-top: 6px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.custom-theme-grid {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.custom-theme-grid label {
  font-size: 12px;
  color: var(--vibe-text-muted);
}

.custom-theme-grid :deep(.n-color-picker) {
  width: 100%;
}

.preset-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--vibe-panel-border);
  background: var(--vibe-panel-surface);
  border-radius: var(--vibe-radius-md);
  padding: 8px;
  cursor: pointer;
  transition: border 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}

.preset-chip.active {
  border-color: var(--vibe-accent);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
  transform: translateY(-2px);
}

.preset-chip span:last-child {
  font-weight: 600;
  font-size: 11px;
  text-align: center;
}

.preset-swatch {
  width: 100%;
  height: 24px;
  border-radius: var(--vibe-radius-sm);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.4);
}

.onboarding-card {
  position: relative;
  overflow: hidden;
  background: linear-gradient(140deg, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.78));
}

.dark .onboarding-card {
  background: linear-gradient(150deg, rgba(22, 26, 40, 0.94), rgba(27, 34, 52, 0.88));
}

.onboarding-card::before {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(120% 120% at 16% 16%, rgba(81, 97, 255, 0.18), transparent 70%);
  opacity: 0.6;
  pointer-events: none;
}

.onboarding-callout {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  z-index: 1;
}

.callout-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.callout-text h3 {
  margin: 0;
  font-size: 16px;
}

.callout-text p {
  margin: 0;
  font-size: 12px;
  color: var(--vibe-text-muted);
}

.callout-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: color-mix(in srgb, var(--vibe-accent) 20%, transparent);
  color: var(--vibe-text-secondary);
}

.runtime-list {
  margin: 0;
  padding-left: 18px;
  color: var(--vibe-text-muted);
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.settings-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.settings-skeleton-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

@media (max-width: 520px) {
  .card {
    padding: 12px;
  }

  .field-row label {
    width: 90px;
  }

  .button-grid {
    grid-template-columns: repeat(1, minmax(0, 1fr));
  }
}
</style>
