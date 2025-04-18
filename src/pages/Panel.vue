<script setup lang="ts">
import Toast from '@/components/utils/Toast.vue';
import { useConfig } from '@/composables/useConfig';
import { usePanelWindow } from '@/composables/usePanelWindow';
import { Context, createContext } from '@/libs/types';
import { onMounted, provide, ref } from 'vue';

const { config, loadConfig } = useConfig();

const { mouseInRange, setupWindowListeners } = usePanelWindow();

const toast = ref();

const context = ref<Context>(createContext());

const cancelSideEffects = async () => {
    if(context.value.effects) {
        for (const effect of context.value.effects) {
            try {
                
            await effect();
            }
            catch (e) {
                console.error(e);
            }
        }
    }
}

onMounted(() => {
    setupWindowListeners({
        async onShow() {
            context.value = createContext();
            //TODO: init context and setup subrouter
        },
        async onHide() {
            await cancelSideEffects();
        },
    })
})

</script>

<template>
    <div
        class="panelroot flex flex-col size-full select-none bg-white/95 dark:bg-transparent dark:text-white"
        @mouseover="mouseInRange = true"
        @mouseleave="mouseInRange = false"
    >
        <div
            class="bg-neutral-500/10 dark:bg-black p-2"
            :class="[context.content.show ? 'h-[120px]' : 'h-[32px]']"
        >
            <div
                data-tauri-drag-region
                class="text-gray-800 dark:text-gray-400 h-6 relative"
            >
                <div
                    data-tauri-drag-region
                    class="cursor-move absolute top-1 left-1/2 -translate-x-1/2 w-10 h-2 rounded-lg bg-neutral-500 dark:bg-white/40"
                ></div>
                <span>{{ context.title }}</span>
            </div>
            <n-collapse-transition :show="context.content.show">
                <div
                    class="bg-gray-300/60 dark:bg-gray-800/60 h-20 rounded flex-1 p-2 overflow-scroll thin-scrollbar"
                >
                    <pre>{{ context.content.text || '无内容' }}</pre>
                </div>
            </n-collapse-transition>
        </div>
        <Toast ref="toast" />
    </div>
</template>