import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { createPinia, setActivePinia } from "pinia";
import { useAccountsStore } from "./accounts.ts";
import type { AccountRow } from "../services/gateway-api.ts";

const { fetchAccountsMock, triggerQuotaPollMock } = vi.hoisted(() => ({
  fetchAccountsMock: vi.fn<() => Promise<AccountRow[]>>(),
  triggerQuotaPollMock: vi.fn<() => Promise<{ ok: boolean }>>(),
}));

vi.mock("../services/gateway-api.ts", () => ({
  fetchAccounts: fetchAccountsMock,
  triggerQuotaPoll: triggerQuotaPollMock,
}));

const createAccount = (id = "acc-1"): AccountRow => ({
  id,
  name: `账号-${id}`,
  provider: "openai",
  upstreamBaseUrl: "https://api.openai.com",
  quotaPath: "/dashboard/billing/credit_grants",
  proxyPathPrefix: "/proxy",
  loginEmail: `${id}@example.com`,
  managedByGateway: false,
  provisionSource: "manual",
  provisionState: "ready",
  lastProvisionAttemptAt: null,
  lastProvisionedAt: null,
  lastProvisionError: null,
  hasStoredPassword: false,
  auth: {
    mode: "bearer",
    token: "token",
  },
  workspace: {
    kind: "personal",
    id: null,
    name: null,
    headers: null,
  },
  subscription: {
    planType: "plus",
    status: "active",
  },
  status: "healthy",
  quota: {
    weeklyUsed: 10,
    weeklyRemaining: 90,
    weeklyTotal: 100,
    weeklyRemainingRatio: 0.9,
    weeklyResetAt: "2026-04-20T00:00:00.000Z",
    window5hUsed: 2,
    window5hRemaining: 8,
    window5hTotal: 10,
    window5hRemainingRatio: 0.8,
    window5hResetAt: "2026-04-14T05:00:00.000Z",
    reservedUnits: 0,
    adjustedUnits: 0,
    sampleTime: "2026-04-14T00:00:00.000Z",
  },
});

describe("useAccountsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    fetchAccountsMock.mockReset();
    triggerQuotaPollMock.mockReset();
  });

  test("deduplicates concurrent refresh requests", async () => {
    let resolveFetch: ((accounts: AccountRow[]) => void) | undefined;

    fetchAccountsMock.mockReturnValue(
      new Promise<AccountRow[]>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const store = useAccountsStore();
    const first = store.refreshAccounts();
    const second = store.refreshAccounts();

    expect(fetchAccountsMock).toHaveBeenCalledTimes(1);

    resolveFetch?.([createAccount()]);
    await Promise.all([first, second]);

    expect(store.accounts).toHaveLength(1);
    expect(store.refreshing).toBe(false);
  });

  test("queues one more refresh when queueIfBusy is enabled", async () => {
    let firstResolve: ((accounts: AccountRow[]) => void) | undefined;
    let secondResolve: ((accounts: AccountRow[]) => void) | undefined;

    fetchAccountsMock
      .mockReturnValueOnce(
        new Promise<AccountRow[]>((resolve) => {
          firstResolve = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise<AccountRow[]>((resolve) => {
          secondResolve = resolve;
        }),
      );

    const store = useAccountsStore();
    const first = store.refreshAccounts();
    const second = store.refreshAccounts({ queueIfBusy: true });

    expect(fetchAccountsMock).toHaveBeenCalledTimes(1);

    firstResolve?.([createAccount("acc-first")]);
    await Promise.all([first, second]);

    expect(fetchAccountsMock).toHaveBeenCalledTimes(2);
    expect(store.refreshing).toBe(true);

    secondResolve?.([createAccount("acc-second")]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.refreshing).toBe(false);
    expect(store.accounts).toHaveLength(1);
    expect(store.accounts[0]?.id).toBe("acc-second");
  });

  test("stores api error message when refresh fails", async () => {
    fetchAccountsMock.mockRejectedValue(new Error("账号池接口失败"));
    const store = useAccountsStore();

    await store.refreshAccounts();

    expect(store.accounts).toEqual([]);
    expect(store.errorMessage).toBe("账号池接口失败");
    expect(store.refreshing).toBe(false);
  });

  test("pollNow triggers quota poll and then refresh", async () => {
    triggerQuotaPollMock.mockResolvedValue({ ok: true });
    fetchAccountsMock.mockResolvedValue([createAccount()]);

    const store = useAccountsStore();
    await store.pollNow();

    expect(triggerQuotaPollMock).toHaveBeenCalledTimes(1);
    expect(fetchAccountsMock).toHaveBeenCalledTimes(1);
    expect(store.accounts).toHaveLength(1);
  });

  test("pollNow stops when quota poll fails", async () => {
    triggerQuotaPollMock.mockRejectedValue(new Error("手动采集失败"));
    const store = useAccountsStore();

    await store.pollNow();

    expect(fetchAccountsMock).not.toHaveBeenCalled();
    expect(store.errorMessage).toBe("手动采集失败");
    expect(store.refreshing).toBe(false);
  });
});
