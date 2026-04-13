import { computed, onMounted, onUnmounted, ref } from "vue";
import type { AccountRow } from "../services/gateway-api.ts";
import { getStoredGatewayBaseUrl } from "../utils/gateway-base-url.ts";
import {
  dashboardRefreshIntervalMs,
  defaultCollectIntervalMs,
  formatDashboardCountdown,
  formatDashboardDateTime,
  formatDashboardInterval,
  formatDashboardNumber,
  formatDashboardPercent,
  getLatestDashboardSampleTime,
  parseDashboardScoreBreakdown,
  type DashboardDecisionLog,
  type DashboardHealth,
  type DashboardLogsPayload,
  type DashboardMetricCard,
  type DashboardStatusTone,
  type DashboardVirtualQuotaPool,
} from "../components/dashboard/dashboard-model.ts";

const createDashboardRequest = async <T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${baseUrl}${path}`, init);
  const rawText = await response.text();
  const payload = rawText ? (JSON.parse(rawText) as unknown) : null;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message: unknown }).message)
        : `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  return payload as T;
};

const emptyPool = (): DashboardVirtualQuotaPool => ({
  accountCount: 0,
  weeklyTotal: 0,
  weeklyUsed: 0,
  weeklyRemaining: 0,
  window5hTotal: 0,
  window5hUsed: 0,
  window5hRemaining: 0,
});

