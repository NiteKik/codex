import { defineStore } from "pinia";
import { ref } from "vue";
import { fetchAccounts, triggerQuotaPoll, type AccountRow } from "../services/gateway-api.ts";

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;
const defaultAutoRefreshIntervalMs = 45_000;

export const useAccountsStore = defineStore("accounts", () => {
  const accounts = ref<AccountRow[]>([]);
  const errorMessage = ref("");
  const refreshing = ref(false);

  let refreshTimerId: number | null = null;
  let refreshTask: Promise<void> | null = null;
  let refreshQueued = false;

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
    const resolvedIntervalMs = Math.max(1_000, Math.floor(intervalMs));
    if (refreshTimerId !== null) {
      return;
    }

    void refreshAccounts();
    refreshTimerId = window.setInterval(() => {
      void refreshAccounts();
    }, resolvedIntervalMs);
  };

  const stopAutoRefresh = () => {
    if (refreshTimerId === null) {
      return;
    }

    window.clearInterval(refreshTimerId);
    refreshTimerId = null;
  };

  return {
    accounts,
    errorMessage,
    pollNow,
    refreshAccounts,
    refreshing,
    startAutoRefresh,
    stopAutoRefresh,
  };
});
