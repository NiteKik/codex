<script setup lang="ts">
import type { DashboardStatusTone } from "./dashboard-model.ts";

defineProps<{
  statusTone: DashboardStatusTone;
  statusLabel: string;
  lastSyncLabel: string;
  refreshFrequencyLabel: string;
  refreshFrequencyMeta: string;
  pollCountdownLabel: string;
  pollCountdownMeta: string;
  refreshing: boolean;
  polling: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
  poll: [];
}>();
</script>

<template>
  <section class="dashboard-hero dashboard-hero__copy">
    <span class="dashboard-kicker">Quota Gateway</span>
    <h1>仪表盘</h1>
    <div class="dashboard-status-card__value">
      <span class="status-pill" :class="`status-pill--${statusTone}`">{{
        statusLabel
      }}</span>
      <span class="dashboard-last-sync">{{ lastSyncLabel }}</span>
    </div>
    <article class="dashboard-status-card">
      <span class="dashboard-label">倒计时采集</span>
      <div class="dashboard-status-card__meta">
        <strong>{{ pollCountdownLabel }}</strong>
        <span>{{ pollCountdownMeta }}</span>
      </div>
    </article>
    <div class="button-group">
      <button
        type="button"
        class="secondary-btn"
        :disabled="refreshing || polling"
        @click="emit('refresh')"
      >
        {{ refreshing ? "刷新中..." : "刷新面板" }}
      </button>
      <button
        type="button"
        class="primary-btn dashboard-primary-btn"
        :disabled="refreshing || polling"
        @click="emit('poll')"
      >
        {{ polling ? "采集中..." : "立即采集" }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.dashboard-hero {
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
  gap: 24px;
  padding: 28px;
  border: 1px solid var(--line);
  border-radius: 30px;
  background: rgba(255, 253, 248, 0.82);
  box-shadow: var(--shadow);
  backdrop-filter: blur(16px);
}

.dashboard-hero::before {
  content: "";
  position: absolute;
  inset: auto auto -72px -48px;
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(216, 109, 57, 0.12),
    transparent 70%
  );
  pointer-events: none;
}

.dashboard-hero__copy,
.dashboard-hero__controls {
  display: flex;
  justify-content: space-between;
  position: relative;
  z-index: 1;
}

.dashboard-kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--accent-strong);
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.dashboard-hero h1 {
  margin-top: 12px;
  font-family: var(--font-heading);
  font-size: clamp(2.2rem, 4vw, 3.6rem);
  line-height: 0.95;
}

.dashboard-hero p {
  color: var(--muted);
}

.dashboard-hero__copy p {
  max-width: 42rem;
  margin-top: 16px;
}

.dashboard-hero__controls {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px;
  border-radius: 24px;
  background: linear-gradient(
    135deg,
    rgba(17, 33, 59, 0.96),
    rgba(10, 23, 48, 0.96)
  );
  color: var(--card-text);
}

.dashboard-label {
  font-size: 0.9rem;
  font-weight: 700;
}

.dashboard-status-grid {
  display: grid;
  gap: 12px;
}

.dashboard-status-card {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.06);
}

.dashboard-status-card__value,
.dashboard-status-card__meta,
.dashboard-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dashboard-status-card__meta {
  justify-content: space-between;
}

.dashboard-status-card__meta strong {
  font-family: var(--font-heading);
  font-size: 1.02rem;
}

.dashboard-status-card__meta span,
.dashboard-last-sync {
  font-size: 0.9rem;
}

.primary-btn {
  width: 100%;
  padding: 16px 20px;
  border: 0;
  border-radius: 18px;
  background: linear-gradient(135deg, #d86d39 0%, #b94d1d 100%);
  color: #fff8f4;
  font-family: var(--font-heading);
  font-size: 1.04rem;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 16px 34px rgba(185, 77, 29, 0.28);
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    opacity 180ms ease;
}

.primary-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 20px 42px rgba(185, 77, 29, 0.32);
}

.primary-btn:disabled {
  opacity: 0.56;
  cursor: not-allowed;
  box-shadow: none;
}

.secondary-btn {
  padding: 14px 18px;
  border: 1px solid rgba(20, 33, 61, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.75);
  color: var(--ink);
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background-color 180ms ease;
}

.secondary-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(216, 109, 57, 0.26);
  background: rgba(255, 246, 240, 0.96);
}

.secondary-btn:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}

.dashboard-primary-btn {
  width: auto;
  box-shadow: 0 12px 28px rgba(185, 77, 29, 0.28);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 96px;
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 0.84rem;
  font-weight: 800;
}

.status-pill--healthy {
  background: var(--success-soft);
  color: var(--success);
}

.status-pill--warning {
  background: var(--warning-soft);
  color: var(--warning);
}

.status-pill--critical {
  background: var(--critical-soft);
  color: var(--critical);
}

.button-group {
  display: flex;
}

.status-pill--idle {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.82);
}

@media (max-width: 1080px) {
  .dashboard-hero {
    grid-template-columns: 1fr;
  }

  .dashboard-status-card__meta {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 720px) {
  .dashboard-hero {
    padding: 18px;
    border-radius: 20px;
  }

  .dashboard-toolbar,
  .dashboard-status-card__value,
  .dashboard-status-card__meta {
    flex-direction: column;
    align-items: flex-start;
  }

  .dashboard-toolbar .secondary-btn,
  .dashboard-toolbar .dashboard-primary-btn {
    width: 100%;
  }
}
</style>
