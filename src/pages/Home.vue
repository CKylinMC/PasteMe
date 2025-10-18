<script setup lang="ts">
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { openUrl } from '@tauri-apps/plugin-opener';
import { exit } from '@tauri-apps/plugin-process';
import {
    onBeforeUnmount,
    onMounted,
    ref,
    unref,
    watch,
    computed,
    toRaw,
} from 'vue';
import KeySelector from '@/components/KeySelector.vue';
import { type Snippet, useConfig } from '@/composables/useConfig';
import { useAutoStart } from '@/composables/useAutoStart';
import { useClipboard } from '@/composables/useClipboard';
import { useWorkflowDiagnostics, type WorkflowPhaseReport } from '@/composables/useWorkflowDiagnostics';
import QlementineIconsWindowsMinimize16 from '~icons/qlementine-icons/windows-minimize-16';
import QlementineIconsWindowsClose16 from '~icons/qlementine-icons/windows-close-16';
import SolarRefreshLineDuotone from '~icons/solar/refresh-line-duotone';
import SolarCheckCircleLineDuotone from '~icons/solar/check-circle-line-duotone';
import SolarDownloadMinimalisticBoldDuotone from '~icons/solar/download-minimalistic-bold-duotone';
import SolarRestartCircleLineDuotone from '~icons/solar/restart-circle-line-duotone';
import SolarSadCircleLineDuotone from '~icons/solar/sad-circle-line-duotone';
import { AppInfo } from '@/AppInfo';
import ClipAIIcon from '@/assets/clipai_color.png';
import { useUpdater } from '@/composables/useUpdater';
import { asString, convertDatetime, debounce } from '@/libs/utils';
import { marked } from 'marked';
import HijackedATag from '@/components/HijackedATag.vue';
import MdiPlus from '~icons/mdi/plus';
import MdiPencil from '~icons/mdi/pencil';
import MdiDelete from '~icons/mdi/delete';
import MdiCheck from '~icons/mdi/check';
import MdiFileDocumentEditOutline from '~icons/mdi/file-document-edit-outline';
import MdiKeyboardBackspace from '~icons/mdi/keyboard-backspace';
import Toast from '@/components/Toast.vue';

const { config, loadConfig, saveConfig } = useConfig();
const { autoStart, toggleAutoStart, refreshAutoStart } = useAutoStart();
const { stats: clipboardStats, refresh: refreshClipboard } = useClipboard();
const { updateState, checkUpdate } = useUpdater();
const mainview = getCurrentWebviewWindow();

const closeConfirm = ref(false);
const toast = ref();

const snippetPage = ref<'list' | 'edit'>('list');
const currentSnippet = ref<Snippet & { isNew: boolean }>({
    id: '',
    name: '',
    prompt: '',
    system: '',
    markdown: true,
    isNew: true,
    advanced: false,
});

const debouncedSaveConfig = debounce(saveConfig, 500);

watch(
    () => config.value,
    () => {
        debouncedSaveConfig();
    },
    { deep: true }
);

const snippetTotal = computed(() => config.value.snippets?.length ?? 0);

const toggleSummary = computed(() => {
    const toggles = [
        { label: '直接粘贴', value: config.value.common?.enablePaste ?? false },
        { label: '统计', value: config.value.common?.enableCalc ?? false },
        { label: '编辑', value: config.value.common?.enableEdit ?? false },
        { label: '转纯文本', value: config.value.common?.enableToText ?? false },
        { label: '识别', value: config.value.detect?.enabled ?? false },
        { label: '识别链接', value: config.value.detect?.detectUrl ?? false },
    ];
    return {
        enabled: toggles.filter(item => item.value).length,
        total: toggles.length,
        enabledLabels: toggles.filter(item => item.value).map(item => item.label),
    };
});

const featureProgress = computed(() => {
    const total = toggleSummary.value.total;
    return total === 0
        ? 0
        : Math.round((toggleSummary.value.enabled / total) * 100);
});

const aiStatusTag = computed(() =>
    config.value.ai?.enabled ? 'success' : 'warning'
);

const aiStatusLabel = computed(() =>
    config.value.ai?.enabled ? 'AI 功能已启用' : 'AI 功能未启用'
);

const aiProviderLabel = computed(() => {
    const endpoint = config.value.ai?.endpoint?.trim();
    if (!endpoint) return '默认 OpenAI 兼容端点';
    try {
        const url = new URL(endpoint);
        return url.hostname;
    } catch (error) {
        console.debug('无法解析 AI 端点', error);
        return endpoint;
    }
});

const aiModelLabel = computed(
    () => config.value.ai?.model?.trim() || '未设置模型'
);

const snippetMeta = computed(() => {
    if (!config.value.ai?.enableAISnipets) {
        return '前往“AI 设置”启用快速片段';
    }
    if (snippetTotal.value === 0) {
        return '点击右上角即可创建第一个片段';
    }
    return '常用提示词已准备就绪';
});

const toggleMeta = computed(() => {
    const labels = toggleSummary.value.enabledLabels;
    return labels.length > 0
        ? `已启用：${labels.join('、')}`
        : '还未启用增强功能';
});

const autoStartTagType = computed(() => (autoStart.value ? 'success' : 'warning'));

const autoStartLabel = computed(() =>
    autoStart.value ? '自动启动已打开' : '自动启动未开启'
);

const overviewCards = computed(() => {
    const update = updateState.value;
    const updateMeta = update.haveUpdate
        ? update.latestVersion
            ? `发现版本 ${update.latestVersion}`
            : '发现新版本'
        : '暂无可用更新';
    return [
        {
            title: 'AI 服务',
            value: config.value.ai?.enabled ? aiModelLabel.value : '未启用',
            meta: aiProviderLabel.value,
            tone: config.value.ai?.enabled ? 'positive' : 'warning',
        },
        {
            title: '快速片段',
            value: snippetTotal.value.toString(),
            meta: snippetMeta.value,
        },
        {
            title: '功能开关',
            value: `${toggleSummary.value.enabled}/${toggleSummary.value.total}`,
            meta: toggleMeta.value,
            progress: featureProgress.value,
        },
        {
            title: '版本状态',
            value: update.haveUpdate ? '可更新' : '最新',
            meta: updateMeta,
            tone: update.haveUpdate ? 'warning' : 'success',
        },
    ];
});

const {
    running: diagnosticsRunning,
    report: diagnosticsReport,
    readinessScore,
    readinessTone,
    readinessLabel,
    readinessSummary,
    suggestions: diagnosticSuggestions,
    readinessFactors,
    lastRunAt,
    lastRuntime,
    runDiagnostic,
} = useWorkflowDiagnostics({
    config,
    autoStart,
    updateState,
    clipboardStats,
    refreshClipboard,
});

