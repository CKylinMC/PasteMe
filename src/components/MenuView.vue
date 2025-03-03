<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

export type Menu = {
    key: string;
    label: string;
    description: string;
    action: () => void;
    isSub?: boolean;
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    icon: any;
};

const props = defineProps<{
    menus: Menu[];
}>();

const focusOn = ref(0);

const execute = (menu: Menu) => {
    menu.action();
};

// 扩展原有的listenKeydown函数
function listenKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowUp') {
        if (focusOn.value < 0) {
            focusOn.value = props.menus.length - 1;
        } else {
            focusOn.value =
                (focusOn.value - 1 + props.menus.length) % props.menus.length;
        }
        document
            .querySelector(`#${props.menus[focusOn.value].key}`)
            ?.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
            });
    }
    if (e.key === 'ArrowDown') {
        if (focusOn.value < 0) {
            focusOn.value = 0;
        } else {
            focusOn.value = (focusOn.value + 1) % props.menus.length;
        }
        document
            .querySelector(`#${props.menus[focusOn.value].key}`)
            ?.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
            });
    }
    if (e.key === 'Enter' && focusOn.value >= 0) {
        const menu = props.menus[focusOn.value];
        if (menu) {
            execute(menu);
        }
    }
}

onMounted(() => {
    window.addEventListener('keydown', listenKeydown);
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', listenKeydown);
});
</script>

<template>
    <div
        v-for="(menu, index) in menus"
        :id="menu.key"
        :key="menu.key"
        :class="[
            'flex flex-row gap-1 justify-start items-center p-2 hover:cursor-pointer hover:bg-gray-500/10  relative',
            { 'bg-gray-500/10 dark:bg-gray-500/10': focusOn === index },
        ]"
        @click="execute(menu)"
    >
        <slot
            name="menu"
            :menu="menu"
            :menus="menus"
            :index="index"
            :isFocus="focusOn === index"
        >
            <div class="text-gray-900 dark:text-gray-200 mx-3">
                <component :is="menu.icon" class="size-6 inline align-sub" />
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
        </slot>
    </div>
</template>
