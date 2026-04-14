import { requestJson } from "./http-client.ts";
import type { AccountRow } from "./gateway-api.ts";
import type {
  DashboardHealth,
  DashboardLogsPayload,
  DashboardVirtualQuotaPool,
} from "../components/dashboard/dashboard-model.ts";

export type DashboardSnapshot = {
  health: DashboardHealth;
  accounts: AccountRow[];
  virtualPool: DashboardVirtualQuotaPool;
  logs: DashboardLogsPayload;
};

export const fetchDashboardHealth = (baseUrl: string) =>
  requestJson<DashboardHealth>(baseUrl, "/healthz");

export const fetchDashboardAccounts = (baseUrl: string) =>
  requestJson<AccountRow[]>(baseUrl, "/admin/accounts");

export const fetchDashboardVirtualQuotaPool = (baseUrl: string) =>
  requestJson<DashboardVirtualQuotaPool>(baseUrl, "/admin/virtual-quota");

export const fetchDashboardLogs = (baseUrl: string) =>
  requestJson<DashboardLogsPayload>(baseUrl, "/admin/logs");

export const fetchDashboardSnapshot = async (
  baseUrl: string,
): Promise<DashboardSnapshot> => {
  const [health, accounts, virtualPool, logs] = await Promise.all([
    fetchDashboardHealth(baseUrl),
    fetchDashboardAccounts(baseUrl),
    fetchDashboardVirtualQuotaPool(baseUrl),
    fetchDashboardLogs(baseUrl),
  ]);

  return {
    health,
    accounts,
    virtualPool,
    logs,
  };
};

export const triggerDashboardPoll = (baseUrl: string) =>
  requestJson<{ ok: boolean }>(baseUrl, "/admin/poll", {
    method: "POST",
  });
