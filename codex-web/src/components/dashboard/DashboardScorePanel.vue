<script setup lang="ts">
import { computed } from "vue";
import type { AccountRow, WorkspaceKind } from "../../services/gateway-api.ts";
import {
  formatDashboardDateTime,
  formatDashboardPercent,
  getDashboardReasonLabel,
  type DashboardDecisionLog,
  type ScoreBreakdown,
} from "./dashboard-model.ts";

const scoreWeights = Object.freeze({
  weekly: 0.35,
  window: 0.4,
  health: 0.2,
  error: 0.15,
  switching: 0.12,
});

const workspaceKindLabelMap: Record<WorkspaceKind, string> = {
  personal: "个人",
  team: "团队",
  unknown: "未识别",
};

const props = defineProps<{
  selectedDecision: DashboardDecisionLog | null;
  breakdown: ScoreBreakdown[];
  accounts: AccountRow[];
}>();

const maxTotal = computed(() => Math.max(...props.breakdown.map((entry) => entry.total), 0.01));

const accountsById = computed(() => {
  const map = new Map<string, AccountRow>();
  for (const account of props.accounts) {
    map.set(account.id, account);
  }
  return map;
});

const resolveAccountIdentity = (accountId: string) => {
  const account = accountsById.value.get(accountId);
  if (!account) {
    return {
      name: accountId,
      id: accountId,
      workspaceKind: "unknown" as WorkspaceKind,
      workspaceKindLabel: "未知空间",
      workspaceName: null as string | null,
    };
  }

  return {
    name: account.name || account.id,
    id: account.id,
    workspaceKind: account.workspace.kind,
    workspaceKindLabel: workspaceKindLabelMap[account.workspace.kind] ?? "未识别",
    workspaceName: account.workspace.name,
  };
};

const selectedIdentity = computed(() => {
  if (!props.selectedDecision) {
    return null;
  }
  return resolveAccountIdentity(props.selectedDecision.selected_account_id);
});

const scoreCards = computed(() =>
  props.breakdown.map((item) => ({
    ...item,
    identity: resolveAccountIdentity(item.accountId),
    contributions: {
      weekly: item.weeklyRemainingRatio * scoreWeights.weekly,
      window: item.windowRemainingRatio * scoreWeights.window,
      health: item.healthScore * scoreWeights.health,
      error: -(item.recentErrorPenalty * scoreWeights.error),
      switching: -(item.switchingCost * scoreWeights.switching),
      sticky: item.stickyBonus,
    },
  })),
);

const formatContribution = (value: number) => {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "0";
  return `${sign}${Math.abs(value).toFixed(3)}`;
};

const formatRemainingUnits = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(0) : "-";

const formatResetInMs = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "未知";
  }

  const totalSeconds = Math.max(0, Math.round(value / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours} 小时 ${minutes} 分`;
  }

  if (minutes > 0) {
    return `${minutes} 分`;
  }

  return `${Math.max(1, totalSeconds)} 秒`;
};
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
            <p>按账号展示最终得分、构成项和预留策略，便于快速判断为什么命中该账号。</p>
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
                <h3>{{ selectedIdentity?.name ?? selectedDecision.selected_account_id }}</h3>
                <p>
                  账号 <code>{{ selectedIdentity?.id ?? selectedDecision.selected_account_id }}</code> ·
                  {{ selectedIdentity?.workspaceKindLabel ?? "未知空间" }}
                  <template v-if="selectedIdentity?.workspaceName">
                    · {{ selectedIdentity.workspaceName }}
                  </template>
                </p>
                <p>
                  原因：{{ getDashboardReasonLabel(selectedDecision.reason) }}
                </p>
              </div>
              <div class="score-detail__meta">
                <div>
                  Session <code>{{ selectedDecision.session_id }}</code>
                </div>
                <div>
                  请求 <code>{{ selectedDecision.request_id }}</code>
                </div>
                <div>
                  {{ formatDashboardDateTime(selectedDecision.created_at) }}
                </div>
              </div>
            </div>

            <div class="score-chip-grid">
              <article
                v-for="item in scoreCards"
                :key="item.accountId"
                class="score-card"
                :class="{
                  'score-card--selected':
                    item.accountId === selectedDecision.selected_account_id,
                }"
              >
                <div class="score-card__top">
                  <div class="score-card__account">
                    <strong>{{ item.identity.name }}</strong>
                    <small>
                      账号 <code>{{ item.identity.id }}</code> · {{ item.identity.workspaceKindLabel }}
                      <template v-if="item.identity.workspaceName">
                        · {{ item.identity.workspaceName }}
                      </template>
                    </small>
                  </div>
                  <span class="score-card__total">{{ item.total.toFixed(3) }}</span>
                </div>

                <div class="score-bar">
                  <div
                    class="score-bar__fill"
                    :style="{
                      width: `${Math.max(8, Math.round((item.total / maxTotal) * 100))}%`,
                    }"
                  />
                </div>

                <div class="score-card__formula">
                  <span>周 {{ formatContribution(item.contributions.weekly) }}</span>
                  <span>窗口 {{ formatContribution(item.contributions.window) }}</span>
                  <span>健康 {{ formatContribution(item.contributions.health) }}</span>
                  <span>错误 {{ formatContribution(item.contributions.error) }}</span>
                  <span>切换 {{ formatContribution(item.contributions.switching) }}</span>
                  <span>粘滞 {{ formatContribution(item.contributions.sticky) }}</span>
                </div>

                <dl class="score-card__grid">
                  <div>
                    <dt>周剩余</dt>
                    <dd>{{ formatDashboardPercent(item.weeklyRemainingRatio) }}</dd>
                  </div>
                  <div>
                    <dt>5h 剩余</dt>
                    <dd>{{ formatDashboardPercent(item.windowRemainingRatio) }}</dd>
                  </div>
                  <div>
                    <dt>健康度</dt>
                    <dd>{{ item.healthScore.toFixed(3) }}</dd>
                  </div>
                  <div>
                    <dt>预留策略</dt>
                    <dd>{{ item.preemptiveEligible === false ? "门槛放宽" : "满足门槛" }}</dd>
                  </div>
                  <div>
                    <dt>请求后周剩余</dt>
                    <dd>{{ formatRemainingUnits(item.weeklyRemainingAfterRequest) }}</dd>
                  </div>
                  <div>
                    <dt>请求后 5h 剩余</dt>
                    <dd>{{ formatRemainingUnits(item.windowRemainingAfterRequest) }}</dd>
                  </div>
                  <div>
                    <dt>周重置倒计时</dt>
                    <dd>{{ formatResetInMs(item.weeklyResetInMs) }}</dd>
                  </div>
                  <div>
                    <dt>5h 重置倒计时</dt>
                    <dd>{{ formatResetInMs(item.windowResetInMs) }}</dd>
                  </div>
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
  display: flex;
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
  flex-direction: column;
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
  color: rgba(246, 239, 230, 0.8);
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
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.score-card__account {
  display: grid;
  gap: 4px;
}

.score-card__account strong,
.score-card__grid dd,
.score-card__total {
  font-family: var(--font-heading);
}

.score-card__account small {
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.35;
}

.score-card__total {
  font-size: 1.05rem;
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

.score-card__formula {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.score-card__formula span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 9px;
  border-radius: 999px;
  background: rgba(20, 33, 61, 0.06);
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 700;
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
  font-size: 0.96rem;
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
