<script setup lang="ts">
import type { ContextMenuItem } from '@/composables/useContextMenu';

interface Props {
  show: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
}

interface Emits {
  (e: 'select', key: string): void;
  (e: 'close'): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();

function handleSelect(item: ContextMenuItem) {
  if (item.disabled || item.divider) return;
  emit('select', item.key);
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close');
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="context-menu-fade">
      <div v-if="show" class="context-menu-container" @keydown="handleKeydown">
        <div class="context-menu" :style="{ left: `${x}px`, top: `${y}px` }">
          <template v-for="item in items" :key="item.key">
            <div v-if="item.divider" class="context-menu-divider" />
            <button
              v-else
              type="button"
              class="context-menu-item"
              :class="{ danger: item.danger, disabled: item.disabled }"
              :disabled="item.disabled"
              @click="handleSelect(item)"
            >
              <n-icon v-if="item.icon" :component="item.icon" size="16" />
              <span>{{ item.label }}</span>
            </button>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.context-menu-container {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2000;
}

.context-menu {
  position: absolute;
  pointer-events: auto;
  min-width: 200px;
  max-width: 280px;
  background: rgba(255, 255, 255, 0.96);
  border-radius: 16px;
  padding: 8px;
  box-shadow: 0 20px 48px rgba(18, 37, 68, 0.28), 0 0 0 1px rgba(18, 37, 68, 0.08);
  backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.dark .context-menu {
  background: rgba(18, 24, 42, 0.96);
  box-shadow: 0 20px 48px rgba(6, 12, 26, 0.7), 0 0 0 1px rgba(122, 209, 245, 0.12);
  border: 1px solid rgba(122, 209, 245, 0.1);
}

.context-menu-item {
  width: 100%;
  border: none;
  border-radius: 10px;
  padding: 10px 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--vibe-text-primary);
  transition: background 0.15s ease, transform 0.15s ease;
  text-align: left;
}

.context-menu-item:hover:not(:disabled) {
  background: rgba(81, 97, 255, 0.12);
  transform: translateX(2px);
}

.context-menu-item.danger:hover:not(:disabled) {
  background: rgba(255, 99, 99, 0.18);
  color: #ff6363;
}

.context-menu-item:active:not(:disabled) {
  transform: translateX(0);
}

.context-menu-item.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.context-menu-item span {
  flex: 1;
}

.context-menu-divider {
  height: 1px;
  margin: 6px 10px;
  background: var(--vibe-panel-border);
  opacity: 0.6;
}

.context-menu-fade-enter-active,
.context-menu-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.context-menu-fade-enter-from {
  opacity: 0;
  transform: scale(0.95) translateY(-4px);
}

.context-menu-fade-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .context-menu-item,
  .context-menu-fade-enter-active,
  .context-menu-fade-leave-active {
    transition-duration: 0.01ms !important;
    transform: none !important;
  }
}
</style>

