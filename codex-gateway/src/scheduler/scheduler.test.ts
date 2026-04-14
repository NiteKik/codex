import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { AccountManager } from "../accounts/account-manager.js";
import { GatewayDatabase } from "../db/database.js";
import { QuotaVirtualizer } from "../quota/quota-virtualizer.js";
import { updateAccountAutomationSettings } from "../runtime-settings.js";
import { SessionManager } from "../session/session-manager.js";
import { Scheduler } from "./scheduler.js";
import type { Account, QuotaSnapshot } from "../types.js";

const databasesToClose: GatewayDatabase[] = [];

afterEach(() => {
  while (databasesToClose.length > 0) {
    databasesToClose.pop()?.close();
  }
});

const createFixture = () => {
  const dir = mkdtempSync(join(process.cwd(), ".tmp-quota-gateway-scheduler-"));
  const db = new GatewayDatabase(join(dir, "scheduler.sqlite"));
  db.init();
  databasesToClose.push(db);

  const accountManager = new AccountManager(db, 15 * 60_000);
  const sessionManager = new SessionManager(db, 20 * 60_000);
  const quotaVirtualizer = new QuotaVirtualizer(db);
  const scheduler = new Scheduler(
    db,
    accountManager,
    sessionManager,
    quotaVirtualizer,
    4,
    0.05,
    0.02,
    0.02,
    0.05,
    0,
    0,
  );

  return {
    db,
    accountManager,
    scheduler,
  };
};

const createAccount = (overrides: Partial<Account> & Pick<Account, "id" | "name">): Account => {
  const {
    id,
    name,
    auth,
    workspace,
    subscription,
    ...rest
  } = overrides;

  return {
    id,
    name,
    provider: "chatgpt-web-session",
    upstreamBaseUrl: "https://chatgpt.com",
    quotaPath: "/backend-api/wham/usage",
    proxyPathPrefix: "",
    loginEmail: id,
    loginPassword: null,
    managedByGateway: false,
    provisionSource: "manual",
    provisionState: "ready",
    lastProvisionAttemptAt: null,
    lastProvisionedAt: null,
    lastProvisionError: null,
    auth: {
      mode: "bearer",
      token: "test-token",
      ...auth,
    },
    workspace: {
      kind: "personal",
      id: null,
      name: null,
      headers: null,
      ...workspace,
    },
    subscription: {
      planType: "plus",
      status: "active",
      ...subscription,
    },
    status: "healthy",
    successCount: 0,
    failureCount: 0,
    consecutiveFailures: 0,
    consecutive429: 0,
    cooldownUntil: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...rest,
  };
};

const createSnapshot = (
  accountId: string,
  {
    weeklyUsed,
    windowUsed,
    weeklyResetAt,
    windowResetAt,
  }: {
    weeklyUsed: number;
    windowUsed: number;
    weeklyResetAt: string;
    windowResetAt: string;
  },
): QuotaSnapshot => ({
  accountId,
  weeklyTotal: 100,
  weeklyUsed,
  weeklyResetAt,
  window5hTotal: 100,
  window5hUsed: windowUsed,
  window5hResetAt: windowResetAt,
  sampleTime: new Date().toISOString(),
  source: "manual",
});

