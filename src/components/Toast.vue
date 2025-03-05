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

defineExpose({
    sendToast,
});

</script>
<template>
    <div :class="['absolute transition-all left-0 -bottom-10 w-full h-10 bg-neutral-200 text-black dark:bg-neutral-700 dark:text-white p-2', currentTask.show?'bottom-0':'']">{{currentTask.text}}</div>
</template>