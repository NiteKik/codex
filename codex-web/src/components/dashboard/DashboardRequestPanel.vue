<script setup lang="ts">
import { computed } from "vue";
import type { AccountRow, WorkspaceKind } from "../../services/gateway-api.ts";
import { formatDashboardDateTime, type DashboardRequestLog } from "./dashboard-model.ts";

const props = defineProps<{
  accounts: AccountRow[];
  requests: DashboardRequestLog[];
}>();

const workspaceKindLabelMap: Record<WorkspaceKind, string> = {
  personal: "个人",
  team: "团队",
  unknown: "未识别",
};

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
      workspaceKindLabel: "未知空间",
      workspaceName: null as string | null,
    };
  }

  return {
    name: account.name || account.id,
    id: account.id,
    workspaceKindLabel: workspaceKindLabelMap[account.workspace.kind] ?? "未识别",
    workspaceName: account.workspace.name,
  };
};

const readableRequests = computed(() =>
  props.requests.map((request) => ({
    ...request,
    identity: resolveAccountIdentity(request.account_id),
  })),
);
</script>

<template>
  <article class="dashboard-panel">
    <div class="section-heading">
      <div>
        <span class="section-kicker">Request Logs</span>
        <h2>请求轨迹</h2>
        <p>最近请求状态、耗时、重试次数和错误信息。</p>
      </div>
    </div>

    <div class="log-list">
      <template v-if="readableRequests.length === 0">
        <div class="empty-card">暂无请求记录。</div>
      </template>
      <template v-else>
        <article v-for="request in readableRequests" :key="request.request_id" class="log-item">
          <div class="log-item__top">
            <strong>{{ request.method }} {{ request.path }}</strong>
            <span v-if="request.upstream_status === null" class="tag">进行中</span>
            <span v-else class="tag" :class="{ 'tag--danger': request.upstream_status >= 400 }">
              {{ request.upstream_status }}
            </span>
          </div>
          <p class="log-item__identity">
            账号 {{ request.identity.name }}
            <code>{{ request.identity.id }}</code> ·
            {{ request.identity.workspaceKindLabel }}
            <template v-if="request.identity.workspaceName">
              · {{ request.identity.workspaceName }}
            </template>
          </p>
          <div class="log-item__footer">
            <span>Session <code>{{ request.session_id }}</code> · 请求 <code>{{ request.request_id }}</code></span>
            <span>{{ formatDashboardDateTime(request.started_at) }}</span>
          </div>
          <div class="log-item__footer">
            <span>尝试 {{ request.attempt }} 次 · 预估 {{ request.estimated_units }} units</span>
            <span>{{ request.duration_ms === null ? "-" : `${request.duration_ms} ms` }}</span>
          </div>
          <p class="log-item__error" :class="{ 'log-item__error--danger': Boolean(request.error_message) }">
            {{ request.error_message || "无错误" }}
          </p>
        </article>
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
  max-height: clamp(320px, 52vh, 560px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  padding-right: 4px;
}

.log-item,
.empty-card {
  display: grid;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid rgba(20, 33, 61, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
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

.log-item__identity {
  font-size: 0.9rem;
}

.log-item__error {
  margin-top: 2px;
}

.log-item__error--danger {
  color: var(--critical);
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

.tag--danger {
  background: var(--critical-soft);
  color: var(--critical);
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