function formatRelativeTime(date: Date | null) {
    if (!date) return '尚未巡检';
    const diffMs = Date.now() - date.getTime();
    if (diffMs < 60_000) return '刚刚';
    const diffMinutes = Math.round(diffMs / 60_000);
    if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} 小时前`;
    const diffDays = Math.round(diffHours / 24);
    return `${diffDays} 天前`;
}

function formatDurationLabel(duration: number | null | undefined) {
    if (!duration || Number.isNaN(duration)) return '—';
    if (duration < 1000) return `${Math.max(1, Math.round(duration))} ms`;
    return `${(duration / 1000).toFixed(1)} s`;
}

function formatPhaseDuration(duration: number | undefined) {
    if (typeof duration !== 'number') return '';
    return duration < 1000
        ? `${Math.max(1, Math.round(duration))} ms`
        : `${(duration / 1000).toFixed(1)} s`;
}

const diagnosticsPhases = computed<WorkflowPhaseReport[]>(() => {
    if (diagnosticsReport.value) {
        return diagnosticsReport.value.phases;
    }
    return readinessFactors.value.map<WorkflowPhaseReport>(factor => ({
        key: factor.key,
        label: factor.label,
        status: factor.ready ? 'success' : 'warning',
        hint: factor.hint,
        duration: undefined,
    }));
});

const lastRunLabel = computed(() => formatRelativeTime(lastRunAt.value));
const lastRuntimeLabel = computed(() => formatDurationLabel(lastRuntime.value));

const tabPaneStyle = computed(() => ({
    padding: '0',
    height: '100%',
}));

const cleanupFns: Array<() => Promise<void> | void> = [];

onMounted(async () => {
    const mainWindow = getCurrentWebviewWindow();
    cleanupFns.push(
        await mainWindow.listen('tauri://resize', async () => {
            if (await mainWindow.isMinimized()) {
                await mainWindow.hide();
            }
        })
    );

    await loadConfig();
    await refreshAutoStart();
    await refreshClipboard();
    void runDiagnostic();
});

onBeforeUnmount(async () => {
    await saveConfig();
    await Promise.all(cleanupFns.map(fn => fn()));
});

function handleShortcutChange(shortcut: string) {
    config.value.globalShortcut = shortcut;
}

function closeApp() {
    exit(0);
}

function minimizeApp() {
    mainview.hide();
}

const UpdateIcons = {
    check: SolarRefreshLineDuotone,
    latest: SolarCheckCircleLineDuotone,
    download: SolarDownloadMinimalisticBoldDuotone,
    install: SolarRestartCircleLineDuotone,
    failed: SolarSadCircleLineDuotone,
};

const currentIcon = computed(() => {
    if (updateState.value.type === 'error') return UpdateIcons.failed;
    if (updateState.value.type === 'success') return UpdateIcons.latest;
    switch (updateState.value.stage) {
        case 'check':
            return UpdateIcons.check;
        case 'download':
            return UpdateIcons.download;
        case 'install':
            return UpdateIcons.install;
        default:
            return UpdateIcons.check;
    }
});

function openProjectPage() {
    return openUrl('https://github.com/CKylinMC/PasteMe');
}

function openFeedbackPage() {
    return openUrl('https://github.com/CKylinMC/PasteMe/issues/new/choose');
}
function openCloseConfirm() {
    closeConfirm.value = true;
}

const updateSuffix =
    '\n\n------\n\n若下载失败请前往<a href="https://github.com/ckylinmc/pasteme/releases">发布页面</a>手动下载更新';

function createSnippet() {
    currentSnippet.value = {
        id: `n-${Math.random()}`,
        name: `AI片段 #${Math.round(Math.random() * 100)}`,
        prompt: '剪贴板内容:\n{{clipboard}}\n\n用户指令:\n请把内容...',
        system: '你的任务是分析用户的剪贴板数据。使用用户的指令和剪贴板内容回答问题。如果没有明确要求，不需要重复收到的剪贴板内容，直接进行回答。',
        markdown: true,
        advanced: true,
        isNew: true,
    };
    snippetPage.value = 'edit';
}

function editSnippet(snippet: Snippet) {
    currentSnippet.value = {
        ...snippet,
        isNew: false,
        markdown: snippet.markdown ?? true,
        advanced: snippet.advanced ?? false,
    };
    snippetPage.value = 'edit';
}

function saveSnippet() {
    if (
        currentSnippet.value.system === '' ||
        currentSnippet.value.prompt === '' ||
        currentSnippet.value.name === ''
    ) {
        toast.value.sendToast('请填写完整信息');
        return;
    }
    if (currentSnippet.value.isNew) {
        const rawclone = JSON.parse(
            JSON.stringify(toRaw(unref(currentSnippet.value)))
        );
        rawclone.isNew = undefined;
        config.value.snippets.push(rawclone);
        toast.value.sendToast('创建片段成功');
    } else {
        const index = config.value.snippets.findIndex(
            s => s.id === currentSnippet.value.id
        );
        if (index >= 0) {
            config.value.snippets[index] = currentSnippet.value;
        }
        toast.value.sendToast('片段修改已保存');
    }
    currentSnippet.value.isNew = false;
}

function deleteSnippet(snippet: Snippet) {
    config.value.snippets = config.value.snippets.filter(
        s => s.id !== snippet.id
    );
    snippetPage.value = 'list';
    toast.value.sendToast('片段已删除');
}

function backToSnippetList() {
    snippetPage.value = 'list';
}

function upgradeSnippet() {
    currentSnippet.value.advanced = true;
    saveSnippet();
}
</script>

