import { createRouter, createWebHistory } from "@ionic/vue-router";
import { RouteRecordRaw } from "vue-router";

const routes: Array<RouteRecordRaw> = [
  {
    path: "/",
    name: "chat",
    component: () => import("@/views/ChatPage.vue"),
  },
  {
    path: "/settings",
    name: "settings",
    component: () => import("@/views/SettingsPage.vue"),
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

export default router;
