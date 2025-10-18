import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./index.css";
import { routes } from "./router";

// 全局错误处理
window.addEventListener("error", event => {
  console.error("[Global Error]", event.error ?? event.message);
  event.preventDefault();
});

window.addEventListener("unhandledrejection", event => {
  console.error("[Unhandled Promise Rejection]", event.reason);
  event.preventDefault();
});

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  },
});

// 路由错误守卫
router.onError((error) => {
  console.error("[Router Error]", error);
});

router.beforeEach((_to, _from, next) => {
  try {
    next();
  } catch (error) {
    console.error("[Route Navigation Error]", error);
    next(false);
  }
});

const app = createApp(App);

// Vue 全局错误处理器
app.config.errorHandler = (err, instance, info) => {
  console.error("[Vue Error]", err);
  console.error("[Error Info]", info);
  console.error("[Component]", instance);
};

app.use(createPinia());
app.use(router);
app.mount("#app");