<template>
    <div class="home-shell">
        <section class="home-hero" data-tauri-drag-region>
            <div class="home-hero__info">
                <div class="home-hero__title">
                    <img class="home-hero__logo" :src="ClipAIIcon" alt="ClipAI 标志" />
                    <div>
                        <h1>Paste Me!</h1>
                        <p>一站式剪贴板历史管理与 AI 快捷操作助手，让复制粘贴更聪明。</p>
                    </div>
                </div>
                <div class="home-hero__meta">
                    <n-tag round size="small" type="primary">v{{ AppInfo.version }}</n-tag>
                    <n-tag round size="small" :type="aiStatusTag">{{ aiStatusLabel }}</n-tag>
                    <n-tag round size="small" :type="autoStartTagType">{{ autoStartLabel }}</n-tag>
                    <span class="home-hero__meta-text">{{ aiProviderLabel }}</span>
                </div>
            </div>
            <div class="home-hero__actions" data-tauri-drag-region="false">
                <n-button tertiary size="small" @click="openProjectPage">项目主页</n-button>
                <n-button tertiary size="small" @click="openFeedbackPage">反馈</n-button>
                <n-button
                    quaternary
                    circle
                    size="small"
                    @click="minimizeApp"
                    aria-label="最小化"
                >
                    <template #icon>
                        <QlementineIconsWindowsMinimize16 />
                    </template>
                </n-button>
                <n-button
                    quaternary
                    circle
                    size="small"
                    @click="openCloseConfirm"
                    aria-label="退出"
                >
                    <template #icon>
                        <QlementineIconsWindowsClose16 />
                    </template>
                </n-button>
                <n-button
                    strong
                    secondary
                    size="small"
                    :type="updateState.type"
                    :loading="updateState.working"
                    :disabled="updateState.working"
                    @click="checkUpdate"
                >
                    <template #icon>
                        <n-icon>
                            <component :is="currentIcon" />
                        </n-icon>
                    </template>
                    {{ updateState.btn }}
                </n-button>
            </div>
        </section>
        <TransitionGroup name="home-card" tag="section" class="home-stats-grid">
            <article
                v-for="(card, index) in overviewCards"
                :key="card.title"
                class="home-stat-card"
                :class="card.tone ? `home-stat-card--${card.tone}` : ''"
                :style="{ '--card-index': index }"
            >
                <div class="home-stat-card__title">{{ card.title }}</div>
                <div class="home-stat-card__value">{{ card.value }}</div>
                <div class="home-stat-card__meta">{{ card.meta }}</div>
                <n-progress
                    v-if="card.progress !== undefined"
                    class="home-stat-card__progress"
                    type="line"
                    :percentage="card.progress"
                    :show-indicator="false"
                    size="small"
                />
            </article>
        </TransitionGroup>

        <section class="home-diagnostics">
            <div class="home-diagnostics__header">
                <div>
                    <h2>工作流体检</h2>
                    <p>{{ readinessSummary }}</p>
                </div>
                <n-button
                    size="small"
                    type="primary"
                    strong
                    :loading="diagnosticsRunning"
                    @click="runDiagnostic"
                >
                    {{ diagnosticsRunning ? '巡检中...' : '立即巡检' }}
                </n-button>
            </div>
            <div class="home-diagnostics__score" :data-tone="readinessTone">
                <span class="home-diagnostics__score-value">{{ readinessScore }}</span>
                <n-tag round size="small" :type="readinessTone">
                    {{ readinessLabel }}
                </n-tag>
                <span class="home-diagnostics__score-meta">
                    上次巡检：{{ lastRunLabel }} · 耗时 {{ lastRuntimeLabel }}
                </span>
            </div>
            <TransitionGroup name="diagnostic-list" tag="ul" class="home-diagnostics__list">
                <li
                    v-for="phase in diagnosticsPhases"
                    :key="phase.key"
                    class="home-diagnostics__item"
                    :class="`home-diagnostics__item--${phase.status}`"
                >
                    <div class="home-diagnostics__item-top">
                        <span>{{ phase.label }}</span>
                        <span
                            v-if="phase.duration"
                            class="home-diagnostics__item-duration"
                        >
                            ≈ {{ formatPhaseDuration(phase.duration) }}
                        </span>
                    </div>
                    <p v-if="phase.hint" class="home-diagnostics__item-hint">
                        {{ phase.hint }}
                    </p>
                </li>
            </TransitionGroup>
            <ul
                v-if="diagnosticSuggestions.length"
                class="home-diagnostics__suggestions"
            >
                <li v-for="hint in diagnosticSuggestions" :key="hint">{{ hint }}</li>
            </ul>
        </section>
        <div class="home-content">
            <div class="home-tabs-card">
                <n-tabs
                    type="line"
                    animated
                    placement="left"
                    class="home-tabs"
                    :pane-style="tabPaneStyle"
                >
                <n-tab-pane name="welcome" tab="欢迎使用">
                    <n-list
                        class="!bg-transparent !px-2 size-full overflow-y-auto thin-scrollbar animate-fade-up animate-once animate-duration-500 animate-ease-out"
                    >
                        <n-list-item>
                            <n-thing title="这是什么？">
                                <div>
                                    <p>
                                        Paste Me!
                                        聚焦 <strong>剪贴板历史管理</strong> 与 <strong>AI 辅助快捷操作</strong>，让复制粘贴流程既有记忆又有智慧。
                                        无论是查找昨天复制的那段文案，还是一键翻译、润色当前文本，都可以在这里完成。
                                    </p>
                                    <p class="text-red-300 font-bold">
                                        目前，软件必须以右键管理员权限运行，否则可能无法正常工作。
                                    </p>
                                </div>
                            </n-thing>
                        </n-list-item>
                        <n-list-item>
                            <n-thing title="怎么使用？">
                                <div>
                                    <p>
                                        按下快捷键
                                        {{
                                            config.globalShortcut?.replace(
                                                'CommandOrControl',
                                                'Ctrl'
                                            ) || '(前往全局设置添加快捷键)'
                                        }}，将会弹出一个窗口。借助这个窗口，你可以：
                                    </p>
                                    <ul>
                                        <li>查看、搜索并粘贴历史剪贴板记录</li>
                                        <li>通过右键菜单快速复制、收藏、置顶，或直接唤起 AI 动作</li>
                                        <li>
                                            将当前文本重新复制为纯文本（清除颜色、格式和链接）
                                        </li>
                                        <li>使用 AI 快捷指令完成翻译、摘要、润色等操作</li>
                                    </ul>
                                    <br />
                                    <p>在窗口中，你可以：</p>
                                    <ul>
                                        <li>按 <u>方向键上、下</u> 选择选项</li>
                                        <li>
                                            按 <u>回车</u> 选择选项或进入子菜单
                                        </li>
                                        <li>按 <u>ESC</u> 返回上一页或退出</li>
                                    </ul>
                                    <br />
                                    <p>
                                        首次使用之前，你可能需要先配置AI服务信息。
                                    </p>
                                </div>
                            </n-thing>
                        </n-list-item>
                    </n-list>
                </n-tab-pane>
                <n-tab-pane name="global" tab="全局设置">
                    <n-list
                        class="!bg-transparent !px-2 size-full overflow-y-auto thin-scrollbar animate-fade-up animate-once animate-duration-500 animate-ease-out"
                    >
                        <n-list-item>
                            <template #suffix>
                                <n-checkbox
                                    :checked="autoStart"
                                    @update:checked="toggleAutoStart"
                                ></n-checkbox>
                            </template>
                            <n-thing
                                title="开机自动启动"
                                description="启动 Windows 时自动启动 Paste Me!"
                            />
                        </n-list-item>
                        <n-list-item>
                            <template #suffix>
                                <div class="w-60 text-right">
                                    <KeySelector
                                        @set="handleShortcutChange"
                                        :shortcut="config.globalShortcut"
                                    />
                                </div>
                            </template>
                            <n-thing
                                title="全局快捷键"
                                description="按下哪个键触发窗口"
                            />
                        </n-list-item>
                        <n-list-item>
                            <template #suffix>
                                <n-checkbox
                                    v-model:checked="config.common.enablePaste"
                                ></n-checkbox>
                            </template>
                            <n-thing
                                title="启用直接粘贴功能"
                                description="与直接 Ctrl+V 粘贴相同"
                            />
                        </n-list-item>
                        <n-list-item>
                            <template #suffix>
                                <n-checkbox
                                    v-model:checked="config.common.enableCalc"
                                ></n-checkbox>
                            </template>
                            <n-thing
                                title="启用统计功能"
                                description="显示复制的文本字符数量"
                            />
                        </n-list-item>
                        <n-list-item>
                            <template #suffix>
                                <n-checkbox
                                    v-model:checked="config.common.enableEdit"
                                ></n-checkbox>
                            </template>
                            <n-thing
                                title="启用编辑功能"
                                description="允许编辑复制的文本"
                            />
                        </n-list-item>
                        <n-list-item>
                            <template #suffix>
                                <n-checkbox
                                    v-model:checked="config.common.enableToText"
                                ></n-checkbox>
                            </template>
                            <n-thing
                                title="启用转为纯文本功能"
                                description="将复制的内容重新复制为无样式文本"
                            />
                        </n-list-item>
                        <n-list-item>
                            <template #suffix>
                                <n-checkbox
                                    v-model:checked="config.detect.enabled"
                                ></n-checkbox>
                            </template>
                            <n-thing
                                title="启用剪贴板识别"
                                description="尝试从剪贴板中提取信息"
                            />
                        </n-list-item>
                        <n-list-item>
                            <template #suffix>
                                <n-checkbox
                                    v-model:checked="config.detect.detectUrl"
                                ></n-checkbox>
                            </template>
                            <n-thing
                                title="启用剪贴板识别: 链接"
                                description="尝试从剪贴板中提取链接"
                            />
                        </n-list-item>
                    </n-list>
                </n-tab-pane>
                <n-tab-pane name="ai" tab="AI 设置">
                    <n-list
                        class="!bg-transparent !px-2 size-full overflow-y-auto thin-scrollbar animate-fade-up animate-once animate-duration-500 animate-ease-out"
                    >
                        <n-list-item>
                            <template #suffix>
                                <n-checkbox
                                    v-model:checked="config.ai.enabled"
                                ></n-checkbox>
                            </template>
                            <n-thing
                                title="启用 AI 功能"
                                description="启用并显示AI相关功能"
                            />
                        </n-list-item>
                        <n-list-item>
                            <template #suffix>
                                <div class="w-72">
                                    <n-input
                                        v-model:value="config.ai.apiKey"
                                        type="password"
                                        placeholder="API Key"
                                        show-password-on="click"
                                    />
                                </div>
                            </template>
                            <n-thing
                                title="AI 服务密钥"
                                description="OpenAI 服务密钥 (明文记录在配置文件中)"
                            />
                        </n-list-item>
                        <n-list-item>
                            <template #suffix>
                                <div class="w-72">
                                    <n-input
                                        v-model:value="config.ai.endpoint"
                                        placeholder="https://api.freekey.site"
                                    />
                                </div>
                            </template>
                            <n-thing
                                title="OpenAI 服务端点"
                                description="使用的代理 AI 服务端点"
                            />
                        </n-list-item>
                        <n-list-item>
                            <template #suffix>
                                <div class="w-72">
                                    <n-input
                                        v-model:value="config.ai.model"
                                        placeholder="gpt-4o"
                                    />
                                </div>
                            </template>
                            <n-thing
                                title="AI 模型"
                                description="使用的 AI 模型"
                            />
                        </n-list-item>
                        <n-list-item>
                            <template #suffix>
                                <n-checkbox
                                    v-model:checked="config.ai.disableTools"
                                ></n-checkbox>
                            </template>
                            <n-thing
                                title="禁用 Tools Calling"
                                description="若模型不支持 Tools Calling，在此处关闭。注意关闭后联网功能无法使用。"
                            />
                        </n-list-item>
                        <n-list-item>
                            <template #suffix>
                                <n-checkbox
                                    v-model:checked="config.ai.corsCompatiable"
                                ></n-checkbox>
                            </template>
                            <n-thing
                                title="兼容性模式"
                                description="对于NIM等具有CORS限制模型服务，可使用兼容性模式。注意，此模式将会减慢回应速度。"
                            />
                        </n-list-item>
                        <n-list-item>
                            <template #suffix>
                                <n-checkbox
                                    v-model:checked="config.ai.enableToJson"
                                ></n-checkbox>
                            </template>
                            <n-thing
                                title="启用使用 AI 提取为JSON格式"
                                description="启用并允许使用AI将剪贴板转为JSON"
                            />
                        </n-list-item>
                        <n-list-item>
                            <template #suffix>
                                <n-checkbox
                                    v-model:checked="config.ai.enableAskAI"
                                ></n-checkbox>
                            </template>
                            <n-thing
                                title="启用修改或提问"
                                description="基于剪贴板要求 AI 修改或提问"
                            />
                        </n-list-item>
                        <n-list-item>
                            <template #suffix>
                                <n-checkbox
                                    v-model:checked="config.ai.enableAISnipets"
                                ></n-checkbox>
                            </template>
                            <n-thing
                                title="启用快速 AI 片段"
                                description="保存和复用自定义AI提示词片段"
                            />
                        </n-list-item>
                        <n-list-item>
                            <template #suffix>
                                <n-checkbox
                                    v-model:checked="config.ai.enableAIChat"
                                ></n-checkbox>
                            </template>
                            <n-thing
                                title="启用 AI 聊天"
                                description="基于剪贴板的对话模式"
                            />
                        </n-list-item>
                        <n-list-item>
                            <template #suffix>
                                <n-checkbox
                                    v-model:checked="
                                        config.ai.persistChatHistory
                                    "
                                ></n-checkbox>
                            </template>
                            <n-thing
                                title="保留聊天历史"
                                description="Chat模式下保留聊天历史。注意，若保留聊天历史，则仅能在开启新会话时读取剪贴板内容"
                            />
                        </n-list-item>
                        <n-list-item>
                            <n-thing
                                title="附加 AI 服务"
                                description="便于在 AI Chat 模式下使用的 AI 服务"
                            />
                            <div class="h-4"></div>
                            <n-collapse>
                                <n-collapse-item
                                    title="Tavily 网络搜索"
                                    name="websearch"
                                >
                                    <n-list class="!bg-transparent">
                                        <n-list-item>
                                            <template #suffix>
                                                <n-checkbox
                                                    v-model:checked="
                                                        config.ai
                                                            .enableWebsearch
                                                    "
                                                ></n-checkbox>
                                            </template>
                                            <n-thing
                                                title="启用 Tavily 网络搜索集成"
                                                description="为支持 Tool Calling 的 AI 提供网络搜索集成"
                                            />
                                        </n-list-item>
                                        <n-list-item>
                                            <template #suffix>
                                                <div class="w-72">
                                                    <n-input
                                                        v-model:value="
                                                            config.ai
                                                                .tavilyApiKey
                                                        "
                                                        type="password"
                                                        show-password-on="click"
                                                        placeholder="Tavily API Key"
                                                    />
                                                </div>
                                            </template>
                                            <n-thing
                                                title="Tavily 服务密钥"
                                                description="Tavily 服务密钥 (明文记录在配置文件中)"
                                            />
                                        </n-list-item>
                                    </n-list>
                                </n-collapse-item>
                                <n-collapse-item
                                    title="Jina 页面爬虫"
                                    name="webcrawl"
                                >
                                    <n-list class="!bg-transparent">
                                        <n-list-item>
                                            <template #suffix>
                                                <n-checkbox
                                                    v-model:checked="
                                                        config.ai.enableWebCrawl
                                                    "
                                                ></n-checkbox>
                                            </template>
                                            <n-thing
                                                title="启用 Jina 页面抓取集成"
                                                description="为支持 Tool Calling 的 AI 提供网页内容抓取集成"
                                            />
                                        </n-list-item>
                                        <n-list-item>
                                            <template #suffix>
                                                <div class="w-72">
                                                    <n-input
                                                        v-model:value="
                                                            config.ai.jinaApiKey
                                                        "
                                                        type="password"
                                                        show-password-on="click"
                                                        placeholder="Jina API Key"
                                                    />
                                                </div>
                                            </template>
                                            <n-thing
                                                title="Jina 服务密钥"
                                                description="Jina 服务密钥 (明文记录在配置文件中)"
                                            />
                                        </n-list-item>
                                    </n-list>
                                </n-collapse-item>
                                <n-collapse-item
                                    v-show="false"
                                    title="图片生成"
                                    name="createimage"
                                >
                                    <n-list class="!bg-transparent">
                                        <n-list-item>
                                            <template #suffix>
                                                <n-checkbox
                                                    v-model:checked="
                                                        config.ai.enableImage
                                                    "
                                                ></n-checkbox>
                                            </template>
                                            <n-thing
                                                title="启用图片生成集成"
                                                description="为支持 Tool Calling 的 AI 提供图片生成集成 (仅对话模式)"
                                            />
                                        </n-list-item>
                                        <n-list-item>
                                            <template #suffix>
                                                <div class="w-72">
                                                    <n-input
                                                        v-model:value="
                                                            config.ai
                                                                .imageApiKey
                                                        "
                                                        type="password"
                                                        show-password-on="click"
                                                        placeholder="API Key"
                                                    />
                                                </div>
                                            </template>
                                            <n-thing
                                                title="AI 图像生成 服务密钥"
                                                description="AI 图像生成 服务密钥 (明文记录在配置文件中)"
                                            />
                                        </n-list-item>
                                        <n-list-item>
                                            <template #suffix>
                                                <div class="w-72">
                                                    <n-input
                                                        v-model:value="
                                                            config.ai
                                                                .imageAIEndpoint
                                                        "
                                                        placeholder="https://api.freekey.site"
                                                    />
                                                </div>
                                            </template>
                                            <n-thing
                                                title="AI 图像生成 服务端点"
                                                description="使用的代理 AI 图像生成 服务端点"
                                            />
                                        </n-list-item>
                                        <n-list-item>
                                            <template #suffix>
                                                <div class="w-72">
                                                    <n-input
                                                        v-model:value="
                                                            config.ai.imageModel
                                                        "
                                                        placeholder="dall-e-3"
                                                    />
                                                </div>
                                            </template>
                                            <n-thing
                                                title="图片创建模型"
                                                description="使用哪个模型创建图像(请确认提供商支持)"
                                            />
                                        </n-list-item>
                                    </n-list>
                                </n-collapse-item>
                            </n-collapse>
                        </n-list-item>
                    </n-list>
                </n-tab-pane>
                <n-tab-pane
                    name="ai-snippets"
                    tab="AI 快速片段"
                    v-if="config.ai.enableAISnipets"
                >
                    <template v-if="snippetPage === 'list'">
                        <n-thing
                            title="快速片段"
                            description="自定义的AI 快速片段"
                            class="animate-fade-up animate-once animate-duration-500 animate-ease-out"
                        >
                            <template #header-extra>
                                <div>
                                    <n-button @click="createSnippet">
                                        <template #icon>
                                            <n-icon>
                                                <MdiPlus />
                                            </n-icon>
                                        </template>
                                        添加
                                    </n-button>
                                </div>
                            </template>
                        </n-thing>
                        <div
                            class="home-pane-scroll animate-fade-up animate-once animate-duration-500 animate-ease-out"
                        >
                            <n-list
                                class="!bg-transparent size-full overflow-y-auto thin-scrollbar"
                            >
                                <template v-for="snippet in config.snippets">
                                    <n-list-item class="group">
                                        <n-thing
                                            :title="snippet.name"
                                            :description="
                                                snippet.prompt.slice(0, 80) +
                                                (snippet.prompt.length > 80
                                                    ? '...'
                                                    : '')
                                            "
                                        >
                                            <template #avatar>
                                                <n-avatar>
                                                    <n-icon>
                                                        <MdiFileDocumentEditOutline />
                                                    </n-icon>
                                                </n-avatar>
                                            </template>
                                            <template #header-extra>
                                                <div
                                                    class="flex flex-row gap-1 opacity-0 group-hover:opacity-100"
                                                >
                                                    <n-button
                                                        size="small"
                                                        @click="
                                                            () =>
                                                                editSnippet(
                                                                    snippet
                                                                )
                                                        "
                                                    >
                                                        <template #icon>
                                                            <n-icon>
                                                                <MdiPencil />
                                                            </n-icon>
                                                        </template>
                                                    </n-button>

                                                    <n-popconfirm
                                                        @positive-click="
                                                            () =>
                                                                deleteSnippet(
                                                                    snippet
                                                                )
                                                        "
                                                    >
                                                        <template #trigger>
                                                            <n-button
                                                                size="small"
                                                                ghost
                                                                type="error"
                                                            >
                                                                <template #icon>
                                                                    <n-icon>
                                                                        <MdiDelete />
                                                                    </n-icon>
                                                                </template>
                                                            </n-button>
                                                        </template>
                                                        确定删除吗？
                                                    </n-popconfirm>
                                                </div>
                                            </template>
                                        </n-thing>
                                    </n-list-item>
                                </template>
                            </n-list>
                        </div>
                    </template>
                    <template v-else-if="snippetPage === 'edit'">
                        <n-thing
                            :title="
                                (currentSnippet.isNew ? '创建' : '修改') +
                                'AI快速片段'
                            "
                            class="animate-fade-up animate-once animate-duration-500 animate-ease-out"
                        >
                            <template #avatar>
                                <n-avatar>
                                    <n-icon>
                                        <MdiFileDocumentEditOutline />
                                    </n-icon>
                                </n-avatar>
                            </template>
                            <template #header-extra>
                                <div class="flex flex-row gap-1">
                                    <n-button
                                        @click="() => backToSnippetList()"
                                    >
                                        <template #icon>
                                            <n-icon>
                                                <MdiKeyboardBackspace />
                                            </n-icon>
                                        </template>
                                        返回
                                    </n-button>
                                    <n-button
                                        v-if="!currentSnippet.isNew"
                                        @click="
                                            () => deleteSnippet(currentSnippet)
                                        "
                                        ghost
                                        type="error"
                                    >
                                        <template #icon>
                                            <n-icon>
                                                <MdiDelete />
                                            </n-icon>
                                        </template>
                                        删除
                                    </n-button>
                                    <n-button @click="() => saveSnippet()">
                                        <template #icon>
                                            <n-icon>
                                                <MdiCheck />
                                            </n-icon>
                                        </template>
                                        保存
                                    </n-button>
                                </div>
                            </template>

                            <div
                                class="home-pane-form thin-scrollbar"
                            >
                                <div>
                                    <span>名称</span>
                                    <n-input
                                        placeholder="片段名称"
                                        v-model:value="currentSnippet.name"
                                    ></n-input>
                                </div>
                                <div>
                                    <span>系统提示词</span>
                                    <n-input
                                        :autosize="{
                                            minRows: 2,
                                            maxRows: 10,
                                        }"
                                        type="textarea"
                                        placeholder="角色为System的提示词，通常用于描述AI角色，可用{{clipboard}}表示剪贴板内容"
                                        v-model:value="currentSnippet.system"
                                    ></n-input>
                                </div>
                                <div>
                                    <span>用户提示词</span>
                                    <n-input
                                        :autosize="{
                                            minRows: 3,
                                            maxRows: 15,
                                        }"
                                        type="textarea"
                                        :placeholder="
                                            '角色为User的提示词，通常用于描述任务' +
                                            (currentSnippet.advanced
                                                ? '，可用{{clipboard}}表示剪贴板内容'
                                                : '')
                                        "
                                        v-model:value="currentSnippet.prompt"
                                    ></n-input>
                                </div>
                                <div v-if="!currentSnippet.advanced">
                                    <div class="flex flex-row justify-between">
                                        <div>使用新版提示词功能</div>
                                        <n-button
                                            size="small"
                                            type="primary"
                                            @click="upgradeSnippet"
                                            >升级</n-button
                                        >
                                    </div>
                                    <span class="opacity-50"
                                        >新版本提示词功能不再内置模板而是完全使用用户定义的内容，并且支持使用<span
                                            class="markdown-align"
                                            ><code v-pre>{{
                                                clipboard
                                            }}</code></span
                                        >作为剪贴板内容占位符。为了避免破坏原有提示词功能，需要手动确认升级。</span
                                    >
                                </div>
                                <div>
                                    <div class="flex flex-row justify-between">
                                        <div>使用 Markdown 输出</div>
                                        <div>
                                            <n-switch
                                                v-model:value="
                                                    currentSnippet.markdown
                                                "
                                            />
                                        </div>
                                    </div>
                                    <span class="opacity-50"
                                        >使用Markdown输出将会导致结果无法直接编辑。</span
                                    >
                                </div>
                            </div>
                        </n-thing>
                    </template>
                </n-tab-pane>
                <n-tab-pane name="about" tab="关于">
                    <n-list
                        class="!bg-transparent !px-2 size-full overflow-y-auto thin-scrollbar animate-fade-up animate-once animate-duration-500 animate-ease-out"
                    >
                        <n-list-item>
                            <n-thing
                                title="版本"
                                :description="AppInfo.version"
                            >
                                <template #action>
                                    <n-button
                                        strong
                                        secondary
                                        :type="updateState.type"
                                        size="small"
                                        @click="checkUpdate"
                                        :loading="updateState.working"
                                        :disabled="updateState.working"
                                    >
                                        <template #icon>
                                            <n-icon>
                                                <component
                                                    :is="currentIcon"
                                                ></component>
                                            </n-icon>
                                        </template>
                                        {{ updateState.btn }}
                                    </n-button>
                                </template>
                            </n-thing>
                            <n-collapse-transition
                                :show="updateState.haveUpdate"
                            >
                                <div class="w-[600px] mt-5">
                                    <div
                                        class="mb-3"
                                        v-if="updateState.latestDate"
                                    >
                                        发布于
                                        {{
                                            convertDatetime(
                                                updateState.latestDate || ''
                                            )
                                        }}
                                    </div>
                                    <HijackedATag as-external-link>
                                        <div
                                            class="markdown-align"
                                            v-html="
                                                marked.parse(
                                                    asString(
                                                        (updateState.latestNote ||
                                                            '*请打开项目页面查看更新信息*') +
                                                            updateSuffix
                                                    )
                                                )
                                            "
                                        ></div>
                                    </HijackedATag>
                                </div>
                            </n-collapse-transition>
                        </n-list-item>
                        <n-list-item>
                            <n-thing title="作者" description="CKylinMC" />
                        </n-list-item>
                        <n-list-item>
                            <n-thing
                                title="源代码"
                                description="https://github.com/CKylinMC/PasteMe"
                            >
                                项目基于 MIT 协议开源
                                <template #action>
                                    <div class="flex flex-row gap-1">
                                        <n-button
                                            size="small"
                                            @click="openProjectPage"
                                        >
                                            项目页面 (Github)
                                        </n-button>
                                        <n-button
                                            size="small"
                                            @click="openFeedbackPage"
                                        >
                                            反馈页面 (Github)
                                        </n-button>
                                    </div>
                                </template>
                            </n-thing>
                        </n-list-item>
                    </n-list>
                </n-tab-pane>
            </n-tabs>
        </div>

        </div>

        <n-modal
            v-model:show="closeConfirm"
            preset="dialog"
            title="确认退出应用吗？"
            content="若只是想要隐藏窗口，请使用最小化按钮"
            positive-text="退出"
            negative-text="返回"
            @positive-click="closeApp"
        />

        <Toast ref="toast" />
    </div>