export const useDashboard = () => {
  const gatewayBaseUrl = getStoredGatewayBaseUrl();
  const accounts = ref<AccountRow[]>([]);
  const virtualPool = ref<DashboardVirtualQuotaPool>(emptyPool());
  const logs = ref<DashboardLogsPayload>({ requests: [], decisions: [] });
  const selectedDecisionId = ref<number | null>(null);
  const statusTone = ref<DashboardStatusTone>("idle");
  const statusLabel = ref("未连接");
  const errorMessage = ref("");
  const refreshing = ref(false);
  const polling = ref(false);
  const lastSyncAt = ref<string | null>(null);
  const collectIntervalMs = ref(defaultCollectIntervalMs);
  const nowMs = ref(Date.now());

  let refreshTimerId: number | null = null;
  let countdownTimerId: number | null = null;

  const selectedDecision = computed<DashboardDecisionLog | null>(() => {
    if (logs.value.decisions.length === 0) {
      return null;
    }

    return (
      logs.value.decisions.find((decision) => decision.id === selectedDecisionId.value) ??
      logs.value.decisions[0] ??
      null
    );
  });

  const selectedBreakdown = computed(() =>
    selectedDecision.value ? parseDashboardScoreBreakdown(selectedDecision.value.score_json) : [],
  );

  const lastCollectedAt = computed(() => getLatestDashboardSampleTime(accounts.value));

  const nextCollectAtMs = computed(() => {
    if (!lastCollectedAt.value) {
      return null;
    }

    return new Date(lastCollectedAt.value).getTime() + collectIntervalMs.value;
  });

  const lastSyncLabel = computed(() =>
    lastSyncAt.value ? `最近同步 ${formatDashboardDateTime(lastSyncAt.value)}` : "尚未同步",
  );

  const refreshFrequencyLabel = computed(
    () =>
      `面板 ${formatDashboardInterval(dashboardRefreshIntervalMs)} · 采集 ${formatDashboardInterval(collectIntervalMs.value)}`,
  );

  const refreshFrequencyMeta = "面板自动刷新，后端按固定频率采集额度。";

  const pollCountdownLabel = computed(() => {
    if (polling.value) {
      return "采集中...";
    }

    if (nextCollectAtMs.value === null) {
      return "等待首次采集";
    }

    const remainingMs = nextCollectAtMs.value - nowMs.value;
    return remainingMs <= 0 ? "即将采集" : formatDashboardCountdown(remainingMs);
  });

  const pollCountdownMeta = computed(() => {
    if (polling.value) {
      return `固定频率 ${formatDashboardInterval(collectIntervalMs.value)} · 正在执行手动采集`;
    }

    const sampleLabel = lastCollectedAt.value
      ? `上次采集 ${formatDashboardDateTime(lastCollectedAt.value)}`
      : "等待首次采集";

    return `固定频率 ${formatDashboardInterval(collectIntervalMs.value)} · ${sampleLabel}`;
  });

  const metricCards = computed<DashboardMetricCard[]>(() => {
    const healthyCount = accounts.value.filter((account) => account.status === "healthy").length;
    const coolingCount = accounts.value.filter((account) => account.status === "cooling").length;
    const successCount = logs.value.requests.filter(
      (request) => request.upstream_status !== null && request.upstream_status < 400,
    ).length;
    const failureCount = logs.value.requests.length - successCount;
    const weeklyRatio =
      virtualPool.value.weeklyTotal === 0 ? 0 : virtualPool.value.weeklyRemaining / virtualPool.value.weeklyTotal;
    const windowRatio =
      virtualPool.value.window5hTotal === 0
        ? 0
        : virtualPool.value.window5hRemaining / virtualPool.value.window5hTotal;

    return [
      {
        label: "账户总数",
        value: formatDashboardNumber(virtualPool.value.accountCount),
        meta: `健康 ${healthyCount} / 冷却 ${coolingCount}`,
      },
      {
        label: "周额度池",
        value: formatDashboardPercent(weeklyRatio),
        meta: `剩余 ${formatDashboardNumber(virtualPool.value.weeklyRemaining)} / 总量 ${formatDashboardNumber(virtualPool.value.weeklyTotal)}`,
        accent: true,
      },
      {
        label: "5 小时额度池",
        value: formatDashboardPercent(windowRatio),
        meta: `剩余 ${formatDashboardNumber(virtualPool.value.window5hRemaining)} / 总量 ${formatDashboardNumber(virtualPool.value.window5hTotal)}`,
      },
      {
        label: "最近请求",
        value: formatDashboardNumber(logs.value.requests.length),
        meta: `成功 ${successCount} / 失败 ${failureCount}`,
      },
    ];
  });

  const refreshDashboard = async () => {
    if (refreshing.value) {
      return;
    }

    refreshing.value = true;
    errorMessage.value = "";

    try {
      const [health, nextAccounts, nextVirtualPool, nextLogs] = await Promise.all([
        createDashboardRequest<DashboardHealth>(gatewayBaseUrl, "/healthz"),
        createDashboardRequest<AccountRow[]>(gatewayBaseUrl, "/admin/accounts"),
        createDashboardRequest<DashboardVirtualQuotaPool>(gatewayBaseUrl, "/admin/virtual-quota"),
        createDashboardRequest<DashboardLogsPayload>(gatewayBaseUrl, "/admin/logs"),
      ]);

      collectIntervalMs.value =
        typeof health.pollIntervalMs === "number" && health.pollIntervalMs > 0
          ? health.pollIntervalMs
          : collectIntervalMs.value;
      accounts.value = nextAccounts;
      virtualPool.value = nextVirtualPool;
      logs.value = nextLogs;
      statusTone.value = health.ok ? "healthy" : "warning";
      statusLabel.value = health.ok ? "已连接" : "异常";
      lastSyncAt.value = new Date().toISOString();
      nowMs.value = Date.now();
    } catch (error) {
      statusTone.value = "critical";
      statusLabel.value = "连接失败";
      errorMessage.value = error instanceof Error ? error.message : "面板加载失败。";
    } finally {
      refreshing.value = false;
    }
  };

  const pollNow = async () => {
    if (polling.value) {
      return;
    }

    polling.value = true;
    errorMessage.value = "";

    try {
      await createDashboardRequest<{ ok: boolean }>(gatewayBaseUrl, "/admin/poll", {
        method: "POST",
      });
      await refreshDashboard();
    } catch (error) {
      statusTone.value = "critical";
      statusLabel.value = "采集失败";
      errorMessage.value = error instanceof Error ? error.message : "手动采集失败。";
      nowMs.value = Date.now();
    } finally {
      polling.value = false;
    }
  };

  const selectDecision = (decisionId: number) => {
    selectedDecisionId.value = decisionId;
  };

  onMounted(() => {
    void refreshDashboard();

    refreshTimerId = window.setInterval(() => {
      void refreshDashboard();
    }, dashboardRefreshIntervalMs);

    countdownTimerId = window.setInterval(() => {
      nowMs.value = Date.now();
    }, 1_000);
  });

  onUnmounted(() => {
    if (refreshTimerId !== null) {
      window.clearInterval(refreshTimerId);
      refreshTimerId = null;
    }

    if (countdownTimerId !== null) {
      window.clearInterval(countdownTimerId);
      countdownTimerId = null;
    }
  });

  return {
    accounts,
    errorMessage,
    metricCards,
    logs,
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
    selectedDecisionId: computed(() => selectedDecision.value?.id ?? null),
    statusLabel,
    statusTone,
    lastSyncLabel,
  };
};
