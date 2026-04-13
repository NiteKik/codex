<script setup lang="ts">
import DashboardDecisionPanel from "../components/dashboard/DashboardDecisionPanel.vue";
import DashboardHero from "../components/dashboard/DashboardHero.vue";
import DashboardMetricGrid from "../components/dashboard/DashboardMetricGrid.vue";
import DashboardRequestPanel from "../components/dashboard/DashboardRequestPanel.vue";
import DashboardScorePanel from "../components/dashboard/DashboardScorePanel.vue";
import { useDashboard } from "../composables/use-dashboard.ts";

const {
  accounts,
  errorMessage,
  logs,
  metricCards,
  pollCountdownLabel,
  pollCountdownMeta,
  pollNow,
  polling,
  refreshDashboard,
  refreshFrequencyLabel,
  refreshFrequencyMeta,
  refreshing,
  selectDecision,
  selectedBreakdown,
  selectedDecision,
  selectedDecisionId,
  statusLabel,
  statusTone,
  lastSyncLabel,
} = useDashboard();
</script>

<template>
  <div class="dashboard-shell">
    <DashboardHero
      :status-tone="statusTone"
      :status-label="statusLabel"
      :last-sync-label="lastSyncLabel"
      :refresh-frequency-label="refreshFrequencyLabel"
      :refresh-frequency-meta="refreshFrequencyMeta"
      :poll-countdown-label="pollCountdownLabel"
      :poll-countdown-meta="pollCountdownMeta"
      :refreshing="refreshing"
      :polling="polling"
      @refresh="refreshDashboard"
      @poll="pollNow"
    />

    <div v-if="errorMessage" class="dashboard-error" role="alert">
      {{ errorMessage }}
    </div>

    <DashboardMetricGrid :cards="metricCards" />
    <DashboardScorePanel
      :selected-decision="selectedDecision"
      :breakdown="selectedBreakdown"
      :accounts="accounts"
    />

    <section class="dashboard-grid dashboard-grid--logs">
      <DashboardDecisionPanel
        :accounts="accounts"
        :decisions="logs.decisions"
        :selected-decision-id="selectedDecisionId"
        @select="selectDecision"
      />
      <DashboardRequestPanel :accounts="accounts" :requests="logs.requests" />
    </section>
  </div>
</template>

<style scoped>
.dashboard-shell {
  max-width: 1220px;
  margin: 0 auto;
  display: grid;
  gap: 22px;
}

.dashboard-error {
  padding: 16px 18px;
  border: 1px solid rgba(170, 61, 55, 0.12);
  border-radius: 20px;
  background: rgba(253, 227, 224, 0.9);
  color: var(--critical);
  font-weight: 700;
}

.dashboard-grid--logs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

@media (max-width: 720px) {
  .dashboard-grid--logs {
    grid-template-columns: 1fr;
  }
}
</style>
