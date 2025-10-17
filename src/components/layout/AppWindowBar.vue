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
  position: absolute;
  inset: 0 0 auto 0;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  font-weight: 600;
  letter-spacing: 0.2px;
  color: var(--vibe-text-primary);
  -webkit-app-region: drag;
  background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.18) 0%,
      rgba(244, 249, 255, 0.12) 60%,
      rgba(255, 255, 255, 0) 100%
    );
  backdrop-filter: blur(20px);
  z-index: 12;
}

.window-title {
  font-size: 14px;
}

.window-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  -webkit-app-region: no-drag;
}

.window-button {
  width: 34px;
  height: 22px;
  border-radius: 6px;
  border: none;
  background: rgba(255, 255, 255, 0.35);
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background 0.2s ease;
  -webkit-app-region: no-drag;
}

.window-button span {
  width: 10px;
  height: 2px;
  background: rgba(23, 35, 61, 0.7);
  border-radius: 999px;
}

.window-button:hover {
  background: rgba(255, 255, 255, 0.55);
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

.window-button.close span::before {
  transform: rotate(45deg);
}

.window-button.close span::after {
  transform: rotate(-45deg);
}
</style>
