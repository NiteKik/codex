import type { Account, QuotaSnapshot } from "../types.js";
import { addMs, nowIso } from "../utils/time.js";

export interface DemoSeed {
  account: Omit<Account, "createdAt" | "updatedAt">;
  quota: Omit<QuotaSnapshot, "accountId" | "sampleTime" | "source">;
}

export const createDemoSeeds = (mockUpstreamPort: number): DemoSeed[] => {
  const baseUrl = `http://127.0.0.1:${mockUpstreamPort}`;
  const weeklyResetAt = addMs(new Date(), 3 * 24 * 60 * 60_000);
  const window5hResetAt = addMs(new Date(), 5 * 60 * 60_000);

  return [
    {
      account: {
        id: "acc_alpha",
        name: "Alpha",
        provider: "mock-openai-compatible",
        upstreamBaseUrl: baseUrl,
        quotaPath: "/quota",
        proxyPathPrefix: "",
        auth: { mode: "bearer", token: "demo-alpha" },
        status: "healthy",
        successCount: 24,
        failureCount: 2,
        consecutiveFailures: 0,
        consecutive429: 0,
        cooldownUntil: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
      quota: {
        weeklyTotal: 120,
        weeklyUsed: 28,
        weeklyResetAt,
        window5hTotal: 40,
        window5hUsed: 6,
        window5hResetAt,
      },
    },
    {
      account: {
        id: "acc_beta",
        name: "Beta",
        provider: "mock-openai-compatible",
        upstreamBaseUrl: baseUrl,
        quotaPath: "/quota",
        proxyPathPrefix: "",
        auth: { mode: "bearer", token: "demo-beta" },
        status: "healthy",
        successCount: 17,
        failureCount: 4,
        consecutiveFailures: 0,
        consecutive429: 0,
        cooldownUntil: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
      quota: {
        weeklyTotal: 120,
        weeklyUsed: 77,
        weeklyResetAt,
        window5hTotal: 40,
        window5hUsed: 16,
        window5hResetAt,
      },
    },
    {
      account: {
        id: "acc_gamma",
        name: "Gamma",
        provider: "mock-openai-compatible",
        upstreamBaseUrl: baseUrl,
        quotaPath: "/quota",
        proxyPathPrefix: "",
        auth: { mode: "bearer", token: "demo-gamma" },
        status: "healthy",
        successCount: 10,
        failureCount: 1,
        consecutiveFailures: 0,
        consecutive429: 0,
        cooldownUntil: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
      quota: {
        weeklyTotal: 120,
        weeklyUsed: 51,
        weeklyResetAt,
        window5hTotal: 40,
        window5hUsed: 18,
        window5hResetAt,
      },
    },
  ];
};

export const buildSeededSnapshot = (seed: DemoSeed): QuotaSnapshot => ({
  accountId: seed.account.id,
  weeklyTotal: seed.quota.weeklyTotal,
  weeklyUsed: seed.quota.weeklyUsed,
  weeklyResetAt: seed.quota.weeklyResetAt,
  window5hTotal: seed.quota.window5hTotal,
  window5hUsed: seed.quota.window5hUsed,
  window5hResetAt: seed.quota.window5hResetAt,
  sampleTime: nowIso(),
  source: "manual",
});
