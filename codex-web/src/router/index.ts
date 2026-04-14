import { createRouter, createWebHistory } from "vue-router";
import { routes } from "./routes.ts";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.afterEach((to) => {
  const title = to.meta.title ?? "Codex Web";
  document.title = `Codex Web · ${title}`;
});

export default router;
