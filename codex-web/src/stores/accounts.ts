import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { fetchAccounts, triggerQuotaPoll, type AccountRow } from "../services/gateway-api.ts";

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;
const defaultAutoRefreshIntervalMs = 45_000;

export const useAccountsStore = defineStore("accounts", () => {
  const accounts = ref<AccountRow[]>([]);
  const errorMessage = ref("");
  const refreshing = ref(false);
  const autoRefreshIntervalMs = ref(defaultAutoRefreshIntervalMs);
  const autoRefreshCountdownSeconds = ref(
    Math.ceil(defaultAutoRefreshIntervalMs / 1000),
  );
  const autoRefreshIntervalSeconds = computed(() =>
    Math.max(1, Math.floor(autoRefreshIntervalMs.value / 1000)),
  );

  let refreshTimerId: number | null = null;
  let refreshCountdownTimerId: number | null = null;
  let refreshTask: Promise<void> | null = null;
  let refreshQueued = false;
  let nextAutoRefreshAtMs: number | null = null;

  const updateAutoRefreshCountdown = () => {
    if (nextAutoRefreshAtMs === null) {
      autoRefreshCountdownSeconds.value = autoRefreshIntervalSeconds.value;
      return;
    }

    const remainingMs = Math.max(0, nextAutoRefreshAtMs - Date.now());
    autoRefreshCountdownSeconds.value = Math.max(0, Math.ceil(remainingMs / 1000));
  };

  const markNextAutoRefresh = () => {
    nextAutoRefreshAtMs = Date.now() + autoRefreshIntervalMs.value;
    updateAutoRefreshCountdown();
  };

  const refreshAccounts = (options?: { queueIfBusy?: boolean }) => {
    if (refreshTask) {
      if (options?.queueIfBusy) {
        refreshQueued = true;
      }
      return refreshTask;
    }

    refreshTask = (async () => {
      refreshing.value = true;
      errorMessage.value = "";

      try {
        accounts.value = await fetchAccounts();
      } catch (error) {
        errorMessage.value = getErrorMessage(error, "账号池加载失败。");
      } finally {
        refreshing.value = false;
      }
    })().finally(() => {
      refreshTask = null;
      if (refreshQueued) {
        refreshQueued = false;
        void refreshAccounts();
      }
    });

    return refreshTask;
  };

  const pollNow = async () => {
    if (refreshing.value) {
      return;
    }

    refreshing.value = true;
    errorMessage.value = "";

    try {
      await triggerQuotaPoll();
    } catch (error) {
      errorMessage.value = getErrorMessage(error, "手动采集失败。");
      refreshing.value = false;
      return;
    }

    refreshing.value = false;
    await refreshAccounts({ queueIfBusy: true });
  };

  const startAutoRefresh = (intervalMs = defaultAutoRefreshIntervalMs) => {
    autoRefreshIntervalMs.value = Math.max(1_000, Math.floor(intervalMs));
    if (refreshTimerId !== null) {
      return;
    }

    void refreshAccounts();
    markNextAutoRefresh();
    refreshTimerId = window.setInterval(() => {
      void refreshAccounts();
      markNextAutoRefresh();
    }, autoRefreshIntervalMs.value);
    refreshCountdownTimerId = window.setInterval(() => {
      updateAutoRefreshCountdown();
    }, 1_000);
  };

  const stopAutoRefresh = () => {
    if (refreshTimerId === null) {
      return;
    }

    window.clearInterval(refreshTimerId);
    refreshTimerId = null;
    if (refreshCountdownTimerId !== null) {
      window.clearInterval(refreshCountdownTimerId);
      refreshCountdownTimerId = null;
    }
    nextAutoRefreshAtMs = null;
    updateAutoRefreshCountdown();
  };

  return {
    accounts,
    autoRefreshCountdownSeconds,
    autoRefreshIntervalSeconds,
    errorMessage,
    pollNow,
    refreshAccounts,
    refreshing,
    startAutoRefresh,
    stopAutoRefresh,
  };
});
