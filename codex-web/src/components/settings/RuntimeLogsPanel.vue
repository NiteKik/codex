<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { fetchRuntimeLogs, type RuntimeLog } from "../../services/settings-page-api.ts";
import { usePagePolling } from "../../composables/use-page-polling.ts";
import { formatDateTime as formatDateTimeValue } from "../../utils/date-time.ts";

const props = defineProps<{
  baseUrl: string;
}>();

const logs = ref<RuntimeLog[]>([]);
const loading = ref(false);
const queuedRefresh = ref(false);
const errorMessage = ref("");
const lastSync = ref<string | null>(null);
const onlySchedulerLogs = ref(false);

type RuntimeDetailItem = {
  key: string;
  label: string;
  value: string;
};

const runtimeDetailLabels: Record<string, string> = {
  path: "路径",
  method: "方法",
  estimatedUnits: "预估单位",
  reason: "调度原因",
  selectedAccountId: "选中账号",
  selectedPlanType: "选中套餐",
  stickyAccountId: "粘性账号",
  enableFreeAccountScheduling: "免费账号调度",
  isResponsesRequest: "Responses 请求",
  excludedCount: "排除账号数",
  availableCount: "可用账号数",
  availableAfterResponsesFreezeFilterCount: "冻结过滤后可用数",
  statusEligibleCount: "状态可调度",
  freeStatusEligibleCount: "免费可调度",
  paidStatusEligibleCount: "付费可调度",
  freeSchedulingFilteredCount: "免费开关过滤后",
  filteredFreeCount: "被过滤免费账号",
  responsesFree401FrozenCount: "free401冻结数",
  missingSnapshotCount: "缺失快照",
  candidateCount: "候选账号数",
  candidateFreeCount: "免费候选",
  candidatePaidCount: "付费候选",
  trigger: "触发来源",
  threshold: "阈值",
  batchSize: "批量补号数",
  upstreamStatus: "上游状态码",
  planType: "套餐类型",
  freezeMs: "冻结时长(ms)",
  freezeUntil: "冻结截止时间",
};

const runtimeDetailOrder = [
  "path",
  "method",
  "estimatedUnits",
  "reason",
  "selectedAccountId",
  "selectedPlanType",
  "stickyAccountId",
  "trigger",
  "isResponsesRequest",
  "enableFreeAccountScheduling",
  "availableCount",
  "availableAfterResponsesFreezeFilterCount",
  "statusEligibleCount",
  "candidateCount",
  "freeStatusEligibleCount",
  "paidStatusEligibleCount",
  "candidateFreeCount",
  "candidatePaidCount",
  "freeSchedulingFilteredCount",
  "filteredFreeCount",
  "responsesFree401FrozenCount",
  "missingSnapshotCount",
  "threshold",
  "batchSize",
  "excludedCount",
  "upstreamStatus",
  "planType",
  "freezeMs",
  "freezeUntil",
];

const detailOrderIndex = new Map(runtimeDetailOrder.map((key, index) => [key, index]));

const stringifyDetailValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "boolean") {
    return value ? "开启" : "关闭";
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "string") {
    return value.trim().length > 0 ? value : "-";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const parseRuntimeDetails = (detailsJson: string | null) => {
  if (!detailsJson) {
    return [] as RuntimeDetailItem[];
  }

  try {
    const parsed = JSON.parse(detailsJson) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return [
        {
          key: "raw",
          label: "详情",
          value: stringifyDetailValue(parsed),
        },
      ];
    }

    const entries = Object.entries(parsed as Record<string, unknown>).map(([key, value]) => ({
      key,
      label: runtimeDetailLabels[key] ?? key,
      value: stringifyDetailValue(value),
    }));

    return entries.sort((left, right) => {
      const leftRank = detailOrderIndex.get(left.key) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = detailOrderIndex.get(right.key) ?? Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return left.label.localeCompare(right.label, "zh-CN");
    });
  } catch {
    return [
      {
        key: "raw",
        label: "详情",
        value: detailsJson,
      },
    ];
  }
};

const visibleLogs = computed(() =>
  onlySchedulerLogs.value
    ? logs.value.filter((log) => log.scope === "scheduler")
    : logs.value,
);

const visibleCountLabel = computed(
  () => `显示 ${visibleLogs.value.length} / ${logs.value.length}`,
);

const emptyStateText = computed(() =>
  onlySchedulerLogs.value ? "当前筛选下暂无调度日志。" : "暂无运行日志。",
);

const formatDateTime = (value: string | null) =>
  formatDateTimeValue(value, {
    emptyText: "尚未同步",
    invalidText: "时间未知",
    format: {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    },
  });

const refreshLogs = async () => {
  if (loading.value) {
    queuedRefresh.value = true;
    return;
  }

  loading.value = true;
  errorMessage.value = "";

  try {
    const payload = await fetchRuntimeLogs(props.baseUrl, {
      requestLimit: 1,
      decisionLimit: 1,
      runtimeLimit: 80,
    });
    logs.value = Array.isArray(payload.runtime) ? payload.runtime : [];
    lastSync.value = new Date().toISOString();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "运行日志加载失败。";
  } finally {
    loading.value = false;

    if (queuedRefresh.value) {
      queuedRefresh.value = false;
      void refreshLogs();
    }
  }
};

watch(
  () => props.baseUrl,
  () => {
    void refreshLogs();
  },
  { immediate: true },
);

usePagePolling(
  () => {
    void refreshLogs();
  },
  30_000,
  {
    runOnMounted: false,
    pauseWhenHidden: true,
    refreshOnVisible: true,
  },
);
</script>

