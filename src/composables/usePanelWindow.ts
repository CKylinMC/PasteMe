import { ref } from 'vue';
import { window as appWindow } from '@tauri-apps/api';
import type { useClipboard } from './useClipboard';

export type PanelPage = 'index' | 'calc' | 'edit' | 'tojson' | 'askai' | 'snippets' | 'snippets-ai' | 'snippets-edit' | 'chat' | 'urls' | 'urls-actions';

export function usePanelWindow(clipboard: ReturnType<typeof useClipboard>) {
    const page = ref<PanelPage>('index');
    const showPreview = ref(true);
    const mouseInRange = ref(false);

    const gotoPage = (targetPage: PanelPage, onPageChange?: (page: PanelPage) => void) => {
        page.value = targetPage;
        showPreview.value = targetPage === 'index' ||
            ['tojson', 'askai', 'snippets-ai'].includes(targetPage);
        onPageChange?.(targetPage);
    };

    const setupWindowListeners = async (onHide: () => void, loadConfig?: ()=>Promise<void>) => {
        const isBlured = ref(true);
        const listeners = await Promise.all([
            appWindow.getCurrentWindow().listen('tauri://blur', event => {
                if (!mouseInRange.value) {
                    console.log('blur', event);
                    isBlured.value = true;
                    onHide();
                }
            }),
            appWindow.getCurrentWindow().listen('tauri://focus', async () => {
                if (isBlured.value) {
                    showPreview.value = true;
                    page.value = 'index';
                    await Promise.all([
                        loadConfig?.(),
                        clipboard.refresh()
                    ]);
                    isBlured.value = false;
                }
            })
        ]);

        return () => {
            for (const unlisten of listeners) {
                unlisten();
            }
        };
    };

    return {
        page,
        showPreview,
        mouseInRange,
        gotoPage,
        setupWindowListeners
    };
}
