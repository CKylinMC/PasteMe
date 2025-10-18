import { defineStore } from "pinia";
import { computed, reactive, ref, toRefs, watch } from "vue";
import type { GlobalThemeOverrides } from "naive-ui";
import { disable as disableAutoLaunch, enable as enableAutoLaunch, isEnabled as isAutoLaunchEnabled } from "@tauri-apps/plugin-autostart";
import { notifyError } from "@/utils/notifier";
import { safeInvoke, isTauriRuntime, explainTauriFallback, TauriUnavailableError } from "@/libs/tauri";
import type { AiActionKind } from "@/types/history";

const STORAGE_KEY = "vibeclip.settings";
const LOCAL_STORAGE_KEY = "vibeclip.settings.preview";

export interface QuickActionConfig {
  id: string;
  label: string;
  kind: AiActionKind;
  enabled: boolean;
  description?: string | null;
  language?: string | null;
  promptTemplate?: string | null;
  allowCustomPrompt?: boolean;
}

export interface AIProviderConfig {
  id: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  enabled: boolean;
  preset?: 'openai' | 'gemini' | 'claude' | 'custom';
}

export type ThemePreset =
  | "aurora"
  | "sunset"
  | "midnight"
  | "forest"
  | "nebula"
  | "ember"
  | "custom";

export interface CustomThemePalette {
  background: string;
  surface: string;
  surfaceStrong: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
}

interface PersistedSettings {
  themeMode: "light" | "dark" | "system";
  themePreset: ThemePreset;
  accentColor: string;
  customTheme: CustomThemePalette;
  lineHeight: number;
  globalShortcut: string;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  offlineMode: boolean;
  autoLaunch: boolean;
  preferredLanguage: string;
  uiLanguage: "zh-CN" | "en-US";
  hasCompletedOnboarding: boolean;
  historyLimit: number;
  historyRetentionDays: number | null;
  dedupeEnabled: boolean;
  ignoreSelfCopies: boolean;
  ignoredSources: string[];
  logLevel: "info" | "debug";
  quickActions: QuickActionConfig[];
  aiProviders: AIProviderConfig[];
  activeProviderId: string;
}

const THEME_PRESET_ACCENTS: Record<Exclude<ThemePreset, "custom">, string> = {
  aurora: "#5161ff",
  sunset: "#ff7a6a",
  midnight: "#6bd6b1",
  forest: "#5bb861",
  nebula: "#a86bff",
  ember: "#ff9f4d",
};

const DEFAULT_CUSTOM_THEME: CustomThemePalette = {
  background: "#f5f1ff",
  surface: "rgba(255, 255, 255, 0.88)",
  surfaceStrong: "rgba(255, 255, 255, 0.94)",
  border: "rgba(120, 85, 255, 0.16)",
  textPrimary: "#241432",
  textSecondary: "rgba(36, 20, 50, 0.72)",
  textMuted: "rgba(36, 20, 50, 0.45)",
};

const THEME_PRESETS = [
  "aurora",
  "sunset",
  "midnight",
  "forest",
  "nebula",
  "ember",
  "custom",
] as ThemePreset[];

const THEME_PRESET_CLASSES = THEME_PRESETS
  .filter(preset => preset !== "custom")
  .map(preset => `theme-${preset}`);

export const AI_PROVIDER_PRESETS = {
  openai: {
    name: 'OpenAI Compatible',
    baseUrl: 'https://api.freekey.site',
    model: 'gemini-2.5-flash',
    temperature: 0.3,
  },
  gemini: {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.0-flash-exp',
    temperature: 0.3,
  },
  claude: {
    name: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.3,
  },
} as const;

const DEFAULT_AI_PROVIDERS: AIProviderConfig[] = [
  {
    id: 'default-openai',
    name: AI_PROVIDER_PRESETS.openai.name,
    apiKey: '',
    baseUrl: AI_PROVIDER_PRESETS.openai.baseUrl,
    model: AI_PROVIDER_PRESETS.openai.model,
    temperature: AI_PROVIDER_PRESETS.openai.temperature,
    enabled: true,
    preset: 'openai',
  },
];

