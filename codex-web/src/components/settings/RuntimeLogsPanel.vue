<script setup lang="ts">
import { ref, watch } from "vue";
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
        <span class="runtime-panel__sync">最近同步 {{ formatDateTime(lastSync) }}</span>
        <button type="button" class="secondary-btn" :disabled="loading" @click="refreshLogs">
          {{ loading ? "刷新中..." : "刷新日志" }}
        </button>
      </div>
    </div>

    <div v-if="errorMessage" class="runtime-panel__error" role="alert">
      {{ errorMessage }}
    </div>

    <div class="runtime-log-list">
      <template v-if="logs.length === 0 && !loading">
        <div class="runtime-empty-card">暂无运行日志。</div>
      </template>
      <template v-else>
        <article v-for="log in logs" :key="log.id" class="runtime-log-item">
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
          <p v-if="log.details_json" class="runtime-log-item__details">
            <code>{{ log.details_json }}</code>
          </p>
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

.runtime-panel__sync {
  color: var(--muted);
  font-size: 0.9rem;
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
  overflow: auto;
}

.runtime-log-item__details code {
  display: inline-block;
  max-width: 100%;
  white-space: pre-wrap;
  word-break: break-word;
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

  .runtime-panel__actions .secondary-btn {
    width: 100%;
  }
}
</style>
