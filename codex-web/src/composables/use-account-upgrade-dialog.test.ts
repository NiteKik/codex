import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { useAccountUpgradeDialog } from "./use-account-upgrade-dialog.ts";
import type { AccountRow } from "../services/gateway-api.ts";

const { fetchCdkOptionsMock, upgradeAccountSubscriptionMock } = vi.hoisted(() => ({
  fetchCdkOptionsMock: vi.fn(),
  upgradeAccountSubscriptionMock: vi.fn(),
}));

vi.mock("../services/gateway-api.ts", () => ({
  fetchCdkOptions: fetchCdkOptionsMock,
  upgradeAccountSubscription: upgradeAccountSubscriptionMock,
}));

const createAccount = (planType = "free"): AccountRow => ({
  id: "acc-1",
  name: "账号 1",
  provider: "openai",
  upstreamBaseUrl: "https://api.openai.com",
  quotaPath: "/quota",
  proxyPathPrefix: "/proxy",
  loginEmail: "account-1@example.com",
  managedByGateway: false,
  provisionSource: "manual",
  provisionState: "ready",
  lastProvisionAttemptAt: null,
  lastProvisionedAt: null,
  lastProvisionError: null,
  hasStoredPassword: false,
  auth: { mode: "bearer", token: "token-1" },
  workspace: {
    kind: "personal",
    id: null,
    name: null,
    headers: null,
  },
  subscription: {
    planType,
    status: "inactive",
  },
  status: "healthy",
  quota: {
    weeklyUsed: 1,
    weeklyRemaining: 9,
    weeklyTotal: 10,
    weeklyRemainingRatio: 0.9,
    weeklyResetAt: null,
    window5hUsed: 0,
    window5hRemaining: 1,
    window5hTotal: 1,
    window5hRemainingRatio: 1,
    window5hResetAt: null,
    reservedUnits: 0,
    adjustedUnits: 0,
    sampleTime: null,
  },
});

describe("useAccountUpgradeDialog", () => {
  beforeEach(() => {
    fetchCdkOptionsMock.mockReset();
    upgradeAccountSubscriptionMock.mockReset();
  });

  test("skips loading options when account is not upgradable", async () => {
    const dialog = useAccountUpgradeDialog({
      isUpgradable: () => false,
      notifyCreated: vi.fn(),
      setTableFeedback: vi.fn(),
    });

    await dialog.upgradeAccount(createAccount("plus"));

    expect(fetchCdkOptionsMock).not.toHaveBeenCalled();
    expect(dialog.upgradeTargetAccount.value).toBeNull();
  });

  test("loads cdk options and picks default product type", async () => {
    fetchCdkOptionsMock.mockResolvedValue({
      options: [
        { productType: "plus-1m", count: 3 },
        { productType: "plus-1y", count: 1 },
      ],
      defaultProductType: "plus-1y",
    });
    const dialog = useAccountUpgradeDialog({
      isUpgradable: () => true,
      notifyCreated: vi.fn(),
      setTableFeedback: vi.fn(),
    });

    await dialog.upgradeAccount(createAccount());

    expect(fetchCdkOptionsMock).toHaveBeenCalledTimes(1);
    expect(dialog.upgradeCdkOptions.value).toHaveLength(2);
    expect(dialog.upgradeSelectedProductType.value).toBe("plus-1y");
    expect(dialog.upgradeLoadingOptions.value).toBe(false);
  });

  test("submits upgrade and reports success", async () => {
    fetchCdkOptionsMock.mockResolvedValue({
      options: [{ productType: "plus-1m", count: 2 }],
      defaultProductType: "plus-1m",
    });
    upgradeAccountSubscriptionMock.mockResolvedValue({
      ok: true,
      account: createAccount("plus"),
      activation: {
        productType: "plus-1m",
        cdkeyPreview: "CDK-***",
        checkMessage: "ok",
        message: "ok",
        remainingCdks: 1,
      },
    });
    const notifyCreated = vi.fn();
    const setTableFeedback = vi.fn();
    const dialog = useAccountUpgradeDialog({
      isUpgradable: () => true,
      notifyCreated,
      setTableFeedback,
    });

    await dialog.upgradeAccount(createAccount());
    await dialog.submitUpgrade();

    expect(upgradeAccountSubscriptionMock).toHaveBeenCalledTimes(1);
    expect(setTableFeedback).toHaveBeenCalledWith(
      "升级完成（plus-1m，剩余 CDK：1）。",
      "success",
    );
    expect(notifyCreated).toHaveBeenCalledTimes(1);
    expect(dialog.upgradeBusyAccountId.value).toBeNull();
  });

  test("adds guidance text when session info error happens", async () => {
    fetchCdkOptionsMock.mockResolvedValue({
      options: [{ productType: "plus-1m", count: 2 }],
      defaultProductType: "plus-1m",
    });
    upgradeAccountSubscriptionMock.mockRejectedValue(
      new Error("Session信息或账号异常"),
    );
    const setTableFeedback = vi.fn();
    const dialog = useAccountUpgradeDialog({
      isUpgradable: () => true,
      notifyCreated: vi.fn(),
      setTableFeedback,
    });

    await dialog.upgradeAccount(createAccount());
    await dialog.submitUpgrade();

    expect(dialog.upgradeFeedback.value).toBe(
      "Session信息或账号异常 请复制全部内容重新提交。",
    );
    expect(setTableFeedback).toHaveBeenCalledWith(
      "Session信息或账号异常 请复制全部内容重新提交。",
      "error",
    );
  });
});