const DEFAULT_QUICK_ACTIONS: QuickActionConfig[] = [
  {
    id: "translate",
    label: "AI 翻译",
    kind: "translate",
    enabled: true,
    description: "将文本翻译为当前首选语言",
  },
  {
    id: "summarize",
    label: "AI 摘要",
    kind: "summarize",
    enabled: true,
    description: "提炼关键要点并输出条列摘要",
  },
  {
    id: "polish",
    label: "AI 润色",
    kind: "polish",
    enabled: true,
    description: "提升段落语气与可读性",
  },
  {
    id: "jsonify",
    label: "结构化 JSON",
    kind: "jsonify",
    enabled: true,
    description: "整理为标准 JSON 对象",
  },
  {
    id: "custom-brief",
    label: "会议纪要",
    kind: "custom",
    enabled: true,
    description: "生成行动项与风险提示",
    promptTemplate:
      "你是 VibeClip Pro。请针对 {{clipboard}} 整理会议纪要：\n- 以 3 行概括背景；\n- 输出表格列出负责人/事项/截止日；\n- 附上风险与下一步建议。",
  },
  {
    id: "custom-free",
    label: "自定义指令",
    kind: "custom",
    enabled: true,
    description: "手动填写 Prompt 完成任意处理",
    allowCustomPrompt: true,
  },
];

function cloneDefaultQuickActions(): QuickActionConfig[] {
  return DEFAULT_QUICK_ACTIONS.map(action => ({ ...action }));
}

function cloneDefaultAIProviders(): AIProviderConfig[] {
  return DEFAULT_AI_PROVIDERS.map(provider => ({ ...provider }));
}

const DEFAULT_SETTINGS: PersistedSettings = {
  themeMode: "light",
  themePreset: "nebula",
  accentColor: "#a86bff",
  customTheme: { ...DEFAULT_CUSTOM_THEME },
  lineHeight: 1.5,
  globalShortcut: "CmdOrControl+Shift+V",
  apiBaseUrl: "https://api.freekey.site",
  apiKey: "",
  model: "gemini-2.5-flash",
  temperature: 0.3,
  offlineMode: false,
  autoLaunch: false,
  preferredLanguage: "zh-CN",
  uiLanguage: "zh-CN",
  hasCompletedOnboarding: false,
  historyLimit: 500,
  historyRetentionDays: null,
  dedupeEnabled: true,
  ignoreSelfCopies: true,
  ignoredSources: [],
  logLevel: "info",
  quickActions: cloneDefaultQuickActions(),
  aiProviders: cloneDefaultAIProviders(),
  activeProviderId: 'default-openai',
};