</template>

<style scoped>
.home-shell {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 28px 32px 32px;
    color: var(--vibe-text-primary);
    overflow: hidden;
}

.home-hero {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
    padding: 28px 34px;
    border-radius: var(--vibe-radius-xl);
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(231, 241, 255, 0.78) 100%);
    border: 1px solid color-mix(in srgb, var(--vibe-accent) 16%, transparent);
    box-shadow: 0 26px 54px rgba(49, 70, 255, 0.18);
    overflow: hidden;
}

.home-hero::before,
.home-hero::after {
    content: "";
    position: absolute;
    inset: -30% -10% auto -10%;
    height: 160%;
    background: radial-gradient(65% 65% at 20% 25%, rgba(79, 155, 255, 0.32), transparent 68%);
    transform: translate3d(0, 0, 0);
    animation: hero-glow 16s ease-in-out infinite;
    pointer-events: none;
}

.home-hero::after {
    inset: auto -20% -40% 40%;
    background: radial-gradient(60% 60% at 60% 40%, rgba(111, 207, 255, 0.22), transparent 72%);
    animation-delay: -6s;
}

:global(.dark) .home-hero {
    background: linear-gradient(140deg, rgba(30, 37, 58, 0.9), rgba(21, 28, 47, 0.86));
    border-color: color-mix(in srgb, var(--vibe-border-strong) 60%, transparent);
    box-shadow: 0 28px 58px rgba(2, 10, 28, 0.6);
}

