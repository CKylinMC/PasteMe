<script setup lang="ts">
import { computed, onMounted, onErrorCaptured, ref, watch } from "vue";
import AppSidebar from "@/components/layout/AppSidebar.vue";
import { useSettingsStore } from "@/store/settings";
import { useHistoryStore } from "@/store/history";
import { useMessage } from "naive-ui";
import AppInfo from "@/AppInfo";
import { invoke } from "@tauri-apps/api/core";

const settings = useSettingsStore();
const history = useHistoryStore();
const message = useMessage();
const pageError = ref<string | null>(null);
const isInitializing = ref(false);

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
const ignoredSourcesText = computed({
  get: () => settings.ignoredSources.join("\n"),
  set: value => {
    settings.ignoredSources = value
      .split(/\r?\n/)
      .map(entry => entry.trim())
      .filter(entry => entry.length > 0);
  },
});
const logOptions = [
  { label: "信息 (info)", value: "info" },
  { label: "调试 (debug)", value: "debug" },
] as const;
const runtimeSummary = ref<{ appVersion: string; tauriVersion: string; rustcChannel: string } | null>(null);

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

function resetAiSettings() {
  settings.apiKey = "";
  settings.apiBaseUrl = "https://api.openai.com";
  settings.model = "gpt-4o-mini";
  settings.temperature = 0.3;
  message.success("AI 配置已重置");
}

async function runVacuum() {
  try {
    await invoke("vacuum_database");
    message.success("数据库已整理");
  } catch (error) {
    reportError("整理数据库失败", error);
  }
}

