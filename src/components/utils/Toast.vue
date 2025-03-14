<script setup lang="ts">
import { ref } from 'vue';

const currentTask = ref<{
    timeout?: number;
    text: string;
    show: boolean;
}>({
    timeout: undefined,
    text: '',
    show: false,
});

function sendToast(text: string, duration = 3000) {
    if (currentTask.value.timeout) {
        clearTimeout(currentTask.value.timeout);
    }
    currentTask.value.text = text;
    currentTask.value.show = true;
    currentTask.value.timeout = setTimeout(() => {
        currentTask.value.show = false;
    }, duration);
}

export type Toast = {
    sendToast: (text: string, duration?: number) => void;
};

defineExpose({
    sendToast,
});
</script>
<template>
    <div
        :class="[
            'absolute transition-all left-0 -bottom-12 h-12 w-full bg-neutral-200 text-black dark:bg-neutral-700 dark:text-white',
            currentTask.show ? 'bottom-0' : '',
        ]"
    >
        <div class="size-full my-2 mx-2">{{ currentTask.text }}</div>
    </div>
</template>
