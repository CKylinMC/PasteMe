import { ref, computed } from 'vue';
import { writeText, readText } from '@tauri-apps/plugin-clipboard-manager';
import { invoke } from '@tauri-apps/api/core';
import { ClipKind } from '@/types/history';

export function useClipboard() {
    const content = ref<string>('');
    
    const contentPreview = computed(() => 
        content.value.length > 2000
            ? `${content.value.slice(0, 2000)}...(超过2000字符已截断)`
            : content.value
    );

    const refresh = async () => {
        content.value = await readText();
    };

    const update = async (text: string) => {
        try {
            await invoke('ignore_next_clipboard_capture', {
                hash: null,
                kind: ClipKind.Text,
                content: text,
            });
        } catch (error) {
            console.warn('无法标记应用复制来源', error);
        }
        await writeText(text);
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