:global(.dark) .home-hero::before,
:global(.dark) .home-hero::after {
    background: radial-gradient(68% 68% at 30% 30%, rgba(78, 131, 255, 0.24), transparent 70%);
}

.home-hero__info {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 60%;
}

.home-hero__title {
    display: flex;
    align-items: center;
    gap: 18px;
}

.home-hero__logo {
    width: 54px;
    height: 54px;
    border-radius: 16px;
    box-shadow: 0 18px 38px rgba(79, 107, 255, 0.25);
}

.home-hero__title h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: 0.2px;
}

.home-hero__title p {
    margin: 4px 0 0;
    font-size: 14px;
    color: var(--vibe-text-secondary);
}

.home-hero__meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
}

.home-hero__meta-text {
    font-size: 12px;
    color: var(--vibe-text-secondary);
    letter-spacing: 0.4px;
}

.home-hero__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
    gap: 12px;
}

.home-stats-grid {
    display: grid;
    gap: 18px;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

.home-card-enter-active,
.home-card-leave-active,
.home-card-move {
    transition: transform 360ms var(--vibe-transition), opacity 360ms var(--vibe-transition);
}

.home-card-enter-from,
.home-card-leave-to {
    opacity: 0;
    transform: translateY(18px) scale(0.96);
}

.home-stat-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 20px 22px;
    border-radius: var(--vibe-radius-lg);
    border: 1px solid color-mix(in srgb, var(--vibe-accent) 14%, transparent);
    background: linear-gradient(160deg, rgba(255, 255, 255, 0.92), rgba(235, 242, 255, 0.78));
    box-shadow: 0 24px 52px rgba(28, 48, 110, 0.16);
    overflow: hidden;
    transform: translateZ(0);
    animation: card-float 840ms ease forwards;
    animation-delay: calc(0.08s * var(--card-index, 0));
}

