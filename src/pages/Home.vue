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
        console.log('save', unref(config));
        debouncedSaveConfig();
    },
    { deep: true }
);

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

const { updateState, checkUpdate } = useUpdater();

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
    <div
        class="text-black p-5 align-left relative select-none bg-white/95 dark:bg-transparent dark:text-white"
    >
        <div
            data-tauri-drag-region
            class="absolute top-0 right-0 h-10 w-full flex flex-row justify-end items-start"
        >
            <div
                class="w-12 h-8 py-2 px-3.5 hover:bg-black/50"
                @click="minimizeApp"
            >
                <QlementineIconsWindowsMinimize16 />
            </div>
            <div
                class="w-12 h-8 py-2 px-3.5 hover:bg-red-500/50"
                @click="openCloseConfirm"
            >
                <QlementineIconsWindowsClose16 />
            </div>
        </div>
        <div class="text-3xl">
            <img class="inline size-12" :src="ClipAIIcon" /> Paste Me!
        </div>
        <div class="text-gray-400">一个简易的剪贴板增强工具</div>
        <div class="w-full h-[490px] mt-3 flex flex-col">
            <n-tabs type="line" animated placement="left" class="size-full">
                <n-tab-pane name="welcome" tab="欢迎使用">
                    <n-list
                        class="!bg-transparent !px-2 size-full overflow-y-auto thin-scrollbar animate-fade-up animate-once animate-duration-500 animate-ease-out"
                    >
                        <n-list-item>
                            <n-thing title="这是什么？">
                                <div>
                                    <p>
                                        Paste Me!
                                        是一个简易的剪贴板增强工具，可以帮助您更好地管理剪贴板内容。
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
                                        <li>查看、粘贴当前复制的文本</li>
                                        <li>
                                            将当前文本重新复制为纯文本（清除颜色、格式和链接）
                                        </li>
                                        <li>通过AI，将文本转换为其他格式</li>
                                        <li>通过AI解读、搜索文本</li>
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
                                        placeholder="https://api.openai.com/v1"
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
                                                        placeholder="https://api.openai.com/v1"
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
                            class="w-full h-[445px] p-2 animate-fade-up animate-once animate-duration-500 animate-ease-out"
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
                                class="flex flex-col gap-2 thin-scrollbar overflow-y-auto h-[440px]"
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
ul {
    list-style-type: disc;
    padding-left: 20px;
}
</style>
