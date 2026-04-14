import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { useAccountEditDialog } from "./use-account-edit-dialog.ts";
import type { AccountRow } from "../services/gateway-api.ts";

const { updateAccountMock } = vi.hoisted(() => ({
  updateAccountMock: vi.fn(),
}));

vi.mock("../services/gateway-api.ts", () => ({
  updateAccount: updateAccountMock,
}));

const createAccount = (): AccountRow => ({
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
    kind: "team",
    id: "ws-1",
    name: "workspace-1",
    headers: { "x-workspace-id": "ws-1" },
  },
  subscription: {
    planType: "free",
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

describe("useAccountEditDialog", () => {
  beforeEach(() => {
    updateAccountMock.mockReset();
  });

  test("submits account edit and emits success feedback", async () => {
    updateAccountMock.mockResolvedValue({ ok: true, account: createAccount() });
    const notifyCreated = vi.fn();
    const setTableFeedback = vi.fn();
    const dialog = useAccountEditDialog({
      notifyCreated,
      setTableFeedback,
    });

    dialog.openEditDialog(createAccount());
    dialog.editName.value = "账号 1 新";
    await dialog.submitEdit();

    expect(updateAccountMock).toHaveBeenCalledTimes(1);
    expect(setTableFeedback).toHaveBeenCalledWith("账号已更新。", "success");
    expect(notifyCreated).toHaveBeenCalledTimes(1);
    expect(dialog.editSubmitting.value).toBe(false);
  });

  test("blocks submit when name is empty", async () => {
    const dialog = useAccountEditDialog({
      notifyCreated: vi.fn(),
      setTableFeedback: vi.fn(),
    });

    dialog.openEditDialog(createAccount());
    dialog.editName.value = "   ";
    await dialog.submitEdit();

    expect(updateAccountMock).not.toHaveBeenCalled();
    expect(dialog.editFeedback.value).toBe("账号名称不能为空。");
    expect(dialog.editFeedbackTone.value).toBe("error");
  });
});
