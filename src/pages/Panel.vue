<script setup lang="ts">
import {
    onBeforeUnmount,
    onMounted,
    computed,
    ref,
    watch,
    nextTick,
} from 'vue';
import { type Snippet, useConfig } from '@/composables/useConfig';
import { StopToken, useAI } from '@/composables/useAI';
import { useClipboard } from '@/composables/useClipboard';
import { type PanelPage, usePanelWindow } from '@/composables/usePanelWindow';
import { webviewWindow } from '@tauri-apps/api';
import SolarTextFieldFocusLineDuotone from '~icons/solar/text-field-focus-line-duotone';
import SolarTextBoldDuotone from '~icons/solar/text-bold-duotone';
import SolarCodeLineDuotone from '~icons/solar/code-line-duotone';
import SolarLightbulbBoltLineDuotone from '~icons/solar/lightbulb-bolt-line-duotone';
import SolarPen2LineDuotone from '~icons/solar/pen-2-line-duotone';
import SolarCalculatorLineDuotone from '~icons/solar/calculator-line-duotone';
import SolarAltArrowLeftLineDuotone from '~icons/solar/alt-arrow-left-line-duotone';
import SolarAltArrowRightLineDuotone from '~icons/solar/alt-arrow-right-line-duotone';
import SolarNotificationUnreadLinesLineDuotone from '~icons/solar/notification-unread-lines-line-duotone';
import SolarCheckSquareLineDuotone from '~icons/solar/check-square-line-duotone';
import LineMdLoadingTwotoneLoop from '~icons/line-md/loading-twotone-loop';
import SolarSettingsLineDuotone from '~icons/solar/settings-line-duotone';
import SolarChatLineLineDuotone from '~icons/solar/chat-line-line-duotone';
import SolarClipboardListLineDuotone from '~icons/solar/clipboard-list-line-duotone';
import SolarLinkMinimalistic2BoldDuotone from '~icons/solar/link-minimalistic-2-bold-duotone';
import SolarSquareTopDownLineDuotone from '~icons/solar/square-top-down-line-duotone';
import SolarCopyLineDuotone from '~icons/solar/copy-line-duotone';
import SolarDocumentTextLineDuotone from '~icons/solar/document-text-line-duotone';
import { simulatePaste } from '@/libs/bridges';
import AIChat from '@/components/AIChat.vue';
import { asString, fetchUrls } from '@/libs/utils';
import { openUrl } from '@tauri-apps/plugin-opener';
import { marked } from 'marked';
import HijackedATag from '@/components/HijackedATag.vue';
import { Menu } from '@/components/MenuView.vue';

const { config, loadConfig, saveConfig } = useConfig();
const { generating, generatedContent, userPrompt, generateText } =
    useAI(config);
const clipboard = useClipboard();
const { content, contentPreview, stats, refresh, update } = clipboard;
const { page, showPreview, mouseInRange, gotoPage, setupWindowListeners } =
    usePanelWindow(clipboard);

const vFocus = {
    mounted: (el: HTMLElement) => el.focus(),
};

const mainView = new webviewWindow.WebviewWindow('main', {
    url: '/',
});

const stopToken = ref<StopToken | null>(null);

// 菜单焦点
const focusOn = ref(0);

const useMarkdownRender = ref(false);

const currentSnippet = ref({
    isNew: false,
    id: '',
    name: '',
    prompt: '',
    system: '',
    markdown: true,
});

const foundUrls = ref<string[]>([]);
const selectedUrl = ref('');

// 可保存状态
const savable = computed(() => {
    return ['edit', 'tojson', 'askai', 'aicreate', 'snippets-ai'].includes(
        page.value
    );
});

const handlePageChange = (page: PanelPage) => {
    if (['askai', 'aicreate', 'snippets-ai'].includes(page)) {
        useMarkdownRender.value = true;
    } else {
        useMarkdownRender.value = false;
    }
    if (['index', 'snippets', 'urls', 'urls-actions'].includes(page)) {
        focusOn.value = 0;
    }
    if (page === 'urls') {
        selectedUrl.value = '';
    }
    if (page === 'tojson') {
        userPrompt.value = '转换为JSON';
    } else {
        userPrompt.value = '';
    }
};

