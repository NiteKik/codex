<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import { navigationItems } from "./router/routes.ts";

const route = useRoute();

const pageTitle = computed(() => route.meta.title ?? "Plus 自助页");
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="topbar__brand">
        <span class="topbar__eyebrow">Codex Web</span>
        <strong>{{ pageTitle }}</strong>
      </div>
      <nav class="topbar__nav" aria-label="页面导航">
        <RouterLink
          v-for="item in navigationItems"
          :key="item.to"
          :to="item.to"
          class="topbar__link"
          active-class="is-active"
          exact-active-class="is-active"
        >
          {{ item.label }}
        </RouterLink>
      </nav>
    </header>

    <main class="route-root">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  gap: 26px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  max-width: 1220px;
  margin: 0 auto;
  padding: 16px 20px;
  border: 1px solid var(--line);
  border-radius: 24px;
  background: rgba(255, 253, 248, 0.72);
  box-shadow: 0 16px 44px rgba(17, 33, 59, 0.08);
  backdrop-filter: blur(16px);
}

.topbar__brand {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.topbar__eyebrow {
  color: var(--accent-strong);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.topbar__brand strong {
  font-family: var(--font-heading);
  font-size: 1.08rem;
}

.topbar__nav {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.topbar__link {
  padding: 10px 16px;
  border: 1px solid rgba(20, 33, 61, 0.08);
  border-radius: 999px;
  color: var(--muted);
  text-decoration: none;
  font-weight: 700;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background-color 180ms ease,
    color 180ms ease;
}

.topbar__link:hover,
.topbar__link.is-active {
  color: var(--ink);
  border-color: rgba(216, 109, 57, 0.22);
  background: rgba(216, 109, 57, 0.1);
  transform: translateY(-1px);
}

.route-root {
  min-height: calc(100vh - 160px);
}

@media (max-width: 1080px) {
  .topbar {
    flex-direction: column;
    align-items: flex-start;
    gap: 14px;
  }

  .topbar__nav {
    width: 100%;
    flex-wrap: wrap;
  }
}
</style>
