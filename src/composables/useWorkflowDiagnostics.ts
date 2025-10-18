import { computed, ref, type Ref } from 'vue';
import type { Config } from './useConfig';
import type { UpdateState } from './useUpdater';

interface ClipboardStatsSnapshot {
  totalChars: number;
  nonEmptyChars: number;
  totalLines: number;
  nonEmptyLines: number;
}

export interface WorkflowPhaseReport {
  key: 'clipboard' | 'ai' | 'shortcut' | 'autostart' | 'snippets' | 'update';
  label: string;
  status: 'success' | 'warning' | 'error';
  duration?: number;
  hint?: string;
}

export interface WorkflowDiagnosticsReport {
  timestamp: Date;
  totalDuration: number;
  clipboardDuration: number;
  aiLatency?: number | null;
  score: number;
  phases: WorkflowPhaseReport[];
}

type UpdaterSnapshot = Pick<UpdateState, 'haveUpdate'>;

interface UseWorkflowDiagnosticsOptions {
  config: Ref<Config>;
  autoStart: Ref<boolean>;
  updateState: Ref<UpdaterSnapshot>;
  clipboardStats: Ref<ClipboardStatsSnapshot>;
  refreshClipboard: () => Promise<void>;
}

interface ReadinessFactor {
  key: WorkflowPhaseReport['key'];
  label: string;
  ready: boolean;
  weight: number;
  hint?: string;
}

function estimateAiLatency(config: Config) {
  let base = config.ai.corsCompatiable ? 420 : 320;
  if (config.ai.enableWebsearch) base += 110;
  if (config.ai.enableWebCrawl) base += 90;
  if (config.ai.disableTools) base -= 40;
  if (!config.ai.enableAISnipets) base += 25;
  return Math.max(180, Math.round(base));
}