const hasContent = computed(() => content.value.trim().length > 0);
// 菜单配置
const menus = computed<Menu[]>((): Menu[] => {
    selectedUrl.value = '';
    foundUrls.value = config.value.detect.enabled
        ? fetchUrls(content.value)
        : [];
    const list = [
        hasContent.value && config.value.common.enablePaste
            ? {
                  key: 'paste',
                  label: '粘贴',
                  description: '直接粘贴文本',
                  action: () => {
                      hideWindow().then(simulatePaste);
                  },
                  icon: SolarClipboardListLineDuotone,
              }
            : null,
        hasContent.value && config.value.common.enableCalc
            ? {
                  key: 'calc',
                  label: '统计',
                  description: `共计 ${content.value.length} 字符，${
                      content.value.split('\n').length
                  } 行，非空字符 ${
                      content.value.replace(/\s/g, '').length
                  } 字符`,
                  action: () => gotoPage('calc', handlePageChange),
                  isSub: true,
                  icon: SolarCalculatorLineDuotone,
              }
            : null,
        config.value.common.enableEdit
            ? {
                  key: 'edit',
                  label: '编辑',
                  description: '直接修改内容',
                  action: () => gotoPage('edit', handlePageChange),
                  isSub: true,
                  icon: SolarTextFieldFocusLineDuotone,
              }
            : null,
        foundUrls.value && foundUrls.value.length > 0
            ? {
                  key: 'urls',
                  label: '提取链接...',
                  description: `发现 ${foundUrls.value.length} 个可能的链接`,
                  action: () => {
                      gotoPage('urls', handlePageChange);
                  },
                  isSub: true,
                  icon: SolarLinkMinimalistic2BoldDuotone,
              }
            : null,
        hasContent.value && config.value.common.enableToText
            ? {
                  key: 'text',
                  label: '转为纯文本',
                  description: '重新复制为纯文本',
                  action: () => {
                      update(content.value);
                      hideWindow();
                  },
                  icon: SolarTextBoldDuotone,
              }
            : null,
    ];
    if (config.value?.ai.enabled) {
        list.push(
            hasContent.value && config.value.ai.enableToJson
                ? {
                      key: 'json',
                      label: '转为JSON',
                      description: '使用AI将内容转为JSON',
                      action: () => gotoPage('tojson', handlePageChange),
                      isSub: true,
                      icon: SolarCodeLineDuotone,
                  }
                : null,
            hasContent.value && config.value.ai.enableAskAI
                ? {
                      key: 'askai',
                      label: '询问AI...',
                      description: '让AI帮忙处理',
                      action: () => gotoPage('askai', handlePageChange),
                      isSub: true,
                      icon: SolarLightbulbBoltLineDuotone,
                  }
                : null,
            config.value.ai.enableAICreation
                ? {
                      key: 'aicreate',
                      label: '使用AI创作...',
                      description: '让AI帮忙创作',
                      action: () => gotoPage('aicreate', handlePageChange),
                      isSub: true,
                      icon: SolarPen2LineDuotone,
                  }
                : null,
            config.value.ai.enableAIChat
                ? {
                      key: 'chat',
                      label: '与AI对话',
                      description: '基于剪贴板内容与AI进行可持续的对话',
                      isSub: true,
                      icon: SolarChatLineLineDuotone,
                      action: () => gotoPage('chat', handlePageChange),
                  }
                : null,
            config.value.ai.enableAISnipets
                ? {
                      key: 'snippets',
                      label: '快速AI片段',
                      description: '保存的AI请求片段',
                      action: () => gotoPage('snippets', handlePageChange),
                      isSub: true,
                      icon: SolarNotificationUnreadLinesLineDuotone,
                  }
                : null
        );
    }
    return list.filter(it => !!it);
});

