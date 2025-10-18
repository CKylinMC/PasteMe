import { ref, computed } from 'vue';
import { writeText, readText } from '@tauri-apps/plugin-clipboard-manager';
import { isTauriRuntime, safeInvoke } from '@/libs/tauri';
import { ClipKind } from '@/types/history';

export function useClipboard() {
    const content = ref<string>('');
    
    const contentPreview = computed(() => 
        content.value.length > 2000
            ? `${content.value.slice(0, 2000)}...(超过2000字符已截断)`
            : content.value
    );

    const refresh = async () => {
        if (isTauriRuntime()) {
            content.value = await readText();
            return;
        }
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
            content.value = await navigator.clipboard.readText();
        }
    };

    const update = async (text: string) => {
        try {
            if (isTauriRuntime()) {
                await safeInvoke('ignore_next_clipboard_capture', {
                    hash: null,
                    kind: ClipKind.Text,
                    content: text,
                });
                await writeText(text);
            } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
                await navigator.clipboard.writeText(text);
            }
        } catch (error) {
            console.warn('无法标记应用复制来源', error);
        }
        content.value = text;
    };

    const stats = computed(() => ({
        totalChars: content.value.length,
        nonEmptyChars: content.value.replace(/\s/g, '').length,
        totalLines: content.value.split('\n').length,
        nonEmptyLines: content.value.split('\n').filter(line => line.trim() !== '').length,
        totalLetters: (content.value.match(/[a-zA-Z]/g) || []).length,
        totalWords: (content.value.match(/\b\w+\b/g) || []).length,
        // biome-ignore lint/suspicious/noControlCharactersInRegex: <explanation>
        nonAsciiChars: (content.value.match(/[^\x00-\x7F]/g) || []).length,
        totalDigits: (content.value.match(/\d/g) || []).length,
        totalPunctuation: (content.value.match(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g) || []).length,
        totalSpaces: (content.value.match(/\s/g) || []).length,
        totalChineseChars: (content.value.match(/[\u4e00-\u9fa5]/g) || []).length,
        totalUppercase: (content.value.match(/[A-Z]/g) || []).length,
        totalLowercase: (content.value.match(/[a-z]/g) || []).length,
        longestLine: Math.max(...content.value.split('\n').map(line => line.length))
    }));

    return {
        content,
        contentPreview,
        stats,
        refresh,
        update
    };
}
