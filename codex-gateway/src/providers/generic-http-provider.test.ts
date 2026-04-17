import { afterEach, describe, expect, test } from "bun:test";
import type { Account } from "../types.js";
import { GenericHttpProvider } from "./generic-http-provider.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const createAccount = (): Account => ({
  id: "acc_test",
  name: "Test Account",
  provider: "chatgpt",
  upstreamBaseUrl: "https://example.com",
  quotaPath: "/backend-api/wham/usage",
  proxyPathPrefix: "",
  loginEmail: null,
  loginPassword: null,
  managedByGateway: false,
  provisionSource: "manual",
  provisionState: "ready",
  lastProvisionAttemptAt: null,
  lastProvisionedAt: null,
  lastProvisionError: null,
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
  successCount: 0,
  failureCount: 0,
  consecutiveFailures: 0,
  consecutive429: 0,
  cooldownUntil: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const mockWhamFetch = (payload: unknown) => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    })) as unknown as typeof fetch;
};

describe("GenericHttpProvider wham payload parsing", () => {
  test("treats used_percent=1 as 1% instead of 100%", async () => {
    mockWhamFetch({
      plan_type: "plus",
      rate_limit: {
        allowed: true,
        limit_reached: false,
        primary_window: {
          used_percent: 2,
          reset_at: 1_776_145_753,
        },
        secondary_window: {
          used_percent: 1,
          reset_at: 1_776_732_553,
        },
      },
    });

    const provider = new GenericHttpProvider();
    const snapshot = await provider.fetchQuota(createAccount());

    expect(snapshot.window5hUsed).toBe(2);
    expect(snapshot.weeklyUsed).toBe(1);
  });

  test("keeps a small headroom when upstream still reports allowed=true", async () => {
    mockWhamFetch({
      plan_type: "plus",
      rate_limit: {
        allowed: true,
        limit_reached: false,
        primary_window: {
          used_percent: 100,
          reset_at: 1_776_145_753,
        },
        secondary_window: {
          used_percent: 100,
          reset_at: 1_776_732_553,
        },
      },
    });

    const provider = new GenericHttpProvider();
    const snapshot = await provider.fetchQuota(createAccount());

    expect(snapshot.window5hUsed).toBe(99);
    expect(snapshot.weeklyUsed).toBe(99);
  });

  test("keeps fully exhausted when upstream says limit reached", async () => {
    mockWhamFetch({
      plan_type: "plus",
      rate_limit: {
        allowed: false,
        limit_reached: true,
        primary_window: {
          used_percent: 100,
          reset_at: 1_776_145_753,
        },
        secondary_window: {
          used_percent: 100,
          reset_at: 1_776_732_553,
        },
      },
    });

    const provider = new GenericHttpProvider();
    const snapshot = await provider.fetchQuota(createAccount());

    expect(snapshot.window5hUsed).toBe(100);
    expect(snapshot.weeklyUsed).toBe(100);
  });
});