const linkMenu = computed<Menu[]>(() => {
    return [
        {
            key: 'copy',
            label: '复制',
            description: '用此链接替换剪贴板内容',
            action: () => {
                update(selectedUrl.value);
                hideWindow();
            },
            icon: SolarCopyLineDuotone,
        },
        {
            key: 'open',
            label: '打开',
            description: '打开此链接',
            action: () => {
                openUrl(selectedUrl.value);
                hideWindow();
            },
            icon: SolarSquareTopDownLineDuotone,
        },
        config.value?.ai.enabled && config.value?.ai.enableWebCrawl
            ? {
                  key: 'askAi',
                  label: '总结页面',
                  description: '尝试让 AI 总结链接',
                  action: () => {
                      gotoPage('askai', handlePageChange);
                      startAskAI('总结这个链接的页面内容', selectedUrl.value);
                  },
                  icon: SolarDocumentTextLineDuotone,
                  isSub: true,
              }
            : null,
    ].filter(it => !!it);
});

async function executeLinkMenu(action: () => void) {
    try {
        await action();
    } catch (error) {
        console.error(error);
        hideWindow();
    }
}

function runSnippet(snippet: Snippet) {
    gotoPage('snippets-ai', handlePageChange);
    currentSnippet.value = {
        ...snippet,
        markdown: snippet.markdown ?? false,
        isNew: false,
    };
    useMarkdownRender.value = snippet.markdown ?? false;
    createTask(
        snippet.system,
        `用户指令:\n${snippet.prompt}\n\n剪贴板内容:\n${content.value}\n\n输出:\n`
    );
}

// 执行菜单动作
function executeMenu(key: string) {
    const menu = menus.value.find(menu => menu.key === key);
    if (menu) {
        menu.action();
    }
}

// AI 相关页面Enter键处理
function handleAIPageEnter() {
    if (generating.value) {
        abortTask();
    } else if (userPrompt.value?.trim().length > 0) {
        if (page.value === 'tojson') {
            startConvertToJson();
        } else if (page.value === 'askai') {
            startAskAI();
        } else if (page.value === 'aicreate') {
            startAICreate();
        }
    }
}

function selectUrl(url: string) {
    selectedUrl.value = url;
    gotoPage('urls-actions', handlePageChange);
}

// 监听页面变化，自动聚焦到输入框
watch(page, newPage => {
    nextTick(() => {
        const selector =
            newPage === 'edit'
                ? '.edit-textarea'
                : ['tojson', 'askai', 'aicreate'].includes(newPage)
                ? '.prompt-input'
                : null;
        const focusInput = selector
            ? (document.querySelector(selector) as HTMLElement)
            : null;
        focusInput?.focus();
    });
});

