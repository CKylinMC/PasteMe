import { defineStore } from "pinia";
import { ref } from "vue";
import type { ClipKind } from "@/types/history";

type BridgeMode = "assistant" | "actions";

export interface ClipboardBridgePayload {
  kind: ClipKind;
  content: string;
  extra?: string | null;
  title?: string;
  mode?: BridgeMode;
}

export const useBridgeStore = defineStore("bridge", () => {
  const clipboardSeed = ref<ClipboardBridgePayload | null>(null);

  function stageClipboardSeed(payload: ClipboardBridgePayload) {
    clipboardSeed.value = { ...payload };
  }

  function consumeClipboardSeed(): ClipboardBridgePayload | null {
    const payload = clipboardSeed.value;
    clipboardSeed.value = null;
    return payload;
  }

  return {
    clipboardSeed,
    stageClipboardSeed,
    consumeClipboardSeed,
  };
});