.home-stat-card::before {
    content: "";
    position: absolute;
    inset: -40% -20% auto 40%;
    height: 140%;
    background: radial-gradient(60% 60% at 65% 20%, rgba(79, 107, 255, 0.18), transparent 70%);
    opacity: 0.9;
    pointer-events: none;
}

.home-stat-card:hover {
    transform: translateY(-8px) scale(1.01);
    box-shadow: 0 28px 64px rgba(28, 48, 110, 0.22);
}

.home-stat-card__title {
    font-size: 13px;
    color: var(--vibe-text-muted);
    letter-spacing: 0.3px;
}

.home-stat-card__value {
    font-size: 26px;
    font-weight: 700;
    color: var(--vibe-text-primary);
}

.home-stat-card__meta {
    font-size: 12px;
    color: var(--vibe-text-secondary);
    line-height: 1.4;
}

.home-stat-card__progress {
    margin-top: auto;
}

.home-stat-card--positive {
    border-color: rgba(82, 196, 26, 0.28);
}

.home-stat-card--success {
    border-color: rgba(82, 196, 26, 0.32);
}

.home-stat-card--warning {
    border-color: rgba(250, 173, 20, 0.38);
}

:global(.dark) .home-stat-card {
    background: linear-gradient(160deg, rgba(29, 36, 58, 0.92), rgba(21, 28, 48, 0.85));
    border-color: color-mix(in srgb, var(--vibe-border-strong) 60%, transparent);
    box-shadow: 0 28px 64px rgba(2, 9, 26, 0.72);
}