// 扩展原有的listenKeydown函数
function listenKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
        if (page.value === 'index') {
            hideWindow();
        } else {
            handleBackAction();
        }
    }
    if (e.key === 'Enter' && e.ctrlKey && savable.value) {
        doSaveAction();
        return;
    }

    if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
    ) {
        return;
    }

    // 上下键导航
    if (page.value === 'index') {
        if (e.key === 'ArrowUp') {
            if (focusOn.value < 0) {
                focusOn.value = menus.value.length - 1;
            } else {
                focusOn.value =
                    (focusOn.value - 1 + menus.value.length) %
                    menus.value.length;
            }
            document
                .querySelector(`#${menus.value[focusOn.value].key}`)
                ?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                });
        }
        if (e.key === 'ArrowDown') {
            if (focusOn.value < 0) {
                focusOn.value = 0;
            } else {
                focusOn.value = (focusOn.value + 1) % menus.value.length;
            }
            document
                .querySelector(`#${menus.value[focusOn.value].key}`)
                ?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                });
        }
    } else if (page.value === 'snippets') {
        if (e.key === 'ArrowUp') {
            if (focusOn.value < 0) {
                focusOn.value = config.value.snippets.length - 1;
            } else {
                focusOn.value =
                    (focusOn.value - 1 + config.value.snippets.length) %
                    config.value.snippets.length;
            }
            document
                .querySelector(`#${config.value.snippets[focusOn.value].id}`)
                ?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                });
        }
        if (e.key === 'ArrowDown') {
            if (focusOn.value < 0) {
                focusOn.value = 0;
            } else {
                focusOn.value =
                    (focusOn.value + 1) % config.value.snippets.length;
            }
            document
                .querySelector(`#${config.value.snippets[focusOn.value].id}`)
                ?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                });
        }
    } else if (page.value === 'urls') {
        if (e.key === 'ArrowUp') {
            if (focusOn.value < 0) {
                focusOn.value = foundUrls.value.length - 1;
            } else {
                focusOn.value =
                    (focusOn.value - 1 + foundUrls.value.length) %
                    foundUrls.value.length;
            }
            document.querySelector(`#url-${focusOn.value}`)?.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
            });
        }
        if (e.key === 'ArrowDown') {
            if (focusOn.value < 0) {
                focusOn.value = 0;
            } else {
                focusOn.value = (focusOn.value + 1) % foundUrls.value.length;
            }
            document.querySelector(`#url-${focusOn.value}`)?.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
            });
        }
    } else if (page.value === 'urls-actions') {
        if (e.key === 'ArrowUp') {
            if (focusOn.value < 0) {
                focusOn.value = linkMenu.value.length - 1;
            } else {
                focusOn.value =
                    (focusOn.value - 1 + linkMenu.value.length) %
                    linkMenu.value.length;
            }
        }
        if (e.key === 'ArrowDown') {
            if (focusOn.value < 0) {
                focusOn.value = 0;
            } else {
                focusOn.value = (focusOn.value + 1) % linkMenu.value.length;
            }
        }
    }

    if (e.key === 'Enter' && focusOn.value >= 0) {
        if (page.value === 'index') executeMenu(menus.value[focusOn.value].key);
        else if (page.value === 'snippets') {
            const res = config.value.snippets[focusOn.value];
            if (res) runSnippet(res);
        } else if (page.value === 'urls') {
            const res = foundUrls.value[focusOn.value];
            if (res) {
                selectUrl(res);
            }
        } else if (page.value === 'urls-actions') {
            const res = linkMenu.value[focusOn.value];
            if (res) {
                executeLinkMenu(res.action);
            }
        }
    } else if (
        e.key === 'Enter' &&
        ['tojson', 'askai', 'aicreate'].includes(page.value)
    ) {
        handleAIPageEnter();
        e.preventDefault();
    }
}

const webview = new webviewWindow.WebviewWindow('context', {
    url: '/panel',
    width: 400,
    height: 456,
});

function gotoCreateSnippet() {
    gotoPage('snippets-edit', handlePageChange);
    currentSnippet.value.isNew = true;
    currentSnippet.value.name = `AI片段 #${Math.round(Math.random() * 100)}`;
    currentSnippet.value.prompt = '';
    currentSnippet.value.system =
        '你的任务是分析用户的剪贴板数据。使用用户的指令和剪贴板内容回答问题。';
    currentSnippet.value.id = '';
    currentSnippet.value.markdown = true;
}

function gotoEditSnippet(snippet: Snippet) {
    gotoPage('snippets-edit', handlePageChange);
    currentSnippet.value.isNew = false;
    currentSnippet.value.name = snippet.name;
    currentSnippet.value.prompt = snippet.prompt;
    currentSnippet.value.system = snippet.system;
    currentSnippet.value.id = snippet.id;
    currentSnippet.value.markdown = snippet.markdown ?? false;
}

const snippetFormOK = computed(() => {
    if (currentSnippet.value.name.trim().length === 0) {
        return false;
    }
    if (currentSnippet.value.prompt.trim().length === 0) {
        return false;
    }
    if (currentSnippet.value.system.trim().length === 0) {
        return false;
    }
    return true;
});

