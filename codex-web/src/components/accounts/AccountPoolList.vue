<script setup lang="ts">
import type {
  AccountProvisionSource,
  AccountRow,
  SubscriptionStatus,
  WorkspaceKind,
} from "../../services/gateway-api.ts";

type FeedbackTone = "success" | "error";
type QuotaTone = "danger" | "warning" | "healthy";

withDefaults(
  defineProps<{
    accounts: AccountRow[];
    loading?: boolean;
    tableFeedback: string;
    tableFeedbackTone: FeedbackTone;
    actionBusyAccountId: string | null;
    upgradeBusyAccountId: string | null;
    formatDateTime: (value: string | null) => string;
    formatWorkspaceKind: (kind: WorkspaceKind) => string;
    getSubscriptionStatus: (account: AccountRow) => SubscriptionStatus;
    formatSubscriptionStatus: (status: SubscriptionStatus) => string;
    formatSubscriptionPlan: (planType: string | null | undefined) => string;
    isFreeSubscription: (account: AccountRow) => boolean;
    formatPercent: (value: number) => string;
    formatNumber: (value: number) => string;
    getQuotaTone: (ratio: number) => QuotaTone;
    hasVirtualQuotaOverlay: (account: AccountRow) => boolean;
  }>(),
  {
    loading: false,
  },
);

const emit = defineEmits<{
  edit: [account: AccountRow];
  remove: [account: AccountRow];
  upgrade: [account: AccountRow];
}>();

const provisionSourceLabels: Record<AccountProvisionSource, string> = {
  manual: "手动",
  "session-import": "Session 导入",
  "browser-capture": "浏览器采集",
  "auto-register": "自动注册",
};

const formatProvisionSource = (source: AccountProvisionSource) =>
  provisionSourceLabels[source] ?? "未知";
</script>

