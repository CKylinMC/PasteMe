<script setup lang="ts">
import { computed, inject } from 'vue';
import MenuView, { type Menu } from '@/components/utils/MenuView.vue';
import type { Config } from '@/composables/useConfig';
import type { Context } from '@/libs/types';
import type { Navigation } from '@/pages/Panel.vue';
import type { Toast } from '../utils/Toast.vue';

// inject('context', 'navigation', 'toast', 'config');
const context = inject<Context>('context');
const toast = inject<Toast>('toast');
const config = inject<Config>('config');
const navigation = inject<Navigation>('navigation');

const menus = computed<Menu[]>(()=>{
    return [];
});

</script>

<template><MenuView :menus="menus" /></template>