function saveSnippet() {
    if (!snippetFormOK.value) {
        return;
    }
    if (currentSnippet.value.isNew) {
        currentSnippet.value.id = `n-${Math.random()}`;
        config.value.snippets.push({
            id: currentSnippet.value.id,
            name: currentSnippet.value.name,
            prompt: currentSnippet.value.prompt,
            system: currentSnippet.value.system,
            markdown: currentSnippet.value.markdown,
        });
        currentSnippet.value.isNew = false;
    } else {
        const index = config.value.snippets.findIndex(
            s => s.id === currentSnippet.value.id
        );
        if (index >= 0) {
            config.value.snippets[index] = {
                id: currentSnippet.value.id,
                name: currentSnippet.value.name,
                prompt: currentSnippet.value.prompt,
                system: currentSnippet.value.system,
                markdown: currentSnippet.value.markdown,
            };
        }
    }
    saveConfig();
}

function deleteSnippet() {
    if (currentSnippet.value.id && !currentSnippet.value.isNew) {
        const index = config.value.snippets.findIndex(
            s => s.id === currentSnippet.value.id
        );
        if (index >= 0) {
            config.value.snippets.splice(index, 1);
            saveConfig();
        }
    }
    gotoPage('snippets', handlePageChange);
}

function hideWindow() {
    gotoPage('index');
    focusOn.value = 0;
    content.value = '';
    return webview.hide();
}

function abortTask() {
    stopToken.value?.stop();
}

function clearTask() {
    stopToken.value?.stop();
    generatedContent.value = '';
}

function createTask(system: string, prompt: string) {
    clearTask();
    stopToken.value = new StopToken();
    return generateText(system, prompt, stopToken.value);
}

// AI 相关操作函数
const startConvertToJson = () =>
    createTask(
        '你的任务是重新格式化用户的剪贴板数据。使用用户的指令和剪贴板内容进行编辑。只输出重新格式化的内容，使用原始格式，不要使用markdown。',
        `用户指令:\n${userPrompt.value}\n\n剪贴板内容:\n${content.value}\n\n输出:\n`
    );

const startAskAI = (presetPrompt?: string, text?: string) => {
    const cliptext = text ? text : content.value;
    const prompt = presetPrompt ? presetPrompt : userPrompt.value;
    userPrompt.value = prompt;
    return createTask(
        '你的任务是分析用户的剪贴板数据。使用用户的指令和剪贴板内容回答问题。',
        `用户指令:\n${prompt}\n\n剪贴板内容:\n${cliptext}\n\n输出:\n`
    );
};

const startAICreate = () =>
    createTask(
        '你的任务是基于用户的指令继续创作内容。使用用户的指令和剪贴板内容进行创作。',
        `用户指令:\n${userPrompt.value}\n\n剪贴板内容:\n${content.value}\n\n输出:\n`
    );

// 保存操作处理
function doSaveAction() {
    switch (page.value) {
        case 'edit':
            update(content.value);
            gotoPage('index', handlePageChange);
            break;
        case 'tojson':
        case 'askai':
        case 'aicreate':
        case 'snippets-ai':
            update(generatedContent.value);
            gotoPage('index', handlePageChange);
            break;
    }
}

function handleBackAction() {
    switch (page.value) {
        case 'snippets-edit':
        case 'snippets-ai':
            gotoPage('snippets', handlePageChange);
            break;
        default:
            gotoPage('index', handlePageChange);
            break;
    }
}

const openMainSettings = () => {
    mainView.show();
    mainView.setFocus();
};

let unlistenFocus: () => void;

// 生命周期钩子
onMounted(async () => {
    window.addEventListener('keydown', listenKeydown);
    await loadConfig(); // 首次加载配置
    unlistenFocus = await setupWindowListeners(hideWindow, loadConfig); // 传入 hideWindow 函数
    await refresh(); // 初始化时读取剪贴板内容
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', listenKeydown);
    unlistenFocus?.();
});
</script>