<template>
  <div class="account-list">
    <div
      v-if="tableFeedback"
      class="dashboard-form__feedback"
      :class="`dashboard-form__feedback--${tableFeedbackTone}`"
    >
      {{ tableFeedback }}
    </div>

    <div class="account-list__viewport">
      <template v-if="accounts.length === 0">
        <div class="empty-card">{{ loading ? "账号加载中..." : "暂无账号。" }}</div>
      </template>
      <template v-else>
        <div class="account-row account-row--header">
          <div>账号名称</div>
          <div>空间</div>
          <div>订阅</div>
          <div>5 小时额度</div>
          <div>周额度</div>
          <div>操作</div>
        </div>

        <div v-for="account in accounts" :key="account.id" class="account-row">
          <div class="account-row__name">
            <strong>{{ account.name }}</strong>
            <span>
              来源：{{ formatProvisionSource(account.provisionSource) }} ·
              {{ account.hasStoredPassword ? "已存密码" : "未存密码" }}
            </span>
            <span>最后更新：{{ formatDateTime(account.quota.sampleTime) }}</span>
            <span v-if="account.provisionState === 'running'">
              自动化处理中...
            </span>
            <span v-if="account.lastProvisionError" class="account-row__warning">
              最近自动化失败：{{ account.lastProvisionError }}
            </span>
          </div>
          <div class="account-row__workspace">
            <span
              class="workspace-badge"
              :class="`workspace-badge--${account.workspace.kind}`"
            >
              {{ formatWorkspaceKind(account.workspace.kind) }}
            </span>
            <small v-if="account.workspace.name">{{ account.workspace.name }}</small>
            <small v-if="account.workspace.id">ID: {{ account.workspace.id }}</small>
          </div>
          <div class="account-row__subscription">
            <span
              class="subscription-badge"
              :class="`subscription-badge--${getSubscriptionStatus(account)}`"
            >
              {{ formatSubscriptionStatus(getSubscriptionStatus(account)) }}
            </span>
            <small>计划：{{ formatSubscriptionPlan(account.subscription?.planType) }}</small>
            <button
              v-if="isFreeSubscription(account)"
              type="button"
              class="secondary-btn subscription-upgrade-btn"
              :disabled="upgradeBusyAccountId === account.id || actionBusyAccountId === account.id"
              @click="emit('upgrade', account)"
            >
              {{ upgradeBusyAccountId === account.id ? "升级中..." : "升级" }}
            </button>
          </div>
          <div class="account-row__quota">
            <div class="account-row__quota-topline">
              <strong>{{ formatPercent(account.quota.window5hRemainingRatio) }}</strong>
              <span>
                {{ formatNumber(account.quota.window5hRemaining) }} /
                {{ formatNumber(account.quota.window5hTotal) }}
              </span>
            </div>
            <div
              class="quota-progress"
              :class="`quota-progress--${getQuotaTone(account.quota.window5hRemainingRatio)}`"
            >
              <span
                class="quota-progress__value"
                :style="{ width: formatPercent(account.quota.window5hRemainingRatio) }"
              />
            </div>
            <small v-if="hasVirtualQuotaOverlay(account)">
              虚拟占用：预留 {{ formatNumber(account.quota.reservedUnits) }} · 待对账
              {{ formatNumber(account.quota.adjustedUnits) }}
            </small>
            <small>刷新时间：{{ formatDateTime(account.quota.window5hResetAt) }}</small>
          </div>
          <div class="account-row__quota">
            <div class="account-row__quota-topline">
              <strong>{{ formatPercent(account.quota.weeklyRemainingRatio) }}</strong>
              <span>
                {{ formatNumber(account.quota.weeklyRemaining) }} /
                {{ formatNumber(account.quota.weeklyTotal) }}
              </span>
            </div>
            <div
              class="quota-progress"
              :class="`quota-progress--${getQuotaTone(account.quota.weeklyRemainingRatio)}`"
            >
              <span
                class="quota-progress__value"
                :style="{ width: formatPercent(account.quota.weeklyRemainingRatio) }"
              />
            </div>
            <small v-if="hasVirtualQuotaOverlay(account)">
              已用 {{ formatNumber(account.quota.weeklyUsed) }} /
              {{ formatNumber(account.quota.weeklyTotal) }}
            </small>
            <small>刷新时间：{{ formatDateTime(account.quota.weeklyResetAt) }}</small>
          </div>
          <div class="account-row__actions">
            <button
              type="button"
              class="secondary-btn account-row__action-btn"
              :disabled="actionBusyAccountId === account.id || upgradeBusyAccountId === account.id"
              @click="emit('edit', account)"
            >
              编辑
            </button>
            <button
              type="button"
              class="secondary-btn account-row__action-btn account-row__action-btn--danger"
              :disabled="actionBusyAccountId === account.id || upgradeBusyAccountId === account.id"
              @click="emit('remove', account)"
            >
              {{ actionBusyAccountId === account.id ? "处理中..." : "删除" }}
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.account-list {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 10px;
}

.account-list__viewport {
  display: grid;
  gap: 10px;
  max-height: clamp(420px, 62vh, 760px);
  overflow-y: auto;
  padding-right: 4px;
  scrollbar-gutter: stable;
}

.account-list__viewport::-webkit-scrollbar {
  width: 10px;
}

.account-list__viewport::-webkit-scrollbar-track {
  background: rgba(20, 33, 61, 0.06);
  border-radius: 999px;
}

.account-list__viewport::-webkit-scrollbar-thumb {
  background: rgba(20, 33, 61, 0.22);
  border-radius: 999px;
}

.dashboard-form__feedback {
  margin-top: 6px;
  padding: 12px 14px;
  border-radius: 16px;
  font-size: 0.94rem;
  font-weight: 700;
}

.dashboard-form__feedback--success {
  background: var(--success-soft);
  color: var(--success);
}

.dashboard-form__feedback--error {
  background: var(--critical-soft);
  color: var(--critical);
}