export function useWorkflowDiagnostics(options: UseWorkflowDiagnosticsOptions) {
  const running = ref(false);
  const report = ref<WorkflowDiagnosticsReport | null>(null);

  const readinessFactors = computed<ReadinessFactor[]>(() => {
    const config = options.config.value;
    return [
      {
        key: 'shortcut',
        label: '全局快捷键',
        ready: Boolean(config.globalShortcut && config.globalShortcut.trim().length > 0),
        weight: 0.22,
        hint: '前往“全局设置”配置一个便于触达的全局快捷键，例如 Ctrl + Shift + V。',
      },
      {
        key: 'clipboard',
        label: '剪贴板捕获',
        ready: config.common.enablePaste || options.clipboardStats.value.nonEmptyChars > 0,
        weight: 0.2,
        hint: '确认已开启剪贴板监听，或手动刷新验证是否能读取最新内容。',
      },
      {
        key: 'ai',
        label: 'AI 接入',
        ready:
          config.ai.enabled &&
          Boolean(config.ai.apiKey?.trim().length) &&
          Boolean(config.ai.endpoint?.trim().length),
        weight: 0.28,
        hint: '在设置 > AI 服务中填入兼容端点与 API Key，并勾选“启用 AI”。',
      },
      {
        key: 'snippets',
        label: '快捷片段',
        ready: config.ai.enableAISnipets && (config.snippets?.length ?? 0) > 0,
        weight: 0.14,
        hint: '创建至少一个常用 AI 片段，方便一键调用翻译、摘要等动作。',
      },
      {
        key: 'autostart',
        label: '开机自启动',
        ready: options.autoStart.value,
        weight: 0.08,
        hint: '启用自动启动，确保开机即可捕获剪贴板与调用 AI。',
      },
      {
        key: 'update',
        label: '版本状态',
        ready: !options.updateState.value.haveUpdate,
        weight: 0.08,
        hint: '发现新版本，建议在发布前完成更新或同步发布说明。',
      },
    ];
  });

  const readinessScore = computed(() => {
    const factors = readinessFactors.value;
    const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
    if (!totalWeight) return 0;
    const acquired = factors.reduce(
      (sum, factor) => sum + (factor.ready ? factor.weight : 0),
      0,
    );
    return Math.round((acquired / totalWeight) * 100);
  });

  const readinessTone = computed(() => {
    const score = readinessScore.value;
    if (score >= 85) return 'success';
    if (score >= 60) return 'warning';
    return 'error';
  });

  const readinessLabel = computed(() => {
    const score = readinessScore.value;
    if (score >= 90) return '工作流表现优秀';
    if (score >= 75) return '核心链路已就绪';
    if (score >= 60) return '部分环节待优化';
    return '需要重点关注';
  });

  const pendingFactors = computed(() =>
    readinessFactors.value.filter(factor => !factor.ready),
  );

  const readinessSummary = computed(() => {
    if (!pendingFactors.value.length) {
      return '所有核心链路已准备完毕，可直接进入发布环节。';
    }
    const labels = pendingFactors.value.map(item => item.label).join('、');
    return `建议优先处理：${labels}`;
  });

  const suggestions = computed(() =>
    pendingFactors.value.map(item => item.hint).filter(Boolean) as string[],
  );

  async function runDiagnostic() {
    if (running.value) return;
    running.value = true;
    const phases: WorkflowPhaseReport[] = [];
    const start = performance.now();
    let clipboardDuration = 0;

    try {
      const clipboardStart = performance.now();
      await options.refreshClipboard();
      clipboardDuration = performance.now() - clipboardStart;
      phases.push({
        key: 'clipboard',
        label: '剪贴板刷新',
        status: clipboardDuration <= 150 ? 'success' : 'warning',
        duration: clipboardDuration,
        hint:
          clipboardDuration > 220
            ? '刷新耗时较长，检查是否有第三方同步工具占用剪贴板。'
            : undefined,
      });
    } catch (error) {
      phases.push({
        key: 'clipboard',
        label: '剪贴板刷新',
        status: 'error',
        hint: '读取剪贴板时出现异常，可尝试重新授权剪贴板权限。',
      });
    }

    const config = options.config.value;
    const aiReady = readinessFactors.value.find(factor => factor.key === 'ai')?.ready ?? false;
    if (aiReady) {
      const latency = estimateAiLatency(config);
      phases.push({
        key: 'ai',
        label: 'AI 配置',
        status: latency <= 520 ? 'success' : 'warning',
        duration: latency,
        hint:
          latency > 520
            ? '当前配置可能启用了较多工具，建议优化模型或关闭不必要的外部服务。'
            : undefined,
      });
    } else {
      phases.push({
        key: 'ai',
        label: 'AI 配置',
        status: 'warning',
        hint: 'AI 尚未启用或缺少凭据，发布前请补全配置。',
      });
    }

    const shortcutReady = readinessFactors.value.find(factor => factor.key === 'shortcut')?.ready ?? false;
    phases.push({
      key: 'shortcut',
      label: '全局快捷键',
      status: shortcutReady ? 'success' : 'warning',
      hint: shortcutReady ? undefined : '设置快捷键后可确保唤起窗口顺畅。',
    });

    phases.push({
      key: 'snippets',
      label: '快捷片段',
      status:
        readinessFactors.value.find(factor => factor.key === 'snippets')?.ready ?? false
          ? 'success'
          : 'warning',
      hint: readinessFactors.value.find(factor => factor.key === 'snippets')?.ready
        ? undefined
        : '准备常用片段能显著提升复制后的处理效率。',
    });

    phases.push({
      key: 'autostart',
      label: '开机自启动',
      status: options.autoStart.value ? 'success' : 'warning',
      hint: options.autoStart.value ? undefined : '启用后开机即可捕获剪贴板，无需手动启动。',
    });

    phases.push({
      key: 'update',
      label: '版本状态',
      status: options.updateState.value.haveUpdate ? 'warning' : 'success',
      hint: options.updateState.value.haveUpdate
        ? '检测到新版本，可在发布说明中同步或预先更新。'
        : undefined,
    });

    report.value = {
      timestamp: new Date(),
      totalDuration: performance.now() - start,
      clipboardDuration,
      aiLatency: aiReady ? estimateAiLatency(config) : null,
      score: readinessScore.value,
      phases,
    };

    running.value = false;
  }

  const lastRunAt = computed(() => report.value?.timestamp ?? null);
  const lastRuntime = computed(() => report.value?.totalDuration ?? null);

  return {
    running,
    report,
    readinessScore,
    readinessTone,
    readinessLabel,
    readinessSummary,
    suggestions,
    readinessFactors,
    lastRunAt,
    lastRuntime,
    runDiagnostic,
  };
}
