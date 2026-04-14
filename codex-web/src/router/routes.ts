import type { RouteRecordRaw } from "vue-router";

type AppRouteDefinition = {
  path: string;
  name: string;
  title: string;
  navLabel: string;
  component: Exclude<RouteRecordRaw["component"], null | undefined>;
};

const featureRoutes: AppRouteDefinition[] = [
  {
    path: "/",
    name: "plus",
    title: "Plus 自助页",
    navLabel: "Plus 自助页",
    component: () => import("../pages/plus-page.vue"),
  },
  {
    path: "/accounts",
    name: "accounts",
    title: "账号管理",
    navLabel: "账号管理",
    component: () => import("../pages/accounts-page.vue"),
  },
  {
    path: "/dashboard",
    name: "dashboard",
    title: "仪表盘",
    navLabel: "仪表盘",
    component: () => import("../pages/dashboard-page.vue"),
  },
  {
    path: "/tokens",
    name: "tokens",
    title: "Token 管理",
    navLabel: "Token 管理",
    component: () => import("../pages/tokens-page.vue"),
  },
  {
    path: "/settings",
    name: "settings",
    title: "设置",
    navLabel: "设置",
    component: () => import("../pages/settings-page.vue"),
  },
];

export const navigationItems: ReadonlyArray<{ to: string; label: string }> =
  featureRoutes.map((route) => ({
    to: route.path,
    label: route.navLabel,
  }));

export const routes: RouteRecordRaw[] = [
  ...featureRoutes.map((route) => ({
    path: route.path,
    name: route.name,
    component: route.component,
    meta: { title: route.title },
  })),
  {
    path: "/:pathMatch(.*)*",
    redirect: "/",
  },
] satisfies RouteRecordRaw[];
