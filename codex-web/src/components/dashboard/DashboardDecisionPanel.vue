<script setup lang="ts">
import {
  formatDashboardDateTime,
  getDashboardReasonLabel,
  type DashboardDecisionLog,
} from "./dashboard-model.ts";

defineProps<{
  decisions: DashboardDecisionLog[];
  selectedDecisionId: number | null;
}>();

const emit = defineEmits<{
  select: [decisionId: number];
}>();
</script>

<template>
  <article class="dashboard-panel">
    <div class="section-heading">
      <div>
        <span class="section-kicker">Decision Logs</span>
        <h2>调度决策</h2>
        <p>记录 session 命中、选中账号、调度原因和得分快照。</p>
      </div>
    </div>

    <div class="log-list">
      <template v-if="decisions.length === 0">
        <div class="empty-card">暂无调度记录。</div>
      </template>
      <template v-else>
        <button
          v-for="decision in decisions"
          :key="decision.id"
          type="button"
          class="log-item log-item--interactive"
          :class="{ 'is-selected': decision.id === selectedDecisionId }"
          @click="emit('select', decision.id)"
        >
          <div class="log-item__top">
            <strong>{{ decision.selected_account_id }}</strong>
            <span class="tag">{{ getDashboardReasonLabel(decision.reason) }}</span>
          </div>
          <p>Session <code>{{ decision.session_id }}</code></p>
          <div class="log-item__footer">
            <span>请求 <code>{{ decision.request_id }}</code></span>
            <span>{{ formatDashboardDateTime(decision.created_at) }}</span>
          </div>
        </button>
      </template>
    </div>
  </article>
</template>

<style scoped>
.dashboard-panel {
  position: relative;
  overflow: hidden;
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: 30px;
  background: rgba(255, 253, 248, 0.82);
  box-shadow: var(--shadow);
  backdrop-filter: blur(16px);
}

.dashboard-panel::before {
  content: "";
  position: absolute;
  inset: auto auto -72px -48px;
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(216, 109, 57, 0.12), transparent 70%);
  pointer-events: none;
}

.section-heading,
.log-list {
  position: relative;
  z-index: 1;
}

.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.section-kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--accent-strong);
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.section-heading h2 {
  margin-top: 10px;
  font-family: var(--font-heading);
  font-size: 1.7rem;
}

.section-heading p,
.log-item p,
.empty-card {
  color: var(--muted);
}

.log-list {
  display: grid;
  gap: 12px;
}

.log-item {
  display: grid;
  gap: 8px;
  width: 100%;
  padding: 14px 16px;
  border: 1px solid rgba(20, 33, 61, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
  text-align: left;
}

.log-item__top,
.log-item__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.log-item__top strong {
  font-family: var(--font-heading);
}

.log-item--interactive {
  cursor: pointer;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.log-item--interactive:hover {
  transform: translateY(-1px);
  border-color: rgba(216, 109, 57, 0.22);
  box-shadow: 0 14px 30px rgba(17, 33, 59, 0.08);
}

.log-item--interactive.is-selected {
  border-color: rgba(216, 109, 57, 0.3);
  background: rgba(255, 244, 236, 0.95);
}

.tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(20, 33, 61, 0.07);
  color: var(--ink);
  font-size: 0.8rem;
  font-weight: 700;
}

.empty-card {
  padding: 14px 16px;
  border: 1px solid rgba(20, 33, 61, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
}

@media (max-width: 720px) {
  .section-heading,
  .log-item__top,
  .log-item__footer {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
