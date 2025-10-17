import type { RouteRecordRaw } from "vue-router";

export const routes: RouteRecordRaw[] = [
  {
    path: "/",
    redirect: "/clipboard",
  },
  {
    path: "/clipboard",
    name: "clipboard",
    component: () => import("../pages/Clipboard.vue"),
  },
  {
    path: "/history",
    name: "history",
    component: () => import("../pages/History.vue"),
  },
  {
    path: "/ai",
    name: "ai-tools",
    component: () => import("../pages/AiTools.vue"),
  },
  {
    path: "/settings",
    name: "settings",
    component: () => import("../pages/Settings.vue"),
  },
  {
    path: "/panel",
    name: "panel",
    component: () => import("../pages/Panel.vue"),
  },
];