:global(.dark) .home-stat-card::before {
    background: radial-gradient(60% 60% at 65% 20%, rgba(78, 131, 255, 0.2), transparent 70%);
}

.home-diagnostics {
    position: relative;
    margin-top: 4px;
    padding: 26px 28px;
    border-radius: var(--vibe-radius-xl);
    border: 1px solid color-mix(in srgb, var(--vibe-accent) 12%, transparent);
    background: linear-gradient(155deg, rgba(255, 255, 255, 0.92), rgba(228, 239, 255, 0.76));
    box-shadow: 0 32px 70px rgba(28, 48, 110, 0.22);
    display: flex;
    flex-direction: column;
    gap: 18px;
    overflow: hidden;
}

.home-diagnostics::before {
    content: "";
    position: absolute;
    inset: -45% 30% auto -20%;
    height: 150%;
    background: radial-gradient(60% 60% at 60% 35%, rgba(79, 172, 255, 0.18), transparent 75%);
    pointer-events: none;
}

:global(.dark) .home-diagnostics {
    background: linear-gradient(155deg, rgba(26, 32, 53, 0.9), rgba(18, 24, 42, 0.82));
    border-color: color-mix(in srgb, var(--vibe-border-strong) 58%, transparent);
    box-shadow: 0 36px 76px rgba(2, 8, 24, 0.72);
}

:global(.dark) .home-diagnostics::before {
    background: radial-gradient(60% 60% at 60% 35%, rgba(78, 131, 255, 0.22), transparent 75%);
}

.home-diagnostics__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
}

.home-diagnostics__header h2 {
    margin: 0 0 6px;
    font-size: 18px;
    font-weight: 700;
}

