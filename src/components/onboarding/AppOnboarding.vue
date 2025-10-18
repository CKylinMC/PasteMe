<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useLocale } from "@/composables/useLocale";

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (event: "complete"): void;
  (event: "skip"): void;
  (event: "remind"): void;
}>();

const { t } = useLocale();

const stepBlueprints = {
  capture: {
    icon: "⎋",
    accent: "linear-gradient(135deg, rgba(81, 97, 255, 0.28), rgba(134, 65, 255, 0.45))",
    fallbackTitle: "实时捕获每一次复制",
    fallbackDescription: "剪贴板内容自动归档，文本、图片与文件路径均可一键保存。",
    fallbackBullets: [
      "系统监听与防重复，连续复制不丢失",
      "图片自动生成缩略图，文件路径保留来源",
      "随时跳转 AI 助理，继续追问或生成方案",
    ],
  },
  ai: {
    icon: "✨",
    accent: "linear-gradient(135deg, rgba(255, 168, 76, 0.32), rgba(255, 111, 92, 0.45))",
    fallbackTitle: "AI 快捷键秒变生产力",
    fallbackDescription: "翻译、摘要、润色、OCR 等动作一键完成，也可用自定义 Prompt。",
    fallbackBullets: [
      "剪贴板文本自动填充，输入框支持继续编辑",
      "动作支持多语言，默认使用首选输出",
      "结果可保存回历史或复制分享",
    ],
  },
  personalize: {
    icon: "🪄",
    accent: "linear-gradient(135deg, rgba(63, 195, 161, 0.3), rgba(79, 107, 255, 0.32))",
    fallbackTitle: "主题、快捷键与工作流随心定制",
    fallbackDescription: "切换主题预设、调整快捷键，或在设置中重新打开本教程。",
    fallbackBullets: [
      "主题预设与强调色实时预览",
      "全局快捷键支持自定义组合",
      "设置页提供快速上手指南入口",
    ],
  },
} as const;

type StepKey = keyof typeof stepBlueprints;

const stepOrder: StepKey[] = ["capture", "ai", "personalize"];

const currentIndex = ref(0);

const steps = computed(() =>
  stepOrder.map(key => {
    const blueprint = stepBlueprints[key];
    return {
      key,
      icon: blueprint.icon,
      accent: blueprint.accent,
      title: t(`onboarding.steps.${key}.title`, blueprint.fallbackTitle),
      description: t(`onboarding.steps.${key}.description`, blueprint.fallbackDescription),
      bullets: [
        t(`onboarding.steps.${key}.bullet1`, blueprint.fallbackBullets[0]),
        t(`onboarding.steps.${key}.bullet2`, blueprint.fallbackBullets[1]),
        t(`onboarding.steps.${key}.bullet3`, blueprint.fallbackBullets[2]),
      ].filter(line => line && line.trim().length > 0),
    };
  })
);

const activeStep = computed(() => steps.value[currentIndex.value] ?? steps.value[0]);
const totalSteps = computed(() => steps.value.length);
const progress = computed(() => {
  if (!totalSteps.value) return 0;
  return Math.round(((currentIndex.value + 1) / totalSteps.value) * 100);
});

const primaryLabel = computed(() =>
  currentIndex.value < totalSteps.value - 1
    ? t("onboarding.next", "下一步")
    : t("onboarding.start", "开始体验")
);

const prevDisabled = computed(() => currentIndex.value === 0);

watch(
  () => props.visible,
  value => {
    if (value) {
      currentIndex.value = 0;
    }
  }
);

function goPrev() {
  if (currentIndex.value > 0) {
    currentIndex.value -= 1;
  }
}

function goNext() {
  if (currentIndex.value < totalSteps.value - 1) {
    currentIndex.value += 1;
  } else {
    emit("complete");
  }
}

function handleSkip() {
  emit("skip");
  currentIndex.value = 0;
}

function handleRemind() {
  emit("remind");
  currentIndex.value = 0;
}
</script>