describe("Scheduler free account priority", () => {
  test("prefers free accounts over paid accounts even when paid resets earlier", () => {
    const { accountManager, scheduler } = createFixture();
    const now = Date.now();

    accountManager.upsertAccount(
      createAccount({
        id: "paid-plus",
        name: "Paid Plus",
        subscription: {
          planType: "plus",
          status: "active",
        },
      }),
    );
    accountManager.applyQuotaSnapshot(
      createSnapshot("paid-plus", {
        weeklyUsed: 10,
        windowUsed: 10,
        weeklyResetAt: new Date(now + 60 * 60_000).toISOString(),
        windowResetAt: new Date(now + 30 * 60_000).toISOString(),
      }),
    );

    accountManager.upsertAccount(
      createAccount({
        id: "free-tier",
        name: "Free Tier",
        subscription: {
          planType: "free",
          status: "active",
        },
      }),
    );
    accountManager.applyQuotaSnapshot(
      createSnapshot("free-tier", {
        weeklyUsed: 0,
        windowUsed: 0,
        weeklyResetAt: new Date(now + 7 * 24 * 60 * 60_000).toISOString(),
        windowResetAt: new Date(now + 5 * 60 * 60_000).toISOString(),
      }),
    );

    const preview = scheduler.preview({
      sessionId: "session-free-first",
      path: "/responses",
      method: "POST",
      estimatedUnits: 1,
    });

    expect(preview.selectedAccountId).toBe("free-tier");
    expect(preview.reason).toBe("free-priority-preemptive");
  });

  test("falls back to paid accounts when no free account is schedulable", () => {
    const { accountManager, scheduler } = createFixture();
    const now = Date.now();

    accountManager.upsertAccount(
      createAccount({
        id: "free-exhausted",
        name: "Free Exhausted",
        subscription: {
          planType: "free",
          status: "active",
        },
      }),
    );
    accountManager.applyQuotaSnapshot(
      createSnapshot("free-exhausted", {
        weeklyUsed: 100,
        windowUsed: 0,
        weeklyResetAt: new Date(now + 7 * 24 * 60 * 60_000).toISOString(),
        windowResetAt: new Date(now + 5 * 60 * 60_000).toISOString(),
      }),
    );

    accountManager.upsertAccount(
      createAccount({
        id: "paid-plus",
        name: "Paid Plus",
        subscription: {
          planType: "plus",
          status: "active",
        },
      }),
    );
    accountManager.applyQuotaSnapshot(
      createSnapshot("paid-plus", {
        weeklyUsed: 5,
        windowUsed: 5,
        weeklyResetAt: new Date(now + 2 * 60 * 60_000).toISOString(),
        windowResetAt: new Date(now + 60 * 60_000).toISOString(),
      }),
    );

    const preview = scheduler.preview({
      sessionId: "session-paid-fallback",
      path: "/responses",
      method: "POST",
      estimatedUnits: 1,
    });

    expect(preview.selectedAccountId).toBe("paid-plus");
    expect(preview.reason).toBe("reset-priority-preemptive");
  });

  test("can disable free account scheduling at runtime", () => {
    const { db, accountManager, scheduler } = createFixture();
    const now = Date.now();

    updateAccountAutomationSettings(db, {
      enableFreeAccountScheduling: false,
    });

    accountManager.upsertAccount(
      createAccount({
        id: "free-tier",
        name: "Free Tier",
        subscription: {
          planType: "free",
          status: "active",
        },
      }),
    );
    accountManager.applyQuotaSnapshot(
      createSnapshot("free-tier", {
        weeklyUsed: 0,
        windowUsed: 0,
        weeklyResetAt: new Date(now + 7 * 24 * 60 * 60_000).toISOString(),
        windowResetAt: new Date(now + 5 * 60 * 60_000).toISOString(),
      }),
    );

    accountManager.upsertAccount(
      createAccount({
        id: "paid-plus",
        name: "Paid Plus",
        subscription: {
          planType: "plus",
          status: "active",
        },
      }),
    );
    accountManager.applyQuotaSnapshot(
      createSnapshot("paid-plus", {
        weeklyUsed: 10,
        windowUsed: 10,
        weeklyResetAt: new Date(now + 60 * 60_000).toISOString(),
        windowResetAt: new Date(now + 30 * 60_000).toISOString(),
      }),
    );

    const preview = scheduler.preview({
      sessionId: "session-disable-free",
      path: "/responses",
      method: "POST",
      estimatedUnits: 1,
    });

    expect(preview.selectedAccountId).toBe("paid-plus");
    expect(preview.reason).toBe("reset-priority-preemptive");
  });
});