.home-diagnostics__header p {
    margin: 0;
    font-size: 13px;
    color: var(--vibe-text-secondary);
}

.home-diagnostics__score {
    display: flex;
    align-items: center;
    gap: 16px;
    color: var(--vibe-text-secondary);
    font-size: 13px;
}

.home-diagnostics__score-value {
    font-size: 44px;
    font-weight: 700;
    color: var(--vibe-accent-strong);
    line-height: 1;
    animation: score-pulse 3s ease-in-out infinite;
}

.home-diagnostics__score[data-tone="warning"] .home-diagnostics__score-value {
    color: #f6a700;
}

.home-diagnostics__score[data-tone="error"] .home-diagnostics__score-value {
    color: #ff6b6b;
}

.home-diagnostics__score-meta {
    font-size: 12px;
    color: var(--vibe-text-muted);
}

.home-diagnostics__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 12px;
}

.home-diagnostics__item {
    padding: 14px 18px;
    border-radius: var(--vibe-radius-md);
    border: 1px solid rgba(79, 107, 255, 0.14);
    background: rgba(255, 255, 255, 0.78);
    box-shadow: 0 18px 32px rgba(28, 48, 110, 0.08);
    transition: transform 220ms ease, box-shadow 220ms ease;
}

.home-diagnostics__item--success {
    border-color: rgba(82, 196, 26, 0.28);
}

.home-diagnostics__item--warning {
    border-color: rgba(250, 173, 20, 0.32);
}

.home-diagnostics__item--error {
    border-color: rgba(255, 107, 107, 0.32);
    background: rgba(255, 235, 235, 0.76);
}

.home-diagnostics__item-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    font-weight: 600;
    font-size: 14px;
}

.home-diagnostics__item-duration {
    font-size: 12px;
    color: var(--vibe-text-muted);
}

.home-diagnostics__item-hint {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--vibe-text-secondary);
    line-height: 1.5;
}

:global(.dark) .home-diagnostics__item {
    background: rgba(24, 30, 52, 0.82);
    box-shadow: 0 22px 40px rgba(2, 8, 24, 0.62);
}

.home-diagnostics__suggestions {
    list-style: disc;
    margin: 0;
    padding-left: 20px;
    color: var(--vibe-text-secondary);
    font-size: 12px;
    line-height: 1.5;
}

.diagnostic-list-enter-active,
.diagnostic-list-leave-active,
.diagnostic-list-move {
    transition: transform 320ms var(--vibe-transition), opacity 320ms var(--vibe-transition);
}

.diagnostic-list-enter-from,
.diagnostic-list-leave-to {
    opacity: 0;
    transform: translateY(12px);
}

.home-content {
    flex: 1;
    display: flex;
    min-height: 0;
}

.home-tabs-card {
    flex: 1;
    display: flex;
    padding: 12px;
    border-radius: var(--vibe-radius-xl);
    border: 1px solid color-mix(in srgb, var(--vibe-accent) 12%, transparent);
    background: color-mix(in srgb, var(--vibe-panel-surface-strong) 94%, rgba(255, 255, 255, 0.1));
    box-shadow: 0 24px 54px rgba(28, 48, 110, 0.18);
    overflow: hidden;
}

:global(.dark) .home-tabs-card {
    background: color-mix(in srgb, var(--vibe-panel-surface) 88%, rgba(16, 22, 40, 0.6));
    box-shadow: 0 24px 60px rgba(2, 8, 24, 0.68);
}

.home-tabs {
    flex: 1;
    display: flex;
    min-height: 0;
}

.home-tabs :deep(.n-tabs-pane-wrapper) {
    flex: 1;
    min-height: 0;
    display: flex;
}

.home-tabs :deep(.n-tab-pane) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: transparent;
}

.home-tabs :deep(.n-tabs-nav) {
    width: 220px;
    padding: 16px 12px;
    border-right: 1px solid var(--vibe-border-soft);
    background: transparent;
}

.home-tabs :deep(.n-tabs-nav)::after {
    display: none;
}

.home-tabs :deep(.n-tabs-tab) {
    border-radius: var(--vibe-radius-md);
    margin-bottom: 10px;
    padding: 10px 14px;
    transition: background var(--vibe-transition), color var(--vibe-transition);
}

.home-tabs :deep(.n-tabs-tab:hover) {
    background: rgba(79, 107, 255, 0.12);
}

.home-tabs :deep(.n-tabs-tab.n-tabs-tab--active) {
    background: linear-gradient(120deg, rgba(79, 107, 255, 0.18), rgba(79, 107, 255, 0.32));
    color: var(--vibe-accent-strong);
}

.home-tabs :deep(.n-tabs-tab__label) {
    font-size: 14px;
    font-weight: 600;
}

.home-tabs :deep(.n-tabs-content) {
    flex: 1;
    display: flex;
    min-height: 0;
    padding: 16px 20px 16px 24px;
}

.home-pane-scroll {
    width: 100%;
    height: 100%;
    flex: 1;
    padding: 12px;
    border-radius: var(--vibe-radius-lg);
    border: 1px solid var(--vibe-border-soft);
    background: rgba(255, 255, 255, 0.78);
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
}

:global(.dark) .home-pane-scroll {
    background: rgba(28, 31, 48, 0.78);
}

.home-pane-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow-y: auto;
    padding-right: 4px;
    max-height: 100%;
}

ul {
    list-style-type: disc;
    padding-left: 20px;
}

@keyframes hero-glow {
    0% {
        transform: translate3d(-4%, -6%, 0) scale(1.04);
        opacity: 0.7;
    }
    50% {
        transform: translate3d(6%, 4%, 0) scale(1.08);
        opacity: 1;
    }
    100% {
        transform: translate3d(-2%, 6%, 0) scale(1.02);
        opacity: 0.75;
    }
}

@keyframes card-float {
    0% {
        opacity: 0;
        transform: translateY(18px) scale(0.96);
    }
    100% {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

@keyframes score-pulse {
    0%,
    100% {
        transform: scale(1);
    }
    50% {
        transform: scale(1.04);
    }
}

@media (prefers-reduced-motion: reduce) {
    .home-card-enter-active,
    .home-card-leave-active,
    .home-card-move,
    .diagnostic-list-enter-active,
    .diagnostic-list-leave-active,
    .diagnostic-list-move {
        transition-duration: 0.01ms;
    }

    .home-card-enter-from,
    .home-card-leave-to,
    .diagnostic-list-enter-from,
    .diagnostic-list-leave-to {
        transform: none;
    }

    .home-stat-card,
    .home-diagnostics__score-value,
    .home-hero::before,
    .home-hero::after {
        animation: none !important;
    }
}
</style>