<template>
    <div
        class="flex flex-col size-full select-none bg-white/95 dark:bg-transparent dark:text-white"
        @mouseover="mouseInRange = true"
        @mouseleave="mouseInRange = false"
    >
        <div
            class="bg-neutral-500/10 dark:bg-black p-2"
            :class="[showPreview && hasContent ? 'h-[120px]' : 'h-[32px]']"
        >
            <div data-tauri-drag-region class="text-gray-800 dark:text-gray-400 h-6 relative">
                <div
                    data-tauri-drag-region
                    class="cursor-move absolute top-1 left-1/2 -translate-x-1/2 w-10 h-2 rounded-lg bg-neutral-500 dark:bg-white/40"
                ></div>
                <SolarAltArrowLeftLineDuotone
                    class="inline hover:bg-gray-500/30 animate-fade-right animate-once animate-duration-300 animate-ease-out"
                    @click="handleBackAction"
                    v-if="page !== 'index'"
                />
                <span>剪贴板</span>
                <SolarSettingsLineDuotone
                    class="inline hover:bg-gray-500/30 float-end"
                    @click="openMainSettings"
                />
                <LineMdLoadingTwotoneLoop
                    class="inline hover:bg-gray-500/90 float-end animate-fade-left animate-once animate-duration-300 animate-ease-out"
                    v-if="generating"
                />
                <SolarCheckSquareLineDuotone
                    class="inline hover:bg-gray-500/90 float-end animate-fade-left animate-once animate-duration-300 animate-ease-out"
                    @click="doSaveAction"
                    v-if="savable && !generating"
                />
            </div>
            <n-collapse-transition :show="showPreview && hasContent">
                <div
                    class="bg-gray-300/60 dark:bg-gray-800/60 h-20 rounded flex-1 p-2 overflow-scroll thin-scrollbar"
                >
                    <pre>{{ contentPreview }}</pre>
                </div>
            </n-collapse-transition>
        </div>
        <div
            v-if="page === 'index'"
            class="flex-1 shrink-0 overflow-y-auto thin-scrollbar animate-fade-up animate-once animate-duration-500 animate-ease-out"
        >
            <div
                v-for="(menu, index) in menus"
                :id="menu.key"
                :key="menu.key"
                :class="[
                    'flex flex-row gap-1 justify-start items-center p-2 hover:cursor-pointer hover:bg-gray-500/10  relative',
                    { 'bg-gray-500/10 dark:bg-gray-500/10': focusOn === index },
                ]"
                @click="executeMenu(menu.key)"
            >
                <div class="text-gray-900 dark:text-gray-200 mx-3">
                    <component
                        :is="menu.icon"
                        class="size-6 inline align-sub"
                    />
                </div>
                <div class="flex flex-col">
                    <div class="text-gray-900 dark:text-gray-200">
                        {{ menu.label }}
                    </div>
                    <div
                        class="text-gray-500 text-xs line-clamp-1 overflow-ellipsis"
                    >
                        {{ menu.description }}
                    </div>
                </div>
                <div v-if="menu.isSub" class="absolute top-half right-2">
                    <SolarAltArrowRightLineDuotone class="w-4 h-4" />
                </div>
            </div>
        </div>
        <div
            v-else-if="page === 'calc'"
            class="flex-1 overflow-y-auto thin-scrollbar p-3 animate-fade-up animate-once animate-duration-500 animate-ease-out"
        >
            <div class="text-gray-900 dark:text-gray-200 text-lg font-bold mb-2">统计</div>
            <div class="text-gray-900 dark:text-gray-400 space-y-1 grid grid-cols-2 gap-x-2">
                <div>字符总数:</div>
                <div>{{ stats.totalChars }}</div>
                <div>非空字符总数:</div>
                <div>{{ stats.nonEmptyChars }}</div>
                <div>行数:</div>
                <div>{{ stats.totalLines }}</div>
                <div>非空行数:</div>
                <div>{{ stats.nonEmptyLines }}</div>
                <div>英文字母总数:</div>
                <div>{{ stats.totalLetters }}</div>
                <div>英语单词总数:</div>
                <div>{{ stats.totalWords }}</div>
                <div>非Ascii字符总数:</div>
                <div>{{ stats.nonAsciiChars }}</div>
                <div>数字总数:</div>
                <div>{{ stats.totalDigits }}</div>
                <div>标点符号总数:</div>
                <div>{{ stats.totalPunctuation }}</div>
                <div>空格总数:</div>
                <div>{{ stats.totalSpaces }}</div>
                <div>汉字总数:</div>
                <div>{{ stats.totalChineseChars }}</div>
                <div>大写字母总数:</div>
                <div>{{ stats.totalUppercase }}</div>
                <div>小写字母总数:</div>
                <div>{{ stats.totalLowercase }}</div>
                <div>最长行长度:</div>
                <div>{{ stats.longestLine }}</div>
            </div>
        </div>
        <div
            v-else-if="page === 'edit'"
            class="flex-1 animate-fade-up animate-once animate-duration-500 animate-ease-out"
        >
            <textarea
                v-model="content"
                v-focus
                class="size-full text-black dark:bg-gray-800 dark:text-gray-200 p-2 rounded resize-none thin-scrollbar edit-textarea"
            ></textarea>
        </div>
        <div
            v-else-if="
                page === 'tojson' ||
                page === 'askai' ||
                page === 'aicreate' ||
                page === 'snippets-ai'
            "
            class="flex-1 shrink-0 size-full flex flex-col animate-fade-up animate-once animate-duration-500 animate-ease-out"
        >
            <div>
                <n-input
                    v-if="page !== 'snippets-ai'"
                    :disabled="generating"
                    v-model:value="userPrompt"
                    type="text"
                    :placeholder="
                        page === 'tojson'
                            ? '想要怎么做？'
                            : page === 'askai'
                            ? '想要问什么？'
                            : '想要创作什么？'
                    "
                    class="h-10 block prompt-input"
                />
                <div v-else class="p-2 line-clamp-1 overflow-ellipsis">
                    {{ currentSnippet.name }}
                </div>
            </div>
            <n-button
                v-if="generating"
                strong
                secondary
                type="error"
                @click="abortTask"
            >
                停止
            </n-button>
            <n-button
                v-else-if="
                    page !== 'snippets-ai' && userPrompt?.trim().length > 0
                "
                strong
                secondary
                type="info"
                @click="
                    page === 'tojson'
                        ? startConvertToJson()
                        : page === 'askai'
                        ? startAskAI()
                        : startAICreate()
                "
            >
                生成
            </n-button>
            <template v-if="useMarkdownRender">
                <HijackedATag
                    asExternalLink
                    asTemplate
                    :html="marked.parse(asString(generatedContent)) || ''"
                    className="markdown-align flex-1 shrink-0 text-black dark:bg-gray-800 dark:text-gray-200 p-2 rounded thin-scrollbar overflow-y-auto"
                />
            </template>
            <template v-else>
                <textarea
                    :disabled="generating"
                    v-model="generatedContent"
                    class="flex-1 shrink-0 text-black dark:bg-gray-800 dark:text-gray-200 p-2 rounded resize-none thin-scrollbar"
                ></textarea>
            </template>
        </div>
        <div
            v-else-if="page === 'snippets'"
            class="flex-1 flex flex-col animate-fade-up animate-once animate-duration-500 animate-ease-out"
        >
            <div class="p-3">
                保存的AI查询片段
                <div class="float-end">
                    <n-button @click="gotoCreateSnippet">添加</n-button>
                </div>
            </div>
            <div v-if="config.snippets.length > 0">
                <div
                    v-for="(snippet, index) in config.snippets"
                    :id="snippet.id"
                    :key="snippet.id"
                    :class="[
                        'flex flex-col gap-1 justify-center p-2 hover:cursor-pointer hover:bg-gray-500/10 relative',
                        { 'bg-gray-500/10': focusOn === index },
                    ]"
                    @click="runSnippet(snippet)"
                >
                    <div class="dark:text-gray-200">
                        {{ snippet.name }}
                    </div>
                    <div
                        class="text-gray-500 text-xs line-clamp-1 overflow-ellipsis"
                    >
                        {{ snippet.prompt }}
                    </div>
                    <div class="absolute top-half right-2">
                        <n-button @click.stop="() => gotoEditSnippet(snippet)"
                            >编辑</n-button
                        >
                    </div>
                </div>
            </div>
            <div
                v-else
                class="size-full flex flex-col justify-center items-center gap-3"
            >
                <div class="text-xl">空空如也</div>
                <n-button @click="gotoCreateSnippet">添加一个</n-button>
            </div>
        </div>
        <div
            v-else-if="page === 'snippets-edit'"
            class="flex-1 overflow-y-auto thin-scrollbar flex flex-col gap-3 p-3 animate-fade-up animate-once animate-duration-500 animate-ease-out"
        >
            <div>
                编辑AI查询片段
                <div class="float-end flex flex-row gap-1">
                    <n-button
                        :disabled="!snippetFormOK"
                        type="error"
                        v-if="!currentSnippet.isNew"
                        @click="deleteSnippet"
                        >删除</n-button
                    >
                    <n-button :disabled="!snippetFormOK" @click="saveSnippet"
                        >保存</n-button
                    >
                </div>
            </div>
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
                    type="textarea"
                    placeholder="角色为System的提示词，通常用于描述AI角色"
                    v-model:value="currentSnippet.system"
                ></n-input>
            </div>
            <div>
                <span>用户提示词</span>
                <n-input
                    type="textarea"
                    placeholder="角色为User的提示词，通常用于描述任务"
                    v-model:value="currentSnippet.prompt"
                ></n-input>
            </div>
            <div class="flex flex-row justify-between">
                <div>使用 Markdown 输出</div>
                <div>
                    <n-switch v-model:value="currentSnippet.markdown" />
                </div>
            </div>
        </div>
        <div
            v-else-if="page === 'chat'"
            class="flex-1 overflow-y-auto thin-scrollbar flex flex-col gap-3 p-3 animate-fade-up animate-once animate-duration-500 animate-ease-out"
        >
            <AIChat :config="config" :content="content" />
        </div>
        <div
            v-else-if="page === 'urls'"
            class="flex-1 flex flex-col animate-fade-up animate-once animate-duration-500 animate-ease-out"
        >
            <div class="p-3">发现的链接</div>
            <div>
                <div
                    v-for="(url, index) in foundUrls"
                    :id="'url-' + index"
                    :key="index"
                    :class="[
                        'flex flex-col gap-1 justify-center p-2 hover:cursor-pointer hover:bg-gray-500/10 relative',
                        { 'bg-gray-500/10': focusOn === index },
                    ]"
                    @click="selectUrl(url)"
                >
                    <div class="text-gray-900 dark:text-gray-200 line-clamp-1">
                        {{ url.slice(0, 50) }}
                    </div>
                </div>
            </div>
        </div>
        <div
            v-else-if="page === 'urls-actions'"
            class="flex-1 flex flex-col animate-fade-up animate-once animate-duration-500 animate-ease-out"
        >
            <div class="p-3 w-full">
                <div>操作链接</div>
                <div class="line-clamp-1 text-ellipsis text-sm text-gray-500">
                    {{ selectedUrl }}
                </div>
            </div>
            <div>
                <div
                    v-for="(menu, index) in linkMenu"
                    :id="menu.key"
                    :key="menu.key"
                    :class="[
                        'flex flex-row gap-1 justify-start items-center p-2 hover:cursor-pointer hover:bg-gray-500/10 relative',
                        { 'bg-gray-500/10': focusOn === index },
                    ]"
                    @click="executeLinkMenu(menu.action)"
                >
                    <div class="text-gray-900 dark:text-gray-200 mx-3">
                        <component
                            :is="menu.icon"
                            class="size-6 inline align-sub"
                        />
                    </div>
                    <div class="flex flex-col">
                        <div class="text-gray-900 dark:text-gray-200">
                            {{ menu.label }}
                        </div>
                        <div
                            class="text-gray-500 text-xs line-clamp-1 overflow-ellipsis"
                        >
                            {{ menu.description }}
                        </div>
                    </div>
                    <div v-if="menu.isSub" class="absolute top-half right-2">
                        <SolarAltArrowRightLineDuotone class="w-4 h-4" />
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style>
html,
body {
    background: transparent !important;
    height: 476px;
    width: 400px;
    overflow: hidden;
}
</style>
