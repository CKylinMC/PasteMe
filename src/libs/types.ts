import type { Config } from "@/composables/useConfig"
import type { Component, MaybeRef } from "vue";

export type Panel = {
    title: string;
    component: Component;
    showHeader: boolean;
    showContent: boolean;
    showLoading: boolean;
}

export type Context = {
    config: MaybeRef<Config>;
    panel: Panel;
    content: {
        type: string;
        hasContent: boolean;
        text?: string;
        files?: string[];
        image?: Blob;
    }
    sharedData: {[key:string]: unknown};
    stack: Panel[];
}