function blend(color: string, target: string, ratio: number) {
  const hex = color.replace("#", "");
  const targetHex = target.replace("#", "");
  const r = Math.round(
    parseInt(hex.substring(0, 2), 16) * (1 - ratio) +
    parseInt(targetHex.substring(0, 2), 16) * ratio
  );
  const g = Math.round(
    parseInt(hex.substring(2, 4), 16) * (1 - ratio) +
    parseInt(targetHex.substring(2, 4), 16) * ratio
  );
  const b = Math.round(
    parseInt(hex.substring(4, 6), 16) * (1 - ratio) +
    parseInt(targetHex.substring(4, 6), 16) * ratio
  );
  return `#${r.toString(16).padStart(2, "0")}${g
    .toString(16)
    .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export const useSettingsStore = defineStore("settings", () => {
  const state = reactive<PersistedSettings>({ ...DEFAULT_SETTINGS });
  const initialized = ref(false);
  const hydrated = ref(false);
  const lastError = ref<string | null>(null);
  const isDarkPreferred = ref(false);
  const onboardingVisible = ref(false);
  let persistTimer: number | null = null;
  const stateRefs = toRefs(state);
  const LOAD_TIMEOUT = 3000;

  function recordError(message: string, error: unknown, shouldNotify = false) {
    const reason = error instanceof Error ? error : new Error(String(error ?? message));
    console.error(message, reason);
    if (reason instanceof TauriUnavailableError) {
      const fallbackMessage = explainTauriFallback();
      lastError.value = fallbackMessage;
      if (shouldNotify) {
        notifyError(fallbackMessage);
      }
      return reason;
    }
    lastError.value = `${message}: ${reason.message}`;
    if (shouldNotify) {
      notifyError(`${message}：${reason.message}`);
    }
    return reason;
  }

  const themeClass = computed(() =>
    stateRefs.themeMode.value === "dark" ||
      (stateRefs.themeMode.value === "system" && isDarkPreferred.value)
      ? "dark"
      : ""
  );

  const themePresetClass = computed(
    () => `theme-${stateRefs.themePreset.value ?? DEFAULT_SETTINGS.themePreset}`
  );

  const customThemePalette = computed(() => ({
    ...DEFAULT_CUSTOM_THEME,
    ...stateRefs.customTheme.value,
  }));

  const activeAccent = computed(() => {
    const custom = stateRefs.accentColor.value?.trim();
    if (custom) {
      return custom;
    }
    const preset = stateRefs.themePreset.value;
    if (preset && preset !== "custom") {
      return THEME_PRESET_ACCENTS[preset] ?? DEFAULT_SETTINGS.accentColor;
    }
    return DEFAULT_SETTINGS.accentColor;
  });

  const naiveThemeOverrides = computed<GlobalThemeOverrides>(() => {
    const accent = activeAccent.value || DEFAULT_SETTINGS.accentColor;
    const hover = blend(accent, "#ffffff", 0.2);
    const pressed = blend(accent, "#000000", 0.18);
    return {
      common: {
        primaryColor: accent,
        primaryColorHover: hover,
        primaryColorPressed: pressed,
        borderRadius: "14px",
        fontFamily: "var(--vibe-font-sans)",
      },
      Button: {
        borderRadius: "var(--vibe-radius-md)",
        colorHover: hover,
        colorPressed: pressed,
      },
      Card: {
        borderRadius: "var(--vibe-radius-lg)",
        paddingSmall: "18px",
        boxShadow: "var(--vibe-shadow-soft)",
      },
      Input: {
        borderRadius: "var(--vibe-radius-md)",
      },
      Select: {
        borderRadius: "var(--vibe-radius-md)",
      },
      Switch: {
        railBorderRadius: "999px",
      },
    };
  });

  function applyThemeClass() {
    if (typeof document === "undefined") {
      return;
    }
    const root = document.documentElement;
    root.classList.toggle("dark", themeClass.value === "dark");
    root.classList.remove(...THEME_PRESET_CLASSES);
    const preset = stateRefs.themePreset.value;
    const presetClass = preset !== "custom" ? themePresetClass.value : "";
    if (presetClass) {
      root.classList.add(presetClass);
    }
    if (typeof document.body !== "undefined") {
      document.body.dataset.themePreset = stateRefs.themePreset.value;
    }
    const accent = activeAccent.value || DEFAULT_SETTINGS.accentColor;
    const accentStrong = blend(accent, "#000000", 0.2);
    root.style.setProperty("--vibe-accent", accent);
    root.style.setProperty("--vibe-accent-strong", accentStrong);
    applyCustomThemeVariables();
  }

  function applyCustomThemeVariables() {
    if (typeof document === "undefined") {
      return;
    }
    const root = document.documentElement;
    const shouldApply = stateRefs.themePreset.value === "custom";
    const palette = customThemePalette.value;
    const entries: [string, string][] = [
      ["--vibe-bg-app", palette.background],
      ["--vibe-panel-surface", palette.surface],
      ["--vibe-panel-surface-strong", palette.surfaceStrong],
      ["--vibe-panel-border", palette.border],
      ["--vibe-text-primary", palette.textPrimary],
      ["--vibe-text-secondary", palette.textSecondary],
      ["--vibe-text-muted", palette.textMuted],
    ];
    entries.forEach(([key, value]) => {
      if (shouldApply) {
        root.style.setProperty(key, value);
      } else {
        root.style.removeProperty(key);
      }
    });
  }

  function schedulePersist() {
    if (!hydrated.value) return;
    if (persistTimer) {
      window.clearTimeout(persistTimer);
    }
    persistTimer = window.setTimeout(async () => {
      persistTimer = null;
      try {
        if (!isTauriRuntime()) {
          if (typeof window !== "undefined") {
            window.localStorage.setItem(
              LOCAL_STORAGE_KEY,
              JSON.stringify({ ...state }),
            );
          }
          return;
        }
        await safeInvoke("set_value_to_store", {
          key: STORAGE_KEY,
          value: { ...state },
        });
      } catch (error) {
        console.warn("Failed to persist settings", error);
      }
    }, 250);
  }

  async function loadPersisted() {
    try {
      if (!isTauriRuntime()) {
        if (typeof window !== "undefined") {
          const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
          const payload = raw ? JSON.parse(raw) : { ...DEFAULT_SETTINGS };
          Object.assign(state, { ...DEFAULT_SETTINGS, ...payload });
          if (!Array.isArray(state.quickActions) || !state.quickActions.length) {
            state.quickActions = cloneDefaultQuickActions();
          }
          // Migrate to multi-provider system if not present
          if (!Array.isArray(state.aiProviders) || !state.aiProviders.length) {
            state.aiProviders = cloneDefaultAIProviders();
            // Migrate existing settings to default provider
            if (state.apiKey || state.apiBaseUrl || state.model) {
              state.aiProviders[0].apiKey = state.apiKey || '';
              state.aiProviders[0].baseUrl = state.apiBaseUrl || AI_PROVIDER_PRESETS.openai.baseUrl;
              state.aiProviders[0].model = state.model || AI_PROVIDER_PRESETS.openai.model;
              state.aiProviders[0].temperature = state.temperature ?? AI_PROVIDER_PRESETS.openai.temperature;
            }
            state.activeProviderId = state.aiProviders[0].id;
          }
        } else {
          Object.assign(state, { ...DEFAULT_SETTINGS });
        }
        return;
      }
      const payload = await safeInvoke<PersistedSettings>(
        "get_value_from_store",
        {
          key: STORAGE_KEY,
          fallback: { ...DEFAULT_SETTINGS },
        }
      );
      Object.assign(state, { ...DEFAULT_SETTINGS, ...payload });
      if (!Array.isArray(state.quickActions) || !state.quickActions.length) {
        state.quickActions = cloneDefaultQuickActions();
      }
      // Migrate to multi-provider system if not present
      if (!Array.isArray(state.aiProviders) || !state.aiProviders.length) {
        state.aiProviders = cloneDefaultAIProviders();
        // Migrate existing settings to default provider
        if (state.apiKey || state.apiBaseUrl || state.model) {
          state.aiProviders[0].apiKey = state.apiKey || '';
          state.aiProviders[0].baseUrl = state.apiBaseUrl || AI_PROVIDER_PRESETS.openai.baseUrl;
          state.aiProviders[0].model = state.model || AI_PROVIDER_PRESETS.openai.model;
          state.aiProviders[0].temperature = state.temperature ?? AI_PROVIDER_PRESETS.openai.temperature;
        }
        state.activeProviderId = state.aiProviders[0].id;
      }
    } catch (error) {
      Object.assign(state, { ...DEFAULT_SETTINGS });
      recordError("读取配置失败，已使用默认值", error, true);
    }
  }

  function listenSystemTheme() {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      isDarkPreferred.value = media.matches;
      applyThemeClass();
    };
    update();
    media.addEventListener("change", update);
  }

  watch(
    () => [
      stateRefs.themeMode.value,
      stateRefs.themePreset.value,
      stateRefs.accentColor.value,
    ],
    () => {
      applyThemeClass();
      if (hydrated.value) {
        schedulePersist();
      }
    },
    { deep: true }
  );

  watch(
    () => stateRefs.customTheme.value,
    () => {
      applyCustomThemeVariables();
      if (hydrated.value) {
        schedulePersist();
      }
    },
    { deep: true }
  );

  watch(
    () => [
      stateRefs.lineHeight.value,
      stateRefs.globalShortcut.value,
      stateRefs.apiBaseUrl.value,
      stateRefs.apiKey.value,
      stateRefs.model.value,
      stateRefs.temperature.value,
      stateRefs.preferredLanguage.value,
      stateRefs.uiLanguage.value,
      stateRefs.autoLaunch.value,
      stateRefs.historyLimit.value,
      stateRefs.historyRetentionDays.value,
      stateRefs.dedupeEnabled.value,
      stateRefs.ignoreSelfCopies.value,
      stateRefs.logLevel.value,
    ],
    () => {
      if (hydrated.value) {
        schedulePersist();
      }
    },
    { deep: true }
  );

  watch(
    () => stateRefs.uiLanguage.value,
    value => {
      if (typeof document !== "undefined") {
        document.documentElement.lang = value;
      }
    },
    { immediate: true }
  );

  watch(
    () => stateRefs.ignoredSources.value,
    () => {
      if (hydrated.value) {
        schedulePersist();
      }
    },
    { deep: true }
  );

  watch(
    () => stateRefs.quickActions.value,
    value => {
      if (!hydrated.value) return;
      if (!Array.isArray(value) || !value.length) {
        stateRefs.quickActions.value = cloneDefaultQuickActions();
        return;
      }
      schedulePersist();
    },
    { deep: true }
  );

  async function pushRuntimePreferences() {
    if (!hydrated.value) return;
    if (!isTauriRuntime()) return;
    const ignored = stateRefs.ignoredSources.value
      .map(value => value.trim())
      .filter(value => value.length > 0);
    const retentionDays = stateRefs.historyRetentionDays.value;
    try {
      await safeInvoke("update_runtime_preferences", {
        preferences: {
          dedupeEnabled: stateRefs.dedupeEnabled.value,
          debounceIntervalMs: 320,
          ignoreSelfCopies: stateRefs.ignoreSelfCopies.value,
          ignoredKeywords: ignored,
          logLevel: stateRefs.logLevel.value,
          retention: {
            maxEntries: stateRefs.historyLimit.value > 0 ? stateRefs.historyLimit.value : null,
            maxAgeDays:
              typeof retentionDays === "number" && retentionDays > 0
                ? Math.trunc(retentionDays)
                : null,
            vacuumOnStart: true,
          },
        },
      });
    } catch (error) {
      recordError("同步运行偏好失败", error, true);
    }
  }

  watch(
    () => [
      stateRefs.historyLimit.value,
      stateRefs.historyRetentionDays.value,
      stateRefs.dedupeEnabled.value,
      stateRefs.ignoreSelfCopies.value,
      stateRefs.logLevel.value,
      stateRefs.ignoredSources.value,
    ],
    () => {
      void pushRuntimePreferences();
    },
    { deep: true }
  );

  watch(
    () => stateRefs.offlineMode.value,
    async value => {
      if (!hydrated.value) return;
      schedulePersist();
      if (!isTauriRuntime()) return;
      try {
        await safeInvoke("set_offline", { offline: value });
      } catch (error) {
        recordError("更新离线模式失败", error, true);
      }
    }
  );

  watch(
    () => stateRefs.globalShortcut.value,
    async shortcut => {
      if (!hydrated.value) return;
      if (!isTauriRuntime()) return;
      try {
        await safeInvoke("register_history_shortcut", { shortcut });
      } catch (error) {
        recordError("注册全局快捷键失败", error, true);
      }
    }
  );

  async function syncRuntimeFlags() {
    if (!isTauriRuntime()) {
      stateRefs.offlineMode.value = false;
      stateRefs.autoLaunch.value = false;
      return;
    }
    try {
      const status = await safeInvoke<{ offline: boolean; listening: boolean }>(
        "get_app_status"
      );
      stateRefs.offlineMode.value = status.offline;
    } catch (error) {
      recordError("同步应用状态失败", error, true);
    }
    try {
      stateRefs.autoLaunch.value = await isAutoLaunchEnabled();
    } catch (error) {
      recordError("读取开机自启配置失败", error, true);
    }
  }

  async function bootstrap() {
    if (initialized.value) return;
    listenSystemTheme();
    applyThemeClass();
    initialized.value = true;

    const loadWithTimeout = Promise.race<(void | "timeout")>([
      loadPersisted(),
      new Promise<"timeout">(resolve => {
        window.setTimeout(() => resolve("timeout"), LOAD_TIMEOUT);
      }),
    ]);

    void (async () => {
      let outcome: "success" | "timeout" | "error" = "success";
      try {
        const result = await loadWithTimeout;
        if (result === "timeout") {
          outcome = "timeout";
        } else {
          applyThemeClass();
        }
      } catch (error) {
        outcome = "error";
        recordError("加载配置失败", error, true);
      }

      await syncRuntimeFlags();

      if (outcome === "timeout") {
        recordError("读取配置超时，已使用默认值", new Error("timeout"), true);
      }

      hydrated.value = true;
      await pushRuntimePreferences();
    })();
  }

  function setQuickActions(actions: QuickActionConfig[]) {
    const payload = Array.isArray(actions) && actions.length ? actions : cloneDefaultQuickActions();
    stateRefs.quickActions.value = payload.map(item => ({ ...item }));
    if (hydrated.value) {
      schedulePersist();
    }
  }

  function upsertQuickAction(action: QuickActionConfig) {
    const payload = { ...action };
    const list = stateRefs.quickActions.value;
    const index = list.findIndex(entry => entry.id === payload.id);
    if (index >= 0) {
      list.splice(index, 1, payload);
    } else {
      list.push(payload);
    }
    if (hydrated.value) {
      schedulePersist();
    }
  }

  function removeQuickAction(id: string) {
    const next = stateRefs.quickActions.value.filter(item => item.id !== id);
    stateRefs.quickActions.value = next.length ? next : cloneDefaultQuickActions();
    if (hydrated.value) {
      schedulePersist();
    }
  }

  function resetQuickActions() {
    stateRefs.quickActions.value = cloneDefaultQuickActions();
    if (hydrated.value) {
      schedulePersist();
    }
  }

  watch(
    () => hydrated.value,
    value => {
      if (value && !stateRefs.hasCompletedOnboarding.value) {
        onboardingVisible.value = true;
      }
    },
    { immediate: true }
  );

  function openOnboarding() {
    onboardingVisible.value = true;
  }

  function remindOnboardingLater() {
    onboardingVisible.value = false;
  }

  function completeOnboarding() {
    stateRefs.hasCompletedOnboarding.value = true;
    onboardingVisible.value = false;
    if (hydrated.value) {
      schedulePersist();
    }
  }

  function skipOnboarding() {
    completeOnboarding();
  }

  function setOfflineLocal(value: boolean) {
    stateRefs.offlineMode.value = value;
  }

  async function toggleAutoLaunch(value: boolean) {
    try {
      if (!isTauriRuntime()) {
        stateRefs.autoLaunch.value = value;
        schedulePersist();
        return;
      }
      if (value) {
        await enableAutoLaunch();
      } else {
        await disableAutoLaunch();
      }
      stateRefs.autoLaunch.value = value;
      schedulePersist();
    } catch (error) {
      recordError("切换开机自启失败", error, true);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  function setThemePreset(preset: ThemePreset) {
    if (!THEME_PRESETS.includes(preset)) {
      return;
    }
    const previousPreset = stateRefs.themePreset.value;
    stateRefs.themePreset.value = preset;
    if (preset !== "custom") {
      const previousAccent =
        previousPreset && previousPreset !== "custom"
          ? THEME_PRESET_ACCENTS[previousPreset]
          : stateRefs.accentColor.value;
      const nextAccent = THEME_PRESET_ACCENTS[preset];
      if (stateRefs.accentColor.value === previousAccent) {
        stateRefs.accentColor.value = nextAccent;
      }
    }
    applyThemeClass();
    if (hydrated.value) {
      schedulePersist();
    }
  }

  function updateCustomTheme(patch: Partial<CustomThemePalette>) {
    stateRefs.customTheme.value = {
      ...customThemePalette.value,
      ...patch,
    };
    applyCustomThemeVariables();
    if (hydrated.value) {
      schedulePersist();
    }
  }

  const activeProvider = computed(() => {
    return stateRefs.aiProviders.value.find(
      (p) => p.id === stateRefs.activeProviderId.value
    );
  });

  function addAIProvider(preset?: 'openai' | 'gemini' | 'claude' | 'custom') {
    const id = `provider-${Date.now()}`;
    let config: AIProviderConfig;

    if (preset && preset !== 'custom') {
      const presetConfig = AI_PROVIDER_PRESETS[preset];
      config = {
        id,
        name: presetConfig.name,
        apiKey: '',
        baseUrl: presetConfig.baseUrl,
        model: presetConfig.model,
        temperature: presetConfig.temperature,
        enabled: true,
        preset,
      };
    } else {
      config = {
        id,
        name: '自定义服务商',
        apiKey: '',
        baseUrl: '',
        model: '',
        temperature: 0.3,
        enabled: true,
        preset: 'custom',
      };
    }

    stateRefs.aiProviders.value.push(config);
    if (hydrated.value) {
      schedulePersist();
    }
    return config;
  }

  function updateAIProvider(id: string, patch: Partial<AIProviderConfig>) {
    const index = stateRefs.aiProviders.value.findIndex((p) => p.id === id);
    if (index === -1) return;
    stateRefs.aiProviders.value[index] = {
      ...stateRefs.aiProviders.value[index],
      ...patch,
    };
    if (hydrated.value) {
      schedulePersist();
    }
  }

  function removeAIProvider(id: string) {
    const index = stateRefs.aiProviders.value.findIndex((p) => p.id === id);
    if (index === -1) return;
    stateRefs.aiProviders.value.splice(index, 1);

    // If removed provider was active, switch to first enabled provider
    if (stateRefs.activeProviderId.value === id) {
      const firstEnabled = stateRefs.aiProviders.value.find((p) => p.enabled);
      if (firstEnabled) {
        stateRefs.activeProviderId.value = firstEnabled.id;
      }
    }

    if (hydrated.value) {
      schedulePersist();
    }
  }

  function setActiveProvider(id: string) {
    const provider = stateRefs.aiProviders.value.find((p) => p.id === id);
    if (!provider || !provider.enabled) return;
    stateRefs.activeProviderId.value = id;

    // Update legacy settings for backward compatibility
    stateRefs.apiBaseUrl.value = provider.baseUrl;
    stateRefs.apiKey.value = provider.apiKey;
    stateRefs.model.value = provider.model;
    stateRefs.temperature.value = provider.temperature;

    if (hydrated.value) {
      schedulePersist();
    }
  }

  return {
    ...stateRefs,
    themeMode: stateRefs.themeMode,
    themeClass,
    themePresetClass,
    activeAccent,
    customThemePalette,
    naiveThemeOverrides,
    isDarkPreferred,
    initialized,
    hydrated,
    lastError,
    onboardingVisible,
    bootstrap,
    schedulePersist,
    setOfflineLocal,
    toggleAutoLaunch,
    pushRuntimePreferences,
    setQuickActions,
    upsertQuickAction,
    removeQuickAction,
    resetQuickActions,
    setThemePreset,
    updateCustomTheme,
    openOnboarding,
    remindOnboardingLater,
    completeOnboarding,
    skipOnboarding,
    activeProvider,
    addAIProvider,
    updateAIProvider,
    removeAIProvider,
    setActiveProvider,
  };
});
