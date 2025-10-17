import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type {
  AiActionRequest,
  AiActionResponse,
  ClipItem,
  ClipKind,
  ClipboardDraftPayload,
  HistoryExportPayload,
  HistoryFilter,
} from "@/types/history";
import { ClipKind as ClipKindEnum } from "@/types/history";
import { useSettingsStore } from "./settings";

const HISTORY_LIMIT = 200;

function normalizeClip(raw: any): ClipItem {
  const kindNumber = Number(raw.kind ?? ClipKindEnum.Text) as ClipKind;
  return {
    id: raw.id,
    kind: kindNumber,
    content: String(raw.content ?? ""),
    contentHash: raw.content_hash ?? raw.contentHash ?? "",
    preview: raw.preview ?? raw.extra ?? null,
    extra: raw.extra ?? null,
    isPinned: Boolean(raw.is_pinned ?? raw.isPinned),
    isFavorite: Boolean(raw.is_favorite ?? raw.isFavorite),
    createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updated_at ?? raw.updatedAt ?? new Date().toISOString(),
  };
}

function serializeClip(item: ClipItem) {
  return {
    id: item.id,
    kind: item.kind,
    content: item.content,
    content_hash: item.contentHash,
    preview: item.preview ?? null,
    extra: item.extra ?? null,
    is_pinned: item.isPinned,
    is_favorite: item.isFavorite,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

export const useHistoryStore = defineStore("history", () => {
  const items = ref<ClipItem[]>([]);
  const filter = ref<HistoryFilter>("all");
  const searchTerm = ref("");
  const isLoading = ref(false);
  const isExporting = ref(false);
  const listening = ref(true);
  const latest = ref<ClipItem | null>(null);
  const aiBusy = ref(false);
  const initialized = ref(false);
  const lastError = ref<string | null>(null);
  const hasMore = ref(false);
  const nextOffset = ref(0);
  let fetchTimer: number | null = null;
  let clipboardUnlisten: UnlistenFn | null = null;

  const settings = useSettingsStore();

  if (typeof window !== "undefined") {
    void ensureClipboardListener();
  }

  function raise(message: string, error: unknown): never {
    const reason =
      error instanceof Error ? error : new Error(String(error ?? message));
    console.error(message, reason);
    lastError.value = `${message}: ${reason.message}`;
    throw reason;
  }

  const filteredItems = computed(() => {
    const base = items.value.filter(item => {
      switch (filter.value) {
        case "pinned":
          return item.isPinned;
        case "favorites":
          return item.isFavorite;
        case "text":
          return item.kind === ClipKindEnum.Text;
        case "images":
          return item.kind === ClipKindEnum.Image;
        case "files":
          return item.kind === ClipKindEnum.File;
        default:
          return true;
      }
    });
    if (!searchTerm.value.trim()) {
      return base;
    }
    const q = searchTerm.value.trim().toLowerCase();
    return base.filter(item => {
      const preview = item.preview ?? "";
      return (
        item.content.toLowerCase().includes(q) ||
        preview.toLowerCase().includes(q) ||
        (item.extra ?? "").toLowerCase().includes(q)
      );
    });
  });

  function scheduleFetch() {
    if (fetchTimer) {
      window.clearTimeout(fetchTimer);
    }
    fetchTimer = window.setTimeout(() => {
      fetchTimer = null;
      nextOffset.value = 0;
      void refresh().catch(() => undefined);
    }, 280);
  }

  const effectiveLimit = computed(() => {
    const configured = settings.historyLimit || HISTORY_LIMIT;
    return Math.max(50, Math.min(configured, 500));
  });

  async function fetchPage(options: { append: boolean }) {
    isLoading.value = true;
    try {
      const payload = await invoke<ClipItem[]>("fetch_clips", {
        query: searchTerm.value.trim() || null,
        favoritesFirst: filter.value === "favorites" || filter.value === "pinned",
        limit: effectiveLimit.value,
        offset: options.append ? nextOffset.value : 0,
      });
      const batch = (payload || []).map(normalizeClip);
      if (options.append && items.value.length) {
        const existingIds = new Set(items.value.map(item => item.id));
        const merged = batch.filter(item => !existingIds.has(item.id));
        items.value = [...items.value, ...merged];
      } else {
        items.value = batch;
        nextOffset.value = 0;
      }
      if (items.value.length > 0) {
        latest.value = items.value[0];
      }
      hasMore.value = batch.length >= effectiveLimit.value;
      nextOffset.value = items.value.length;
    } catch (error) {
      raise("无法加载剪贴板历史", error);
    } finally {
      isLoading.value = false;
      initialized.value = true;
    }
  }

  async function refresh() {
    nextOffset.value = 0;
    await fetchPage({ append: false });
  }

  async function loadMore() {
    if (!hasMore.value || isLoading.value) {
      return;
    }
    await fetchPage({ append: true });
  }

  watch(
    () => settings.historyLimit,
    () => {
      nextOffset.value = 0;
      if (initialized.value) {
        void refresh();
      }
    }
  );

  async function ensureClipboardListener() {
    if (clipboardUnlisten) {
      return;
    }
    try {
      clipboardUnlisten = await listen<ClipItem>("clipboard://captured", event => {
        const clip = normalizeClip(event.payload);
        const limit = settings.historyLimit || HISTORY_LIMIT;
        items.value = [
          clip,
          ...items.value.filter(entry => entry.id !== clip.id),
        ].slice(0, limit);
        latest.value = clip;
      });
    } catch (error) {
      console.error("无法订阅剪贴板事件", error);
    }
  }

  async function syncStatus() {
    try {
      const status = await invoke<{ listening: boolean; offline: boolean }>(
        "get_app_status"
      );
      listening.value = status.listening;
      settings.setOfflineLocal(status.offline);
    } catch (error) {
      raise("无法同步应用状态", error);
    }
  }

  async function setListening(value: boolean) {
    try {
      await invoke("set_listening", { listening: value });
      listening.value = value;
    } catch (error) {
      raise("无法更新监听状态", error);
    }
  }

  async function insertClip(draft: ClipboardDraftPayload) {
    if (!listening.value) {
      return null;
    }
    try {
      const payload = await invoke<ClipItem>("insert_clip", { draft });
      const clip = normalizeClip(payload);
      const limit = settings.historyLimit || HISTORY_LIMIT;
      items.value = [clip, ...items.value].slice(0, limit);
      nextOffset.value = items.value.length;
      latest.value = clip;
      return clip;
    } catch (error) {
      raise("保存剪贴板内容失败", error);
    }
    return null;
  }

  async function updateFlags(id: number, data: { pinned?: boolean; favorite?: boolean }) {
    try {
      console.log('[History Store] Updating flags for id:', id, 'data:', data);

      await invoke("update_clip_flags", {
        id,
        pinned: data.pinned ?? null,
        favorite: data.favorite ?? null,
      });

      console.log('[History Store] Flags updated successfully, updating local state');

      items.value = items.value.map(item =>
        item.id === id
          ? {
            ...item,
            isPinned: data.pinned ?? item.isPinned,
            isFavorite: data.favorite ?? item.isFavorite,
          }
          : item
      );

      console.log('[History Store] Local state updated');
    } catch (error) {
      console.error('[History Store] Update flags error:', error);
      raise("更新剪贴板标记失败", error);
    }
  }

  async function removeClip(id: number) {
    try {
      await invoke("remove_clip", { id });
      items.value = items.value.filter(item => item.id !== id);
      nextOffset.value = items.value.length;
      if (items.value.length < effectiveLimit.value) {
        hasMore.value = false;
      }
    } catch (error) {
      raise("删除剪贴板记录失败", error);
    }
  }

  async function clearHistory() {
    try {
      await invoke("clear_history");
      items.value = [];
      latest.value = null;
      hasMore.value = false;
      nextOffset.value = 0;
    } catch (error) {
      raise("清空历史记录失败", error);
    }
  }

  async function exportHistory() {
    try {
      isExporting.value = true;
      const payload = await invoke<HistoryExportPayload>("export_history");
      const target = await save({
        title: "导出剪贴板历史",
        defaultPath: `vibeclip-pro-history-${new Date()
          .toISOString()
          .replace(/[:.]/g, "-")}.json`,
      });
      if (!target) return;
      await writeTextFile(target, JSON.stringify(payload, null, 2));
    } catch (error) {
      raise("导出历史记录失败", error);
    } finally {
      isExporting.value = false;
    }
  }

  async function importHistory() {
    try {
      const file = await open({
        title: "导入剪贴板历史",
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!file) return;
      const content = await readTextFile(file as string);
      const payload = JSON.parse(content) as HistoryExportPayload;
      const normalized = payload.items.map(serializeClip);
      await invoke("import_history", { items: normalized });
      await refresh();
    } catch (error) {
      raise("导入历史记录失败", error);
    }
  }

  async function runAiAction(request: AiActionRequest, options?: { persist?: boolean; copy?: boolean }) {
    if (settings.offlineMode) {
      throw new Error("离线模式下无法调用 AI 服务");
    }
    aiBusy.value = true;
    try {
      const response = await invoke<AiActionResponse>("perform_ai_action", { request });
      const persist = options?.persist ?? true;
      const copy = options?.copy ?? true;
      let persisted: ClipItem | null = null;
      if (persist) {
        persisted = await insertClip({
          kind: ClipKindEnum.Text,
          text: response.result,
          preview: response.result.slice(0, 96),
          extra: response.used_prompt,
        });
      }
      if (copy) {
        if (persisted) {
          await markSelfCapture({
            hash: persisted.contentHash,
            kind: persisted.kind,
            content: persisted.content,
          });
        } else {
          await markSelfCapture({
            kind: ClipKindEnum.Text,
            content: response.result,
          });
        }
        await writeText(response.result);
      }
      return response;
    } catch (error) {
      raise("AI 操作失败", error);
    } finally {
      aiBusy.value = false;
    }
  }

  async function copyClip(item: ClipItem) {
    try {
      if (item.kind === ClipKindEnum.Text || item.kind === ClipKindEnum.File) {
        await markSelfCapture({
          hash: item.contentHash,
          kind: item.kind,
          content: item.content,
        });
        await writeText(item.content);
      } else if (item.kind === ClipKindEnum.Image) {
        const placeholder = "[Image copied]";
        await markSelfCapture({
          kind: ClipKindEnum.Text,
          content: placeholder,
        });
        await writeText(placeholder);
      }
    } catch (error) {
      raise("复制到系统剪贴板失败", error);
    }
  }

  async function captureText(text: string, options?: Partial<ClipboardDraftPayload>) {
    try {
      const clip = await insertClip({
        kind: ClipKindEnum.Text,
        text,
        preview: text.slice(0, 120),
        ...options,
      });
      await markSelfCapture({
        hash: clip?.contentHash ?? null,
        kind: ClipKindEnum.Text,
        content: text,
      });
      await writeText(text);
    } catch (error) {
      raise("保存文本失败", error);
    }
  }

  async function markSelfCapture(options: {
    hash?: string | null;
    kind?: ClipKind;
    content?: string | null;
  }) {
    try {
      await invoke("ignore_next_clipboard_capture", {
        hash: options.hash ?? null,
        kind:
          typeof options.kind === "number"
            ? (options.kind as number)
            : options.kind !== undefined
              ? Number(options.kind)
              : null,
        content: options.content ?? null,
      });
    } catch (error) {
      console.warn("无法标记应用复制来源", error);
    }
  }

  return {
    items,
    filter,
    searchTerm,
    filteredItems,
    isLoading,
    isExporting,
    listening,
    latest,
    aiBusy,
    initialized,
    lastError,
    hasMore,
    refresh,
    loadMore,
    scheduleFetch,
    ensureClipboardListener,
    setListening,
    syncStatus,
    insertClip,
    updateFlags,
    removeClip,
    clearHistory,
    exportHistory,
    importHistory,
    runAiAction,
    copyClip,
    captureText,
    markSelfCapture,
  };
});
