<script setup lang="ts">
import type { DashboardMetricCard } from "./dashboard-model.ts";

defineProps<{
  cards: DashboardMetricCard[];
}>();
</script>

<template>
  <section class="dashboard-grid dashboard-grid--metrics">
    <article v-for="card in cards" :key="card.label" class="metric-card" :class="{ 'metric-card--accent': card.accent }">
      <span class="metric-card__label">{{ card.label }}</span>
      <strong>{{ card.value }}</strong>
      <p>{{ card.meta }}</p>
    </article>
  </section>
</template>

<style scoped>
.dashboard-grid--metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
}

.metric-card {
  position: relative;
  overflow: hidden;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 30px;
  background: rgba(255, 253, 248, 0.82);
  box-shadow: var(--shadow);
  backdrop-filter: blur(16px);
}

.metric-card::before {
  content: "";
  position: absolute;
  inset: auto auto -72px -48px;
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(216, 109, 57, 0.12), transparent 70%);
  pointer-events: none;
}

.metric-card strong,
.metric-card__label,
.metric-card p {
  position: relative;
  z-index: 1;
}

.metric-card strong {
  display: block;
  margin-top: 14px;
  font-family: var(--font-heading);
  font-size: 2rem;
}

.metric-card__label {
  color: var(--muted);
  font-size: 0.88rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.metric-card p {
  color: var(--muted);
}

.metric-card--accent {
  background: linear-gradient(135deg, rgba(17, 33, 59, 0.96), rgba(10, 23, 48, 0.96));
  color: var(--card-text);
}

.metric-card--accent::before {
  background: radial-gradient(circle, rgba(247, 197, 107, 0.18), transparent 70%);
}

.metric-card--accent .metric-card__label,
.metric-card--accent p {
  color: rgba(246, 239, 230, 0.72);
}

@media (max-width: 1080px) {
  .dashboard-grid--metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .dashboard-grid--metrics {
    grid-template-columns: 1fr;
  }
}
</style>