onMounted(async () => {
  isInitializing.value = true;
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
    
    // 获取运行时信息
    try {
      runtimeSummary.value = await invoke("get_runtime_summary");
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

// 捕获子组件错误
onErrorCaptured((err, _instance, info) => {
  console.error("[Settings] Error captured:", err, info);
  pageError.value = err.message || "组件渲染错误";
  return false; // 阻止错误继续传播
});
</script>

<template>
  <div class="settings-page">
    <AppSidebar />
    <section class="main">
      <!-- 错误提示 -->
      <n-alert v-if="pageError" type="error" title="页面错误" closable @close="pageError = null">
        {{ pageError }}
      </n-alert>

      <div v-if="booting || isInitializing" class="settings-skeleton">
        <n-skeleton height="36px" :sharp="false" />
        <div class="settings-skeleton-grid">
          <n-skeleton v-for="i in 3" :key="i" height="220px" :sharp="false" />
        </div>
        <n-skeleton height="100px" :sharp="false" />
      </div>
      <template v-else>
        <header class="page-header">
          <div>
            <h1>设置</h1>
            <p>自定义主题、快捷键与 AI 服务连接</p>
          </div>
        </header>

        <n-alert v-if="settings.lastError" type="warning" show-icon class="settings-alert">
          {{ settings.lastError }}
        </n-alert>

        <div class="settings-grid">
          <n-card title="主题与显示" size="small" embedded>
            <n-radio-group v-model:value="settings.themeMode" name="theme">
              <div class="radio-grid">
                <n-radio value="light">浅色</n-radio>
                <n-radio value="dark">深色</n-radio>
                <n-radio value="system">跟随系统</n-radio>
              </div>
            </n-radio-group>
            <div class="field-row">
              <label>内容行高</label>
              <n-slider
                v-model:value="settings.lineHeight"
                :step="0.1"
                :min="1.2"
                :max="2"
                style="width: 200px;"
              />
              <span>{{ settings.lineHeight.toFixed(1) }}</span>
            </div>
            <div class="field-row">
              <label>强调颜色</label>
              <n-color-picker v-model:value="settings.accentColor" size="small" />
            </div>
            <div class="field-row">
              <label>全局快捷键</label>
              <n-input v-model:value="settings.globalShortcut" placeholder="例如 CmdOrControl+Shift+V" />
            </div>
          </n-card>

          <n-card title="AI 服务" size="small" embedded>
            <n-form label-placement="top" :model="settings">
              <n-form-item label="Base URL">
                <n-input v-model:value="settings.apiBaseUrl" placeholder="https://api.openai.com" />
              </n-form-item>
              <n-form-item label="API Key">
                <n-input v-model:value="settings.apiKey" type="password" show-password-on="click" placeholder="sk-" />
              </n-form-item>
              <div class="field-row">
                <n-form-item label="模型">
                  <n-input v-model:value="settings.model" placeholder="gpt-4o-mini" />
                </n-form-item>
                <n-form-item label="温度">
                  <n-slider
                    v-model:value="settings.temperature"
                    :step="0.1"
                    :min="0"
                    :max="1"
                    style="width: 200px;"
                  />
                </n-form-item>
              </div>
            </n-form>
            <n-button quaternary size="tiny" @click="resetAiSettings">恢复默认</n-button>
          </n-card>

          <n-card title="历史记录" size="small" embedded>
            <div class="field-row">
              <label>开启去重</label>
              <n-switch v-model:value="settings.dedupeEnabled" />
            </div>
            <div class="field-row">
              <label>忽略应用复制</label>
              <n-switch v-model:value="settings.ignoreSelfCopies" />
            </div>
            <div class="field-row">
              <label>容量上限</label>
              <n-input-number v-model:value="historyLimitValue" :min="50" :max="2000" :step="50" />
              <span class="muted">条</span>
            </div>
            <div class="field-row">
              <label>保留天数</label>
              <n-input-number v-model:value="retentionDaysValue" :min="0" :max="365" />
              <span class="muted">0 表示不限制</span>
            </div>
            <n-form-item label="来源黑名单" label-placement="top">
              <n-input
                v-model:value="ignoredSourcesText"
                type="textarea"
                placeholder="每行一个关键字或域名"
                :autosize="{ minRows: 2, maxRows: 5 }"
              />
            </n-form-item>
            <div class="field-row">
              <label>日志级别</label>
              <n-select v-model:value="settings.logLevel" :options="logOptions" size="small" style="width: 180px" />
            </div>
            <div class="history-actions">
              <n-button secondary size="small" @click="settings.pushRuntimePreferences">同步运行偏好</n-button>
              <n-button tertiary size="small" @click="runVacuum">VACUUM</n-button>
            </div>
          </n-card>

          <n-card title="系统" size="small" embedded>
            <div class="field-row">
              <label>开机自启</label>
              <n-switch :value="settings.autoLaunch" @update:value="handleAutoLaunchChange" />
            </div>
            <div class="field-row">
              <label>离线模式</label>
              <n-switch v-model:value="settings.offlineMode" />
            </div>
            <n-divider />
            <div class="field-row">
              <div>
                <strong>缓存历史</strong>
                <p class="muted">当前共有 {{ history.items.length }} 条历史记录</p>
              </div>
              <n-button tertiary type="error" size="small" @click="clearHistory">清理</n-button>
            </div>
          </n-card>
        </div>

        <footer class="about">
          <h3>关于 VibeClip Pro</h3>
          <ul>
            <li>应用版本：{{ AppInfo.version }}</li>
            <li v-if="runtimeSummary">Tauri {{ runtimeSummary.tauriVersion }} · Rust {{ runtimeSummary.rustcChannel }}</li>
            <li>默认全局快捷键：{{ settings.globalShortcut }}</li>
            <li>
              <a href="https://github.com/TIANQIAN1238/VibeClip/issues" target="_blank">问题反馈 &amp; 建议</a>
            </li>
          </ul>
        </footer>
      </template>
    </section>
  </div>
</template>

<style scoped>
.settings-page {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  height: 100%;
  width: 100%;
}

.main {
  width: min(960px, 100%);
  padding: 24px clamp(16px, 3vw, 40px);
  display: flex;
  flex-direction: column;
  gap: 24px;
  overflow-y: auto;
  margin: 0 auto;
}

.page-header h1 {
  margin: 0;
  font-size: 26px;
}

.page-header p {
  margin: 6px 0 0;
  color: var(--vibe-text-muted);
}

.settings-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
  align-content: start;
}

@media (min-width: 1080px) {
  .settings-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.radio-grid {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.field-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  color: var(--vibe-text-primary);
}

.field-row label {
  min-width: 80px;
  font-weight: 600;
}

.muted {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--vibe-text-muted);
}

.history-actions {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}

.history-actions :deep(.n-button) {
  flex: 1;
}

.about {
  padding: 18px clamp(16px, 3vw, 28px);
  background: rgba(255, 255, 255, 0.45);
  border-radius: var(--vibe-radius-lg);
  border: 1px solid var(--vibe-border-soft);
}

.about h3 {
  margin: 0 0 8px;
}

.about ul {
  display: grid;
  gap: 6px;
  margin: 0;
  padding-left: 18px;
  color: var(--vibe-text-muted);
}

.about a {
  color: var(--vibe-primary-color);
  text-decoration: none;
}

.about a:hover {
  text-decoration: underline;
}

.settings-skeleton {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding-top: 12px;
}

.settings-skeleton-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 18px;
}

.settings-alert {
  margin-bottom: 16px;
}

@media (max-width: 840px) {
  .settings-page {
    grid-template-columns: 1fr;
  }

  .main {
    width: 100%;
    padding: 20px clamp(14px, 6vw, 28px);
  }
}
</style>
