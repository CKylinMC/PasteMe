import { reactive, ref, watch, nextTick, onBeforeUnmount, type Component } from 'vue';

export interface ContextMenuItem {
    key: string;
    label: string;
    icon?: Component;
    danger?: boolean;
    disabled?: boolean;
    divider?: boolean;
}

export type ContextMenuType = 'clipboard' | 'history-item' | 'ai-result' | 'ai-message' | 'quick-action' | 'general';

export interface ContextMenuContext<T = any> {
    type: ContextMenuType;
    data: T;
    position: { x: number; y: number };
}

export interface ContextMenuState {
    show: boolean;
    x: number;
    y: number;
    renderX: number;
    renderY: number;
    items: ContextMenuItem[];
    context: ContextMenuContext | null;
}

export function useContextMenu() {
    const menuRef = ref<HTMLElement | null>(null);
    const state = reactive<ContextMenuState>({
        show: false,
        x: 0,
        y: 0,
        renderX: 0,
        renderY: 0,
        items: [],
        context: null,
    });

    function adjustMenuPosition() {
        const menu = menuRef.value;
        if (!menu) return;
        const rect = menu.getBoundingClientRect();
        const { innerWidth, innerHeight } = window;
        let left = state.x;
        let top = state.y;

        if (left + rect.width > innerWidth - 8) {
            left = innerWidth - rect.width - 8;
        }
        if (top + rect.height > innerHeight - 8) {
            top = innerHeight - rect.height - 8;
        }

        state.renderX = Math.max(8, left);
        state.renderY = Math.max(8, top);
    }

    function showContextMenu<T = any>(
        event: MouseEvent,
        items: ContextMenuItem[],
        context: ContextMenuContext<T>
    ) {
        event.preventDefault();
        event.stopPropagation();

        state.items = items;
        state.context = context;
        state.x = event.clientX;
        state.y = event.clientY;
        state.show = true;

        nextTick(adjustMenuPosition);
    }

    function closeContextMenu() {
        state.show = false;
        state.items = [];
        state.context = null;
    }

    function handleOutside(event: PointerEvent) {
        if (!menuRef.value) return;
        if (!menuRef.value.contains(event.target as Node)) {
            closeContextMenu();
        }
    }

    watch(
        () => state.show,
        (value) => {
            if (value) {
                document.addEventListener('pointerdown', handleOutside, true);
                window.addEventListener('resize', closeContextMenu);
                nextTick(adjustMenuPosition);
            } else {
                document.removeEventListener('pointerdown', handleOutside, true);
                window.removeEventListener('resize', closeContextMenu);
            }
        }
    );

    onBeforeUnmount(() => {
        document.removeEventListener('pointerdown', handleOutside, true);
        window.removeEventListener('resize', closeContextMenu);
    });

    return {
        menuRef,
        state,
        showContextMenu,
        closeContextMenu,
        adjustMenuPosition,
    };
}

