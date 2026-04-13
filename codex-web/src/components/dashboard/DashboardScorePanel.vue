<script setup lang="ts">
import { computed } from "vue";
import {
  formatDashboardDateTime,
  formatDashboardPercent,
  getDashboardReasonLabel,
  type DashboardDecisionLog,
  type ScoreBreakdown,
} from "./dashboard-model.ts";

const props = defineProps<{
  selectedDecision: DashboardDecisionLog | null;
  breakdown: ScoreBreakdown[];
}>();

const maxTotal = computed(() => Math.max(...props.breakdown.map((entry) => entry.total), 0.01));
</script>

<template>
  <section class="dashboard-grid dashboard-grid--manage">
    <details class="dashboard-advanced-toggle" open>
      <summary>高级诊断：调度分数明细</summary>
      <article class="dashboard-panel dashboard-panel--flat">
        <div class="section-heading">
          <div>
            <span class="section-kicker">Scheduler</span>
            <h2>调度分数明细</h2>
            <p>点击下方调度决策记录，查看打分拆解与命中原因。</p>
          </div>
        </div>

        <div class="score-detail">
          <template v-if="!selectedDecision">
            <div class="empty-card">暂无已选中的调度记录。</div>
          </template>
          <template v-else-if="breakdown.length === 0">
            <div class="empty-card">当前调度记录没有可解析的分数详情。</div>
          </template>
          <template v-else>
            <div class="score-detail__summary">
              <div>
                <span class="section-kicker">Selected</span>
                <h3>{{ selectedDecision.selected_account_id }}</h3>
                <p>原因：{{ getDashboardReasonLabel(selectedDecision.reason) }}</p>
              </div>
              <div class="score-detail__meta">
                <div>Session <code>{{ selectedDecision.session_id }}</code></div>
                <div>请求 <code>{{ selectedDecision.request_id }}</code></div>
                <div>{{ formatDashboardDateTime(selectedDecision.created_at) }}</div>
              </div>
            </div>

            <div class="score-chip-grid">
              <article
                v-for="item in breakdown"
                :key="item.accountId"
                class="score-card"
                :class="{ 'score-card--selected': item.accountId === selectedDecision.selected_account_id }"
              >
                <div class="score-card__top">
                  <strong>{{ item.accountId }}</strong>
                  <span>{{ item.total.toFixed(3) }}</span>
                </div>
                <div class="score-bar">
                  <div
                    class="score-bar__fill"
                    :style="{
                      width: `${Math.max(8, Math.round((item.total / maxTotal) * 100))}%`,
                    }"
                  />
                </div>
                <dl class="score-card__grid">
                  <div><dt>周剩余</dt><dd>{{ formatDashboardPercent(item.weeklyRemainingRatio) }}</dd></div>
                  <div><dt>窗口剩余</dt><dd>{{ formatDashboardPercent(item.windowRemainingRatio) }}</dd></div>
                  <div><dt>健康度</dt><dd>{{ item.healthScore.toFixed(3) }}</dd></div>
                  <div><dt>错误惩罚</dt><dd>{{ item.recentErrorPenalty.toFixed(3) }}</dd></div>
                  <div><dt>切换成本</dt><dd>{{ item.switchingCost.toFixed(3) }}</dd></div>
                  <div><dt>粘滞加成</dt><dd>{{ item.stickyBonus.toFixed(3) }}</dd></div>
                </dl>
              </article>
            </div>
          </template>
        </div>
      </article>
    </details>
  </section>
</template>

<style scoped>
.dashboard-grid--manage {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
  gap: 20px;
}

.dashboard-advanced-toggle {
  border: 1px solid rgba(20, 33, 61, 0.1);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.72);
  padding: 12px 14px;
}

.dashboard-advanced-toggle > summary {
  cursor: pointer;
  font-weight: 700;
  color: var(--muted);
  user-select: none;
}

.dashboard-panel--flat {
  padding: 16px 0 0;
  background: transparent;
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
.empty-card,
.score-detail__summary p,
.score-detail__meta {
  color: var(--muted);
}

.score-detail {
  display: grid;
  gap: 18px;
}

.empty-card {
  padding: 14px 16px;
  border: 1px solid rgba(20, 33, 61, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
}

.score-detail__summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 18px;
  border: 1px solid rgba(20, 33, 61, 0.08);
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(17, 33, 59, 0.96), rgba(10, 23, 48, 0.96));
  color: var(--card-text);
}

.score-detail__summary p,
.score-detail__meta {
  color: rgba(246, 239, 230, 0.78);
}

.score-detail__summary h3 {
  margin-top: 10px;
  font-family: var(--font-heading);
  font-size: 1.75rem;
}

.score-detail__meta {
  display: grid;
  gap: 8px;
  font-size: 0.94rem;
}

.score-chip-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.score-card {
  display: grid;
  gap: 12px;
  padding: 18px;
  border: 1px solid rgba(20, 33, 61, 0.08);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.82);
}

.score-card--selected {
  border-color: rgba(216, 109, 57, 0.3);
  background: rgba(255, 245, 238, 0.96);
}

.score-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.score-card__top strong,
.score-card__grid dd {
  font-family: var(--font-heading);
}

.score-bar {
  height: 10px;
  border-radius: 999px;
  background: rgba(20, 33, 61, 0.08);
  overflow: hidden;
}

.score-bar__fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #d86d39, #b94d1d);
}

.score-card__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}

.score-card__grid div {
  padding: 10px 12px;
  border-radius: 16px;
  background: rgba(20, 33, 61, 0.05);
}

.score-card__grid dt {
  color: var(--muted);
  font-size: 0.82rem;
}

.score-card__grid dd {
  margin: 6px 0 0;
  font-size: 0.98rem;
}

@media (max-width: 1080px) {
  .dashboard-grid--manage {
    grid-template-columns: 1fr;
  }

  .score-chip-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .section-heading,
  .score-detail__summary {
    flex-direction: column;
    align-items: flex-start;
  }

  .score-card__grid {
    grid-template-columns: 1fr;
  }
}
</style>
