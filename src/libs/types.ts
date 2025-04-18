import type { Config } from "@/composables/useConfig"
import type { MaybeRef } from "vue";

export type Action = {
    icon: any,
    tip: string,
    action: () => Promise<void> | void,
};

export type Functions = {
    hide: () => Promise<void> | void;
    show: () => Promise<void> | void;
    reloadConfig: () => Promise<void> | void;
    setTitle: (title: string) => Promise<void> | void;
    setStatus: (status: 'idle' | 'loading' | 'error') => Promise<void> | void;
    setActions: (actions?: Action[]) => Promise<void> | void;
    addAction: (action: Action) => Promise<void> | void;
    setData: (key: string, value: unknown) => Promise<void> | void;
    getData: <T>(key: string) => Promise<T> | void;
    setTextContent: (text: string) => Promise<void> | void;
    setFileContent: (files: string[]) => Promise<void> | void;
    setImageContent: (image: Blob) => Promise<void> | void;
}

export type SideEffectFunction = () => Promise<void> | void;

export type Context = {
    config: MaybeRef<Config>;
    title: string;
    content: {
        show: boolean;
        type: 'text'|'file'|'image';
        isEmpty: boolean;
        text?: string;
        files?: string[];
        image?: Blob;
    }
    status: {
        type: 'idle' | 'loading' | 'error';
    }
    actions: Action[];
    sharedData: { [key: string]: unknown };
    do?: Functions;
    effects: SideEffectFunction[];
}

export function createContext() {
    return {
        config: {} as MaybeRef<Config>,
        title: '',
        content: {
            show: false,
            type: 'text',
            isEmpty: true,
            text: undefined,
            files: undefined,
            image: undefined,
        },
        status: {
            type: 'idle',
        },
        actions: [],
        sharedData: {},
        effects: [],
    } as Context;
}
