<script lang="ts" setup>
// snippet from my library, I will clean this up later

import { onBeforeUnmount, onMounted, ref } from 'vue';

const shortcut = defineModel<string>('shortcut');

const emit = defineEmits(['set']);

const props = defineProps({
    clicktip: {
        type: String,
        default: '未设置按键',
    },
    keytip: {
        type: String,
        default: '请按键...(ESC取消，退格清空)',
    },
    hovertip: {
        type: String,
        default: '点击设置按键',
    },
    edithovertip: {
        type: String,
        default: '按下ESC取消设置\n按下退格键清除设置\n按下其他按键记录',
    },
    newline: {
        type: Boolean,
        default: false,
    },
    upper: {
        type: Boolean,
        default: false,
    },
    blacklist: {
        type: Array,
        default: () => [],
    },
    blackgrouplist: {
        type: Array,
        default: () => [],
    },
    requireCtrlKey: {
        type: Boolean,
        default: false,
    },
    requireShiftKey: {
        type: Boolean,
        default: false,
    },
    requireAltKey: {
        type: Boolean,
        default: false,
    },
    requireMetaKey: {
        type: Boolean,
        default: false,
    },
    preventFnKeys: {
        type: Boolean,
        default: false,
    },
    preventSingleKey: {
        type: Boolean,
        default: false,
    },
    preventCtrlKey: {
        type: Boolean,
        default: false,
    },
    preventShiftKey: {
        type: Boolean,
        default: false,
    },
    preventAltKey: {
        type: Boolean,
        default: false,
    },
    preventMetaKey: {
        type: Boolean,
        default: false,
    },
});

const editMode = ref(false);
const currentKey = ref<string>('');

function handleKeyDown(e: KeyboardEvent) {
    if (editMode.value) {
        if (e.key === 'Escape') {
            editMode.value = false;
            e.preventDefault();
            return;
        }
        if (e.key === 'Backspace') {
            currentKey.value = '';
            editMode.value = false;
            shortcut.value = '';
            e.preventDefault();
            return;
        }
        if (props.preventFnKeys && /F\d+/.test(e.key)) {
            e.preventDefault();
            currentKey.value = '';
            return;
        }
        currentKey.value =
            `${
                (e.ctrlKey || props.requireCtrlKey) && !props.preventCtrlKey
                    ? 'CommandOrControl+'
                    : ''
            }${
                (e.shiftKey || props.requireShiftKey) && !props.preventShiftKey
                    ? 'Shift+'
                    : ''
            }${
                (e.altKey || props.requireAltKey) && !props.preventAltKey
                    ? 'Alt+'
                    : ''
            }${
                (e.metaKey || props.requireMetaKey) && props.preventMetaKey
                    ? 'Meta+'
                    : ''
            }` +
            `${
                e.key !== 'Control' &&
                e.key !== 'Shift' &&
                e.key !== 'Alt' &&
                e.key !== 'Meta'
                    ? props.upper
                        ? e.key.toUpperCase()
                        : e.key
                    : ''
            }`;
        if (currentKey.value.trim().endsWith('+'))
            currentKey.value = currentKey.value.trim().slice(0, -1);
        if (
            props.preventSingleKey &&
            !e.ctrlKey &&
            !props.requireCtrlKey &&
            !e.shiftKey &&
            !props.requireShiftKey &&
            !e.altKey &&
            !props.requireAltKey &&
            !e.metaKey &&
            !props.requireMetaKey
        ) {
            currentKey.value = '';
        }
        if (props.blackgrouplist.includes(currentKey.value))
            currentKey.value = '';
        if (props.blacklist.includes(e.key)) currentKey.value = '';
        e.preventDefault();
    }
}

function handleKeyUp(e: KeyboardEvent) {
    if (editMode.value) {
        e.preventDefault();
        shortcut.value = currentKey.value;
        emit('set', currentKey.value);
        editMode.value = false;
    }
}

function enterEditMode() {
    if (editMode.value) {
        editMode.value = false;
    } else {
        editMode.value = true;
        currentKey.value = '';
    }
}

onMounted(() => {
    currentKey.value = shortcut.value || '';
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
});
onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
});
</script>

<template>
    <div
        :title="editMode ? edithovertip : hovertip"
        role="none"
        class="keyBox"
        :class="{ editMode: editMode }"
        @click="enterEditMode"
    >
        <template v-if="editMode">
            <template v-if="currentKey === ''">{{ keytip }}</template>
            <template v-else>{{ currentKey?.replace('CommandOrControl','Ctrl') || keytip }}</template>
        </template>
        <template v-else>{{ shortcut?.replace('CommandOrControl','Ctrl') || clicktip }}</template>
    </div>
</template>

<style scoped>
.keyBox {
    padding: 2px 5px;
    border-radius: 5px;
    cursor: pointer;
    user-select: none;
    text-align: center;
    margin: 1px 5px;
    display: inline-block;
    transition: 0.3s;
    background: #b9b9b91a;
    color: black;
    border: 2px solid rgba(128, 128, 128, 0.116);
}
.dark .keyBox {
    background: #383838;
    color: white !important;
    border: 2px solid rgba(128, 128, 128, 0.116);
}
.keyBox:hover {
    background: rgba(97, 97, 97, 0.13);
    border: 2px solid rgba(128, 128, 128, 0.216);
}
.dark .keyBox:hover {
    background: rgb(104, 104, 104);
    border: 2px solid rgba(128, 128, 128, 0.216);
}
.keyBox.editMode {
    border: 2px solid #18a058;
    animation: blink 1.5s infinite;
}
.dark .keyBox.editMode:hover {
    background: rgb(126, 126, 126);
    border: 2px solid #18a058;
}
@keyframes blink {
    0%, 100% {
        border: 2px solid #18a058;
    }
    50% {
        border: 2px solid rgba(19, 151, 245, 0);
    }
}
</style>