.account-row {
  display: grid;
  grid-template-columns:
    minmax(180px, 1.15fr)
    minmax(150px, 0.95fr)
    minmax(120px, 0.8fr)
    minmax(140px, 1fr)
    minmax(140px, 1fr)
    minmax(140px, auto);
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  border: 1px solid rgba(20, 33, 61, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.74);
}

.account-row--header {
  position: sticky;
  top: 0;
  z-index: 3;
  color: var(--muted);
  font-size: 0.84rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: rgba(250, 252, 255, 0.96);
  backdrop-filter: blur(3px);
}

.account-row__name {
  display: grid;
  gap: 4px;
}

.account-row__name strong {
  font-family: var(--font-heading);
  font-size: 1rem;
}

.account-row__name span {
  color: var(--muted);
  font-size: 0.82rem;
}

.account-row__warning {
  color: var(--critical);
}

.account-row__workspace {
  display: grid;
  gap: 4px;
}

.workspace-badge {
  display: inline-flex;
  width: fit-content;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.workspace-badge--team {
  background: rgba(26, 117, 255, 0.12);
  color: #145cd1;
}

.workspace-badge--personal {
  background: rgba(15, 123, 108, 0.12);
  color: #0f7b6c;
}

.workspace-badge--unknown {
  background: rgba(20, 33, 61, 0.08);
  color: var(--muted);
}

.account-row__workspace small {
  color: var(--muted);
  font-size: 0.82rem;
  word-break: break-all;
}

.account-row__subscription {
  display: grid;
  gap: 4px;
}

.subscription-badge {
  display: inline-flex;
  width: fit-content;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.subscription-badge--active {
  background: rgba(15, 123, 108, 0.12);
  color: #0f7b6c;
}

.subscription-badge--trial {
  background: rgba(216, 109, 57, 0.12);
  color: #b94d1d;
}

.subscription-badge--inactive {
  background: rgba(170, 61, 55, 0.12);
  color: #aa3d37;
}

.subscription-badge--unknown {
  background: rgba(20, 33, 61, 0.08);
  color: var(--muted);
}

.account-row__subscription small {
  color: var(--muted);
  font-size: 0.82rem;
}

.subscription-upgrade-btn {
  width: fit-content;
  min-width: 74px;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 0.82rem;
}

.account-row__quota {
  display: grid;
  gap: 6px;
}

.account-row__quota-topline {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.account-row__quota strong {
  font-family: var(--font-heading);
  font-size: 1.02rem;
}

.account-row__quota span,
.account-row__quota small {
  color: var(--muted);
  font-size: 0.84rem;
}

.quota-progress {
  position: relative;
  overflow: hidden;
  height: 8px;
  border-radius: 999px;
  background: rgba(20, 33, 61, 0.08);
}

.quota-progress__value {
  display: block;
  height: 100%;
  min-width: 8px;
  border-radius: inherit;
  background: linear-gradient(90deg, #59a98f 0%, #0f7b6c 100%);
}

.quota-progress--warning .quota-progress__value {
  background: linear-gradient(90deg, #d7a24f 0%, #a0671d 100%);
}

.quota-progress--danger .quota-progress__value {
  background: linear-gradient(90deg, #d8766d 0%, #aa3d37 100%);
}

.account-row__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.account-row__action-btn {
  min-width: 66px;
  padding: 9px 12px;
}

.account-row__action-btn--danger {
  border-color: rgba(170, 61, 55, 0.24);
  color: var(--critical);
}

.account-row__action-btn--danger:hover:not(:disabled) {
  border-color: rgba(170, 61, 55, 0.44);
  background: rgba(253, 227, 224, 0.78);
}

.empty-card {
  padding: 22px;
  border: 1px dashed rgba(20, 33, 61, 0.16);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.56);
  color: var(--muted);
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

@media (max-width: 920px) {
  .account-row {
    grid-template-columns: 1fr;
  }

  .account-row__actions {
    justify-content: flex-start;
  }
}
</style>
