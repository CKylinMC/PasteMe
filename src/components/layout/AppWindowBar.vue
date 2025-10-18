<script setup lang="ts">
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { computed } from "vue";

const current = (() => {
  try {
    return getCurrentWebviewWindow();
  } catch (error) {
    console.warn("Tauri window API unavailable", error);
    return null;
  }
})();

const title = computed(() => "VibeClip Pro");

async function minimize() {
  try {
    await current?.minimize();
  } catch (error) {
    console.error("Failed to minimize window", error);
  }
}

async function close() {
  try {
    // Hide instead of destroy to keep tray shortcuts alive
    await current?.hide();
  } catch (error) {
    console.error("Failed to hide window", error);
  }
}
</script>

<template>
  <header class="window-bar" data-tauri-drag-region>
    <div class="window-title">{{ title }}</div>
    <div class="window-actions" data-tauri-drag-region="false">
      <button class="window-button" type="button" @click="minimize" aria-label="最小化">
        <span />
      </button>
      <button class="window-button close" type="button" @click="close" aria-label="关闭">
        <span />
      </button>
    </div>
  </header>
</template>

<style scoped>
.window-bar {
  width: 100%;
  min-height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 18px;
  font-weight: 600;
  letter-spacing: 0.2px;
  color: var(--vibe-text-primary);
  -webkit-app-region: drag;
  background: color-mix(in srgb, var(--vibe-panel-surface-strong) 90%, rgba(255, 255, 255, 0.18));
  border-radius: calc(var(--vibe-radius-xl) - 4px);
  border: 1px solid color-mix(in srgb, var(--vibe-panel-border) 52%, transparent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.36);
  backdrop-filter: blur(18px) saturate(135%);
}

.dark .window-bar {
  background: color-mix(in srgb, var(--vibe-panel-surface) 88%, rgba(16, 23, 47, 0.4));
  border-color: color-mix(in srgb, var(--vibe-panel-border) 65%, transparent);
  box-shadow: inset 0 1px 0 rgba(10, 18, 36, 0.6);
}

.window-title {
  font-size: 14px;
}

.window-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  -webkit-app-region: no-drag;
}

.window-button {
  width: 32px;
  height: 24px;
  border-radius: 8px;
  border: none;
  background: rgba(255, 255, 255, 0.28);
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background 0.2s ease;
  -webkit-app-region: no-drag;
}

.dark .window-button {
  background: rgba(18, 27, 48, 0.58);
}

.window-button span {
  width: 10px;
  height: 2px;
  background: rgba(23, 35, 61, 0.65);
  border-radius: 999px;
}

.dark .window-button span {
  background: rgba(236, 243, 255, 0.8);
}

.window-button:hover {
  background: rgba(255, 255, 255, 0.45);
}

.window-button.close:hover {
  background: rgba(255, 112, 112, 0.68);
}

.window-button.close span {
  position: relative;
  width: 10px;
  height: 10px;
}

.window-button.close span::before,
.window-button.close span::after {
  content: "";
  position: absolute;
  inset: 0;
  background: rgba(23, 35, 61, 0.75);
  width: 10px;
  height: 2px;
  border-radius: 999px;
}

.dark .window-button.close span::before,
.dark .window-button.close span::after {
  background: rgba(236, 243, 255, 0.85);
}

.window-button.close span::before {
  transform: rotate(45deg);
}

.window-button.close span::after {
  transform: rotate(-45deg);
}
</style>
