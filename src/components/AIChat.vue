<script setup lang="ts">
import {
    useAIChat,
    useAIImage,
    useAITools,
    useAIWebCrawler,
    useAIWebSearch,
} from '@/composables/useAI';
import { useConfig, type Config } from '@/composables/useConfig';
import { computed, onMounted, ref, unref } from 'vue';
import SolarPlainLineDuotone from '~icons/solar/plain-line-duotone';
import SolarStopLineDuotone from '~icons/solar/stop-line-duotone';
import SolarUserCircleLineDuotone from '~icons/solar/user-circle-line-duotone';
import SolarBoltCircleLineDuotone from '~icons/solar/bolt-circle-line-duotone';
import LineMdLoadingTwotoneLoop from '~icons/line-md/loading-twotone-loop';
import SolarCopyLineDuotone from '~icons/solar/copy-line-duotone';
import SolarTrashBin2LineDuotone from '~icons/solar/trash-bin-2-line-duotone';
import SolarAddCircleLineDuotone from '~icons/solar/add-circle-line-duotone';
import { marked } from 'marked';
import { asString } from '@/libs/utils';
import type { Tool } from 'ai';
import { useClipboard } from '@/composables/useClipboard';
import HijackedATag from './utils/HijackedATag.vue';

const props = defineProps<{
    content: string;
    config: Config;
}>();

const { saveChatHistory, getChatHistory } = useConfig();

const { update } = useClipboard();

const mutableConfig = computed(() => props.config);

const container = ref<HTMLElement | undefined>();
const input = ref('');

const { messages, stop, generating, fetchAIResponse, appendToMessages } =
    useAIChat(mutableConfig);

const { createImageTool, status: imageGenerationStatus } =
    useAIImage(mutableConfig);
const usingImageGeneration = computed(
    () => imageGenerationStatus.value === 'generating'
);

const { getCurrentDateTime } = useAITools();

const { webSearchTool, searching: usingWebSearch } =
    useAIWebSearch(mutableConfig);

const { webCrawlTool, crawling: usingWebCrawler } =
    useAIWebCrawler(mutableConfig);

const usingTools = computed(
    () =>
        usingWebSearch.value ||
        usingWebCrawler.value ||
        usingImageGeneration.value
);

const inputPlaceholder = computed(() => {
    if (generating.value) {
        if (usingTools.value) {
            if (usingWebSearch) return '正在联网搜索...';
            if (usingWebCrawler) return '正在获取网页信息...';
            if (usingImageGeneration) return '正在生成图片...';
            return 'AI 正在使用工具...';
        }
        return 'AI 正在回答...';
    }
    return '输入你的问题';
});

function scrollToBottom() {
    container.value?.scrollTo({
        top: container.value.scrollHeight,
        behavior: 'smooth',
    });
}

function handleSubmit() {
    appendToMessages(input.value, 'user');
    input.value = '';
    const tools: { [key: string]: Tool } = {
        dateTime: getCurrentDateTime(),
    };
    if (props.config.ai.enableImage) {
        tools.createImage = createImageTool();
    }
    if (props.config.ai.enableWebsearch) {
        tools.webSearch = webSearchTool();
    }
    if (props.config.ai.enableWebCrawl) {
        tools.webCrawl = webCrawlTool();
    }

    scrollToBottom();
    fetchAIResponse(
        scrollToBottom,
        props.config.ai.disableTools ? undefined : tools
    ).then(saveSession);
}

function copy(str: string) {
    return update(str);
}

function removeMessageByIndex(idx: number) {
    messages.value.splice(idx, 1);
}

const showNewChatButton = computed(
    () => !generating.value && input.value === ''
);

function newSession() {
    messages.value = [];
    appendToMessages(
        `你的任务是分析用户的剪贴板数据。使用用户的指令和剪贴板内容回答问题。你可以利用Markdown格式进行回复，这样结果可以带有格式地展现在用户面前。\n剪贴板内容:\n${props.content}`,
        'system'
    );
    appendToMessages('你好，针对复制的内容，你有什么想要问的吗？', 'assistant');
}

