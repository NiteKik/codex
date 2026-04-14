import { describe, expect, test } from "bun:test";
import { countAvailablePoolAccounts, getMissingPoolAccountCount } from "./account-pool-metrics.js";
import type { Account } from "../types.js";

const createAccount = (
  id: string,
  status: Account["status"],
): Account => ({
  id,
  name: id,
  provider: "chatgpt-web-session",
  upstreamBaseUrl: "https://chatgpt.com",
  quotaPath: "/backend-api/wham/usage",
  proxyPathPrefix: "",
  loginEmail: `${id}@example.com`,
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
  status,
  successCount: 0,
  failureCount: 0,
  consecutiveFailures: 0,
  consecutive429: 0,
  cooldownUntil: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
});

describe("account-pool-metrics", () => {
  test("counts non-invalid accounts as available pool members", () => {
    const accounts = [
      createAccount("healthy", "healthy"),
      createAccount("cooling", "cooling"),
      createAccount("exhausted", "exhausted"),
      createAccount("invalid", "invalid"),
    ];

    expect(countAvailablePoolAccounts(accounts)).toBe(3);
  });

  test("computes missing account count from threshold", () => {
    const accounts = [createAccount("healthy", "healthy"), createAccount("invalid", "invalid")];

    expect(getMissingPoolAccountCount(accounts, 1)).toBe(0);
    expect(getMissingPoolAccountCount(accounts, 3)).toBe(2);
  });
});
