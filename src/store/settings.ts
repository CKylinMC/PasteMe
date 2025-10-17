import { defineStore } from "pinia";
import { computed, reactive, ref, toRefs, watch } from "vue";
import type { GlobalThemeOverrides } from "naive-ui";
import { invoke } from "@tauri-apps/api/core";
import { disable as disableAutoLaunch, enable as enableAutoLaunch, isEnabled as isAutoLaunchEnabled } from "@tauri-apps/plugin-autostart";
import { notifyError } from "@/utils/notifier";

const STORAGE_KEY = "vibeclip.settings";

interface PersistedSettings {
  themeMode: "light" | "dark" | "system";
  accentColor: string;
  lineHeight: number;
  globalShortcut: string;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  offlineMode: boolean;
  autoLaunch: boolean;
  preferredLanguage: string;
  historyLimit: number;
  historyRetentionDays: number | null;
  dedupeEnabled: boolean;
  ignoreSelfCopies: boolean;
  ignoredSources: string[];
  logLevel: "info" | "debug";
}

const DEFAULT_SETTINGS: PersistedSettings = {
  themeMode: "light",
  accentColor: "#5161ff",
  lineHeight: 1.5,
  globalShortcut: "CmdOrControl+Shift+V",
  apiBaseUrl: "https://api.openai.com",
  apiKey: "",
  model: "gpt-4o-mini",
  temperature: 0.3,
  offlineMode: false,
  autoLaunch: false,
  preferredLanguage: "zh-CN",
  historyLimit: 500,
  historyRetentionDays: null,
  dedupeEnabled: true,
  ignoreSelfCopies: true,
  ignoredSources: [],
  logLevel: "info",
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
  let persistTimer: number | null = null;
  const stateRefs = toRefs(state);
  const LOAD_TIMEOUT = 3000;

  function recordError(message: string, error: unknown, shouldNotify = false) {
    const reason = error instanceof Error ? error : new Error(String(error ?? message));
    console.error(message, reason);
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

  const naiveThemeOverrides = computed<GlobalThemeOverrides>(() => {
    const accent = stateRefs.accentColor.value || DEFAULT_SETTINGS.accentColor;
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
    document.documentElement.classList.toggle(
      "dark",
      themeClass.value === "dark"
    );
  }

  function schedulePersist() {
    if (!hydrated.value) return;
    if (persistTimer) {
      window.clearTimeout(persistTimer);
    }
    persistTimer = window.setTimeout(async () => {
      persistTimer = null;
      try {
        await invoke("set_value_to_store", {
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
      const payload = await invoke<PersistedSettings>(
        "get_value_from_store",
        {
          key: STORAGE_KEY,
          fallback: { ...DEFAULT_SETTINGS },
        }
      );
      Object.assign(state, { ...DEFAULT_SETTINGS, ...payload });
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
    () => [stateRefs.themeMode.value, stateRefs.accentColor.value],
    () => {
      applyThemeClass();
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
    () => stateRefs.ignoredSources.value,
    () => {
      if (hydrated.value) {
        schedulePersist();
      }
    },
    { deep: true }
  );

  async function pushRuntimePreferences() {
    if (!hydrated.value) return;
    const ignored = stateRefs.ignoredSources.value
      .map(value => value.trim())
      .filter(value => value.length > 0);
    const retentionDays = stateRefs.historyRetentionDays.value;
    try {
      await invoke("update_runtime_preferences", {
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
      try {
        await invoke("set_offline", { offline: value });
      } catch (error) {
        recordError("更新离线模式失败", error, true);
      }
    }
  );

  watch(
    () => stateRefs.globalShortcut.value,
    async shortcut => {
      if (!hydrated.value) return;
      try {
        await invoke("register_history_shortcut", { shortcut });
      } catch (error) {
        recordError("注册全局快捷键失败", error, true);
      }
    }
  );

  async function syncRuntimeFlags() {
    try {
      const status = await invoke<{ offline: boolean; listening: boolean }>(
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

  function setOfflineLocal(value: boolean) {
    stateRefs.offlineMode.value = value;
  }

  async function toggleAutoLaunch(value: boolean) {
    try {
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

  return {
    ...stateRefs,
    themeMode: stateRefs.themeMode,
    themeClass,
    naiveThemeOverrides,
    isDarkPreferred,
    initialized,
    hydrated,
    lastError,
    bootstrap,
    schedulePersist,
    setOfflineLocal,
    toggleAutoLaunch,
    pushRuntimePreferences,
  };
});