function saveSession() {
    if (props.config.ai.persistChatHistory)
        return saveChatHistory(unref(messages));
}

async function loadSession() {
    if (!props.config.ai.persistChatHistory) return newSession();
    const history = await getChatHistory();
    if (history && history.length > 0) {
        messages.value = history;
    } else {
        newSession();
    }
}

onMounted(() => {
    loadSession();
});
</script>

<template>
    <div class="size-full flex flex-col">
        <div class="font-bold">基于剪贴板内容对话</div>
        <div
            ref="container"
            class="flex-1 flex flex-col gap-2 overflow-y-scroll thin-scrollbar my-2"
        >
            <template v-for="(message, index) in messages" :key="index">
                <template v-if="message.role === 'assistant'">
                    <div class="flex flex-row gap-1 group">
                        <div>
                            <SolarBoltCircleLineDuotone class="size-8" />
                        </div>
                        <div class="flex flex-col gap-1">
                            <div class="bg-white text-black p-2 rounded-lg">
                                <HijackedATag asExternalLink asTemplate
                                    className="markdown-align"
                                    :html="
                                        marked.parse(asString(message.content))
                                    "
                                />
                                <LineMdLoadingTwotoneLoop
                                    v-if="
                                        index === messages.length - 1 &&
                                        generating
                                    "
                                    class="size-3 inline"
                                />
                            </div>
                            <div
                                class="flex flex-row gap-1 opacity-0 group-hover:opacity-100"
                                v-if="
                                    !(
                                        index === messages.length - 1 &&
                                        generating
                                    )
                                "
                            >
                                <div
                                    class="cursor-pointer"
                                    @click="
                                        () => copy(asString(message.content))
                                    "
                                >
                                    <SolarCopyLineDuotone
                                        class="inline size-4 text-gray-400 hover:text-gray-50 active:text-cyan-300"
                                    />
                                </div>
                                <div
                                    class="cursor-pointer"
                                    @click="() => removeMessageByIndex(index)"
                                >
                                    <SolarTrashBin2LineDuotone
                                        class="inline size-4 text-gray-400 hover:text-gray-50"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </template>
                <template v-else-if="message.role === 'user'">
                    <div class="flex flex-row justify-end gap-1 group">
                        <div class="flex flex-col gap-1">
                            <div class="bg-blue-200 text-black p-2 rounded-lg">
                                {{ message.content }}
                            </div>
                            <div
                                class="flex flex-row gap-1 opacity-0 group-hover:opacity-100"
                                v-if="
                                    !(
                                        index === messages.length - 1 &&
                                        generating
                                    )
                                "
                            >
                                <div
                                    class="cursor-pointer"
                                    @click="
                                        () => copy(asString(message.content))
                                    "
                                >
                                    <SolarCopyLineDuotone
                                        class="inline size-4 text-gray-400 hover:text-gray-50 active:text-cyan-300"
                                    />
                                </div>
                                <div
                                    class="cursor-pointer"
                                    @click="() => removeMessageByIndex(index)"
                                >
                                    <SolarTrashBin2LineDuotone
                                        class="inline size-4 text-gray-400 hover:text-gray-50"
                                    />
                                </div>
                            </div>
                        </div>
                        <div>
                            <SolarUserCircleLineDuotone class="size-8" />
                        </div>
                    </div>
                </template>
            </template>
        </div>
        <div class="h-10">
            <form class="flex flex-row gap-1" @submit="handleSubmit">
                <n-button
                    v-if="showNewChatButton"
                    @click="newSession"
                    type="success"
                >
                    <SolarAddCircleLineDuotone />
                </n-button>
                <n-input
                    v-model:value="input"
                    :placeholder="inputPlaceholder"
                    class="w-full"
                    :disabled="generating"
                />
                <n-button
                    v-if="!generating"
                    type="info"
                    @click="handleSubmit"
                    :loading="generating"
                    attr-type="submit"
                >
                    <SolarPlainLineDuotone />
                </n-button>
                <n-button v-else-if="generating" type="error" @click="stop">
                    <SolarStopLineDuotone />
                </n-button>
            </form>
        </div>
    </div>
</template>
