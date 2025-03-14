<script setup lang="ts">
import Toast from '@/components/utils/Toast.vue';
import { useConfig } from '@/composables/useConfig';
import { createMainMenuPanel } from '@/libs/panel/mainmenu';
import type { Context, Panel } from '@/libs/types';
import { provide, ref } from 'vue';

const { config, loadConfig } = useConfig();

const toast = ref();

const mouseInRange = ref(false);

const context = ref<Context>({
    config,
    panel: createMainMenuPanel(),
    content: {
        type: '',
        hasContent: false,
    },
    sharedData: {},
    stack: [],
});

const naviBack = () => {
    if(context.value.stack.length > 0) {
        context.value.panel = context.value.stack.pop() ?? createMainMenuPanel();
    } else {
        context.value.panel = createMainMenuPanel();
    }
}

const openPanel = (panel: Panel) => {
    context.value.stack.push(context.value.panel);
    context.value.panel = panel;
}

const resetPanelState = () => {
    loadConfig();
    context.value.panel = createMainMenuPanel();
    context.value.stack = [];
    context.value.content = {
        type: '',
        hasContent: false,
    };
    context.value.sharedData = {};
}

export type Navigation = {
    openPanel: (panel: Panel) => void;
    naviBack: () => void;
    resetPanelState: () => void;
};

provide('context', context);
provide('config', config);
provide('navigation', { openPanel, naviBack, resetPanelState });
provide('toast', toast);

</script>

<template>
    <div
        class="panelroot flex flex-col size-full select-none bg-white/95 dark:bg-transparent dark:text-white"
        @mouseover="mouseInRange = true"
        @mouseleave="mouseInRange = false"
    >
        <div
            class="bg-neutral-500/10 dark:bg-black p-2"
            :class="[context.panel.showContent ? 'h-[120px]' : 'h-[32px]']"
        >
            <div
                data-tauri-drag-region
                class="text-gray-800 dark:text-gray-400 h-6 relative"
            >
                <div
                    data-tauri-drag-region
                    class="cursor-move absolute top-1 left-1/2 -translate-x-1/2 w-10 h-2 rounded-lg bg-neutral-500 dark:bg-white/40"
                ></div>
                <SolarAltArrowLeftLineDuotone
                    class="inline hover:bg-gray-500/30 animate-fade-right animate-once animate-duration-300 animate-ease-out"
                    @click="naviBack"
                    v-if="context.stack.length > 0"
                />
                <span>{{ context.panel.title }}</span>
                <LineMdLoadingTwotoneLoop
                    class="inline hover:bg-gray-500/90 float-end animate-fade-left animate-once animate-duration-300 animate-ease-out"
                    v-if="context.panel.showLoading"
                />
            </div>
            <n-collapse-transition :show="context.panel.showContent">
                <div
                    class="bg-gray-300/60 dark:bg-gray-800/60 h-20 rounded flex-1 p-2 overflow-scroll thin-scrollbar"
                >
                    <pre>{{ context.content.text || '无内容' }}</pre>
                </div>
            </n-collapse-transition>
        </div>
        <div class="flex-1 shrink-0 overflow-y-auto thin-scrollbar animate-fade-up animate-once animate-duration-500 animate-ease-out">
            <component :is="context.panel.component" />
        </div>
        <Toast ref="toast" />
    </div>
</template>