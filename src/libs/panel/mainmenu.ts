import MainMenuPanel from "@/components/panel/MainMenuPanel.vue";
import type { Panel } from "../types";

export const createMainMenuPanel = (): Panel => ({
    title: "PasteMe",
    component: MainMenuPanel,
    showContent: true,
    showHeader: true,
    showLoading: false
});