<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { useMessage } from "naive-ui";

interface NotificationPayload {
  type: "success" | "error" | "warning" | "info";
  message: string;
  duration?: number;
}

const message = useMessage();

function handleEvent(event: Event) {
  const detail = (event as CustomEvent<NotificationPayload>).detail;
  if (!detail) return;
  const { type, message: text, duration } = detail;
  switch (type) {
    case "success":
      message.success(text, { duration });
      break;
    case "warning":
      message.warning(text, { duration });
      break;
    case "info":
      message.info(text, { duration });
      break;
    default:
      message.error(text, { duration });
  }
}

onMounted(() => {
  window.addEventListener("vibeclip:notify", handleEvent as EventListener);
});

onBeforeUnmount(() => {
  window.removeEventListener("vibeclip:notify", handleEvent as EventListener);
});
</script>

<template>
  <slot />
</template>