<template>
  <Transition name="onboarding-fade">
    <div v-if="visible" class="onboarding-overlay">
      <div class="onboarding-backdrop" @click="handleRemind" />
      <section class="onboarding-dialog" role="dialog" aria-modal="true">
        <header class="onboarding-header">
          <div class="onboarding-title">
            <h2>{{ t("onboarding.title", "欢迎来到 VibeClip Pro") }}</h2>
            <p>{{ t("onboarding.subtitle", "AI 加速的剪贴板工作台") }}</p>
          </div>
          <div class="onboarding-links">
            <n-button quaternary size="tiny" @click="handleRemind">
              {{ t("onboarding.remind", "稍后提醒") }}
            </n-button>
            <n-button text size="tiny" @click="handleSkip">
              {{ t("onboarding.skip", "跳过教程") }}
            </n-button>
          </div>
        </header>

        <n-progress
          class="onboarding-progress"
          type="line"
          :percentage="progress"
          :show-indicator="false"
        />

        <div class="onboarding-body">
          <Transition name="onboarding-step" mode="out-in">
            <div :key="activeStep.key" class="step-card">
              <div class="step-visual" :style="{ backgroundImage: activeStep.accent }">
                <span class="step-icon">{{ activeStep.icon }}</span>
              </div>
              <div class="step-content">
                <span class="step-index">
                  {{ currentIndex + 1 }}/{{ totalSteps }}
                </span>
                <h3>{{ activeStep.title }}</h3>
                <p>{{ activeStep.description }}</p>
                <ul>
                  <li v-for="line in activeStep.bullets" :key="line">{{ line }}</li>
                </ul>
              </div>
            </div>
          </Transition>
        </div>

        <footer class="onboarding-footer">
          <n-button quaternary size="small" :disabled="prevDisabled" @click="goPrev">
            {{ t("onboarding.prev", "上一步") }}
          </n-button>
          <n-button type="primary" size="medium" @click="goNext">
            {{ primaryLabel }}
          </n-button>
        </footer>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.onboarding-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px 16px;
  background: color-mix(in srgb, rgba(20, 24, 42, 0.62) 68%, transparent);
  backdrop-filter: blur(24px) saturate(160%);
  z-index: 999;
}

.onboarding-backdrop {
  position: absolute;
  inset: 0;
}

.onboarding-dialog {
  position: relative;
  width: min(420px, 100%);
  max-height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px 18px 18px;
  border-radius: 22px;
  background: linear-gradient(140deg, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.82));
  border: 1px solid color-mix(in srgb, var(--vibe-accent) 18%, transparent);
  box-shadow: 0 32px 72px rgba(24, 32, 72, 0.28);
  color: var(--vibe-text-primary);
  overflow: hidden;
}

.dark .onboarding-dialog {
  background: linear-gradient(145deg, rgba(21, 26, 42, 0.95), rgba(28, 33, 54, 0.92));
  border-color: color-mix(in srgb, var(--vibe-accent) 28%, transparent);
  box-shadow: 0 34px 80px rgba(4, 8, 16, 0.58);
}

.onboarding-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.onboarding-title h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.onboarding-title p {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--vibe-text-muted);
}

.onboarding-links {
  display: flex;
  gap: 8px;
}

.onboarding-progress {
  --n-progress-rail-height: 6px;
}

.onboarding-body {
  position: relative;
  min-height: 160px;
  max-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
}

.step-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: center;
}

.step-visual {
  position: relative;
  width: 100%;
  max-width: 200px;
  border-radius: 18px;
  height: 120px;
  display: grid;
  place-items: center;
  color: #fff;
  background-size: 180% 180%;
  animation: gradient-flow 6s ease infinite;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
}

.step-icon {
  font-size: 32px;
  filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.28));
}

.step-content {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: center;
}

.step-index {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: color-mix(in srgb, var(--vibe-accent) 16%, transparent);
  color: var(--vibe-text-secondary);
}

.step-content h3 {
  margin: 0;
  font-size: 16px;
}

.step-content p {
  margin: 0;
  font-size: 12px;
  color: var(--vibe-text-muted);
}

.step-content ul {
  margin: 0;
  padding-left: 18px;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--vibe-text-secondary);
}

.step-content li::marker {
  color: color-mix(in srgb, var(--vibe-accent) 62%, transparent);
}

.onboarding-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

@keyframes gradient-flow {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

.onboarding-fade-enter-active,
.onboarding-fade-leave-active {
  transition: opacity 260ms ease;
}

.onboarding-fade-enter-from,
.onboarding-fade-leave-to {
  opacity: 0;
}

.onboarding-step-enter-active,
.onboarding-step-leave-active {
  transition: opacity 220ms var(--vibe-transition), transform 220ms var(--vibe-transition);
}

.onboarding-step-enter-from {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}

.onboarding-step-leave-to {
  opacity: 0;
  transform: translateY(-12px) scale(0.98);
}

@media (max-width: 540px) {
  .step-card {
    width: 100%;
  }

  .step-visual {
    max-width: 160px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .onboarding-overlay,
  .onboarding-dialog,
  .step-visual {
    animation: none !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