<template>
  <section class="runtime-panel">
    <div class="runtime-panel__header">
      <div>
        <span class="runtime-panel__kicker">Runtime Logs</span>
        <h2>运行日志</h2>
        <p>展示采集、调度、重试等核心运行事件，页面会每 30 秒自动刷新一次。</p>
      </div>
      <div class="runtime-panel__actions">
        <div class="runtime-panel__filters">
          <button
            type="button"
            class="runtime-filter-chip"
            :class="{ 'runtime-filter-chip--active': !onlySchedulerLogs }"
            @click="onlySchedulerLogs = false"
          >
            全部
          </button>
          <button
            type="button"
            class="runtime-filter-chip"
            :class="{ 'runtime-filter-chip--active': onlySchedulerLogs }"
            @click="onlySchedulerLogs = true"
          >
            仅调度
          </button>
        </div>
        <span class="runtime-panel__sync">{{ visibleCountLabel }}</span>
        <span class="runtime-panel__sync">最近同步 {{ formatDateTime(lastSync) }}</span>
        <span class="runtime-panel__sync">{{ loading ? "同步中..." : "自动刷新中（30 秒）" }}</span>
      </div>
    </div>

    <div v-if="errorMessage" class="runtime-panel__error" role="alert">
      {{ errorMessage }}
    </div>

    <div class="runtime-log-list">
      <template v-if="visibleLogs.length === 0 && !loading">
        <div class="runtime-empty-card">{{ emptyStateText }}</div>
      </template>
      <template v-else>
        <article v-for="log in visibleLogs" :key="log.id" class="runtime-log-item">
          <div class="runtime-log-item__top">
            <strong>{{ log.scope }} · {{ log.event }}</strong>
            <span
              class="runtime-tag"
              :class="{
                'runtime-tag--warning': log.level === 'warn',
                'runtime-tag--danger': log.level === 'error',
              }"
            >
              {{ log.level.toUpperCase() }}
            </span>
          </div>
          <p>{{ log.message }}</p>
          <div class="runtime-log-item__footer">
            <span>{{ formatDateTime(log.created_at) }}</span>
            <span>{{ log.account_id ? `账号 ${log.account_id}` : "全局事件" }}</span>
          </div>
          <div
            v-if="log.details_json"
            class="runtime-log-item__details"
          >
            <span
              v-for="detail in parseRuntimeDetails(log.details_json)"
              :key="`${log.id}:${detail.key}`"
              class="runtime-detail-pill"
            >
              <b>{{ detail.label }}</b>
              <span>{{ detail.value }}</span>
            </span>
          </div>
        </article>
      </template>
    </div>
  </section>
</template>

<style scoped>
.runtime-panel {
  position: relative;
  overflow: hidden;
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: 30px;
  background: rgba(255, 253, 248, 0.82);
  box-shadow: var(--shadow);
  backdrop-filter: blur(16px);
}

.runtime-panel::before {
  content: "";
  position: absolute;
  inset: auto auto -72px -48px;
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(216, 109, 57, 0.12), transparent 70%);
  pointer-events: none;
}

.runtime-panel__header,
.runtime-log-list {
  position: relative;
  z-index: 1;
}

.runtime-panel__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.runtime-panel__kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--accent-strong);
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.runtime-panel__header h2 {
  margin-top: 10px;
  font-family: var(--font-heading);
  font-size: 1.7rem;
}

.runtime-panel__header p,
.runtime-log-item p {
  color: var(--muted);
}

.runtime-panel__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.runtime-panel__filters {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border: 1px solid rgba(20, 33, 61, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
}

.runtime-filter-chip {
  min-height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}

.runtime-filter-chip--active {
  background: rgba(216, 109, 57, 0.14);
  color: var(--accent-strong);
}

.runtime-panel__sync {
  color: var(--muted);
  font-size: 0.9rem;
}

.runtime-panel__error {
  position: relative;
  z-index: 1;
  margin-bottom: 16px;
  padding: 16px 18px;
  border: 1px solid rgba(170, 61, 55, 0.12);
  border-radius: 20px;
  background: rgba(253, 227, 224, 0.9);
  color: var(--critical);
  font-weight: 700;
}

.runtime-log-list {
  display: grid;
  gap: 12px;
  max-height: clamp(360px, 56vh, 640px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  padding-right: 4px;
}

.runtime-log-item,
.runtime-empty-card {
  display: grid;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid rgba(20, 33, 61, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.74);
}

.runtime-log-item__top,
.runtime-log-item__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.runtime-log-item__top strong {
  font-family: var(--font-heading);
}

.runtime-log-item__footer {
  color: var(--muted);
  font-size: 0.84rem;
}

.runtime-log-item__details {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.runtime-detail-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid rgba(20, 33, 61, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
  color: var(--ink);
  font-size: 0.82rem;
  line-height: 1.2;
  max-width: 100%;
}

.runtime-detail-pill b {
  color: rgba(20, 33, 61, 0.72);
  font-weight: 700;
}

.runtime-detail-pill span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.runtime-tag {
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

.runtime-tag--warning {
  background: var(--warning-soft);
  color: var(--warning);
}

.runtime-tag--danger {
  background: var(--critical-soft);
  color: var(--critical);
}

.runtime-empty-card {
  color: var(--muted);
}

@media (max-width: 920px) {
  .runtime-panel__header,
  .runtime-panel__actions,
  .runtime-log-item__top,
  .runtime-log-item__footer {
    flex-direction: column;
    align-items: flex-start;
  }

}
</style>
