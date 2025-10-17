<script setup lang="ts">
import { RouterView } from "vue-router";
import { computed, onMounted } from "vue";
import { darkTheme, dateZhCN, zhCN } from "naive-ui";
import { useSettingsStore } from "./store/settings";
import AppEventBridge from "@/components/system/AppEventBridge.vue";
import AppWindowBar from "@/components/layout/AppWindowBar.vue";

const settings = useSettingsStore();

onMounted(() => {
  void settings.bootstrap();
});

const theme = computed(() => {
  if (settings.themeMode === "system") {
    return settings.isDarkPreferred ? darkTheme : null;
  }
  return settings.themeMode === "dark" ? darkTheme : null;
});

const themeOverrides = computed(() => settings.naiveThemeOverrides);
</script>

<template>
  <n-config-provider
    :locale="zhCN"
    :date-locale="dateZhCN"
    :theme="theme"
    :theme-overrides="themeOverrides"
  >
    <n-loading-bar-provider>
      <n-dialog-provider>
        <n-message-provider placement="bottom-right" :duration="2500">
          <AppEventBridge>
            <div class="app-shell" :class="settings.themeClass">
              <AppWindowBar />
              <div class="app-content">
                <RouterView v-slot="{ Component }">
                  <Transition name="fade" mode="out-in">
                    <component :is="Component" />
                  </Transition>
                </RouterView>
              </div>
            </div>
          </AppEventBridge>
        </n-message-provider>
      </n-dialog-provider>
    </n-loading-bar-provider>
  </n-config-provider>
</template>
