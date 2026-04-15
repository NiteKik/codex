import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { GatewayDatabase } from "../db/database.js";
import type { Account, QuotaSnapshot } from "../types.js";
import { AccountManager } from "./account-manager.js";

const databasesToClose: GatewayDatabase[] = [];

afterEach(() => {
  while (databasesToClose.length > 0) {
    databasesToClose.pop()?.close();
  }
});

const createFixture = () => {
  const dir = mkdtempSync(join(process.cwd(), ".tmp-quota-gateway-account-manager-"));
  const db = new GatewayDatabase(join(dir, "account-manager.sqlite"));
  db.init();
  databasesToClose.push(db);

  const accountManager = new AccountManager(db, 15 * 60_000, 60 * 60_000);
  return {
    db,
    accountManager,
  };
};

const createAccount = (
  overrides: Partial<Account> &
    Pick<
      Account,
      "id" | "name" | "status" | "auth" | "workspace" | "subscription"
    >,
): Account => ({
  id: overrides.id,
  name: overrides.name,
  provider: "chatgpt-web-session",
  upstreamBaseUrl: "https://chatgpt.com",
  quotaPath: "/backend-api/wham/usage",
  proxyPathPrefix: "",
  loginEmail: overrides.id,
  loginPassword: null,
  managedByGateway: false,
  provisionSource: "manual",
  provisionState: "ready",
  lastProvisionAttemptAt: null,
  lastProvisionedAt: null,
  lastProvisionError: null,
  auth: overrides.auth,
  workspace: overrides.workspace,
  subscription: overrides.subscription,
  status: overrides.status,
  successCount: overrides.successCount ?? 0,
  failureCount: overrides.failureCount ?? 0,
  consecutiveFailures: overrides.consecutiveFailures ?? 0,
  consecutive429: overrides.consecutive429 ?? 0,
  cooldownUntil: overrides.cooldownUntil ?? null,
  lastErrorCode: overrides.lastErrorCode ?? null,
  lastErrorMessage: overrides.lastErrorMessage ?? null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
});

describe("AccountManager free 401 handling", () => {
  test("free account is frozen for 1 hour when 401 occurs", () => {
    const { db, accountManager } = createFixture();
    accountManager.upsertAccount(
      createAccount({
        id: "free-1",
        name: "Free 1",
        status: "healthy",
        auth: {
          mode: "bearer",
          token: "test-token",
        },
        workspace: {
          kind: "personal",
          id: null,
          name: null,
          headers: null,
        },
        subscription: {
          planType: "free",
          status: "active",
        },
      }),
    );

    const before = Date.now();
    accountManager.markFailure("free-1", {
      code: "upstream_401",
      message: "Unauthorized",
      httpStatus: 401,
    });
    const after = Date.now();
    const account = accountManager.getAccount("free-1");

    expect(account).not.toBeNull();
    expect(account?.status).toBe("cooling");
    expect(account?.cooldownUntil).not.toBeNull();
    expect(account?.lastErrorCode).toBe("upstream_401");

    const freezeUntilMs = new Date(account?.cooldownUntil ?? "").getTime();
    expect(freezeUntilMs).toBeGreaterThanOrEqual(before + 59 * 60_000);
    expect(freezeUntilMs).toBeLessThanOrEqual(after + 61 * 60_000);

    const runtimeLogs = db.listRecentRuntimeLogs(20) as Array<Record<string, unknown>>;
    const freezeLog = runtimeLogs.find((entry) => entry.event === "account.free_401_frozen");
    expect(freezeLog).toBeTruthy();
  });

  test("non-free account remains invalid when 401 occurs", () => {
    const { accountManager } = createFixture();
    accountManager.upsertAccount(
      createAccount({
        id: "plus-1",
        name: "Plus 1",
        status: "healthy",
        auth: {
          mode: "bearer",
          token: "test-token",
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
      }),
    );

    accountManager.markFailure("plus-1", {
      code: "upstream_401",
      message: "Unauthorized",
      httpStatus: 401,
    });
    const account = accountManager.getAccount("plus-1");

    expect(account).not.toBeNull();
    expect(account?.status).toBe("invalid");
    expect(account?.cooldownUntil).toBeNull();
  });

  test("quota refresh does not clear free-401 freeze before cooldown expires", () => {
    const { accountManager } = createFixture();
    accountManager.upsertAccount(
      createAccount({
        id: "free-2",
        name: "Free 2",
        status: "healthy",
        auth: {
          mode: "bearer",
          token: "test-token",
        },
        workspace: {
          kind: "personal",
          id: null,
          name: null,
          headers: null,
        },
        subscription: {
          planType: "free",
          status: "active",
        },
      }),
    );

    accountManager.markFailure("free-2", {
      code: "upstream_401",
      message: "Unauthorized",
      httpStatus: 401,
    });

    const snapshot: QuotaSnapshot = {
      accountId: "free-2",
      weeklyTotal: 100,
      weeklyUsed: 10,
      weeklyResetAt: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
      window5hTotal: 100,
      window5hUsed: 10,
      window5hResetAt: new Date(Date.now() + 5 * 60 * 60_000).toISOString(),
      sampleTime: new Date().toISOString(),
      source: "manual",
    };
    accountManager.applyQuotaSnapshot(snapshot);

    const account = accountManager.getAccount("free-2");
    expect(account).not.toBeNull();
    expect(account?.status).toBe("cooling");
    expect(account?.lastErrorCode).toBe("upstream_401");
    expect(account?.cooldownUntil).not.toBeNull();
  });
});
