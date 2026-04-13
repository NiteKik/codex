import { defineStore } from "pinia";
import {
  fetchAccounts,
  fetchHealth,
  triggerQuotaPoll,
  type AccountRow,
} from "../services/gateway-api.ts";

export type AccountsStatusTone = "healthy" | "warning" | "critical" | "idle";

type AccountsState = {
  accounts: AccountRow[];
  statusTone: AccountsStatusTone;
  statusLabel: string;
  lastSync: string;
  errorMessage: string;
  refreshing: boolean;
  refreshTimerId: number | null;
};

export const useAccountsStore = defineStore("accounts", {
  state: (): AccountsState => ({
    accounts: [],
    statusTone: "idle",
    statusLabel: "未连接",
    lastSync: "尚未同步",
    errorMessage: "",
    refreshing: false,
    refreshTimerId: null,
  }),
  actions: {
    async refreshAccounts() {
      if (this.refreshing) {
        return;
      }

      this.refreshing = true;
      this.errorMessage = "";

      try {
        const [health, nextAccounts] = await Promise.all([
          fetchHealth(),
          fetchAccounts(),
        ]);
        this.accounts = nextAccounts;
        this.statusTone = health.ok ? "healthy" : "warning";
        this.statusLabel = health.ok ? "已连接" : "异常";
        this.lastSync = `最近同步 ${new Date().toLocaleString("zh-CN")}`;
      } catch (error) {
        this.statusTone = "critical";
        this.statusLabel = "连接失败";
        this.errorMessage =
          error instanceof Error ? error.message : "账号池加载失败。";
      } finally {
        this.refreshing = false;
      }
    },
    async pollNow() {
      if (this.refreshing) {
        return;
      }

      this.refreshing = true;
      this.errorMessage = "";

      try {
        await triggerQuotaPoll();
      } catch (error) {
        this.statusTone = "critical";
        this.statusLabel = "采集失败";
        this.errorMessage =
          error instanceof Error ? error.message : "手动采集失败。";
        this.refreshing = false;
        return;
      }

      this.refreshing = false;
      await this.refreshAccounts();
    },
    startAutoRefresh(intervalMs = 30_000) {
      if (this.refreshTimerId !== null) {
        return;
      }

      void this.refreshAccounts();
      this.refreshTimerId = window.setInterval(() => {
        void this.refreshAccounts();
      }, intervalMs);
    },
    stopAutoRefresh() {
      if (this.refreshTimerId !== null) {
        window.clearInterval(this.refreshTimerId);
        this.refreshTimerId = null;
      }
    },
  },
});
