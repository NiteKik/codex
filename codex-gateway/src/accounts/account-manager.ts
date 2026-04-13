import { addMs, clamp, isExpired, nowIso } from "../utils/time.js";
import type { Account, QuotaSnapshot } from "../types.js";
import { GatewayDatabase } from "../db/database.js";

export class AccountManager {
  constructor(
    private readonly db: GatewayDatabase,
    private readonly cooldownMs: number,
  ) {}

  listAccounts() {
    this.recoverCoolingAccounts();
    return this.db.listAccounts();
  }

  getAccount(accountId: string) {
    this.recoverCoolingAccounts();
    return this.db.getAccount(accountId);
  }

  upsertAccount(
    account: Omit<Account, "createdAt" | "updatedAt"> &
      Partial<Pick<Account, "createdAt" | "updatedAt">>,
  ) {
    this.db.upsertAccount(account);
  }

  recoverCoolingAccounts() {
    const accounts = this.db.listAccounts();

    for (const account of accounts) {
      if (account.status === "cooling" && isExpired(account.cooldownUntil)) {
        this.db.updateAccountState(account.id, {
          status: "healthy",
          cooldownUntil: null,
          consecutive429: 0,
          updatedAt: nowIso(),
        });
      }
    }
  }

  markSuccess(accountId: string) {
    const current = this.requireAccount(accountId);
    const nextStatus = current.status === "invalid" ? "invalid" : "healthy";

    this.db.updateAccountState(accountId, {
      status: nextStatus,
      successCount: current.successCount + 1,
      consecutiveFailures: 0,
      consecutive429: 0,
      cooldownUntil: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: nowIso(),
    });
  }

  markFailure(accountId: string, error: { code: string; message: string; httpStatus?: number }) {
    const current = this.requireAccount(accountId);
    const next = {
      failureCount: current.failureCount + 1,
      consecutiveFailures: current.consecutiveFailures + 1,
      lastErrorCode: error.code,
      lastErrorMessage: error.message,
      updatedAt: nowIso(),
    };

    if (error.httpStatus === 401 || error.httpStatus === 403) {
      this.db.updateAccountState(accountId, {
        ...next,
        status: "invalid",
        cooldownUntil: null,
      });
      return;
    }

    if (error.httpStatus === 429) {
      this.db.updateAccountState(accountId, {
        ...next,
        status: "cooling",
        consecutive429: current.consecutive429 + 1,
        cooldownUntil: addMs(new Date(), this.cooldownMs),
      });
      return;
    }

    this.db.updateAccountState(accountId, {
      ...next,
      status: current.status === "invalid" ? "invalid" : current.status,
    });
  }

  applyQuotaSnapshot(snapshot: QuotaSnapshot) {
    const current = this.requireAccount(snapshot.accountId);
    const weeklyRemaining = Math.max(0, snapshot.weeklyTotal - snapshot.weeklyUsed);
    const windowRemaining = Math.max(0, snapshot.window5hTotal - snapshot.window5hUsed);
    const isExhausted = weeklyRemaining <= 0 || windowRemaining <= 0;

    this.db.saveQuotaSnapshot(snapshot);
    this.db.reconcileAdjustments(snapshot.accountId);

    this.db.updateAccountState(snapshot.accountId, {
      status: current.status === "invalid" ? "invalid" : isExhausted ? "exhausted" : "healthy",
      cooldownUntil: isExhausted ? current.cooldownUntil : null,
      consecutiveFailures: 0,
      consecutive429: isExhausted ? current.consecutive429 : 0,
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: nowIso(),
    });
  }

  getHealthScore(accountId: string) {
    const account = this.requireAccount(accountId);
    const total = account.successCount + account.failureCount;
    const successRate = total === 0 ? 1 : account.successCount / total;
    const failurePenalty = clamp(account.consecutiveFailures / 5);
    const statusPenalty =
      account.status === "invalid"
        ? 1
        : account.status === "cooling"
          ? 0.4
          : account.status === "exhausted"
            ? 0.7
            : 0;

    return clamp(0.65 * successRate + 0.35 * (1 - failurePenalty - statusPenalty));
  }

  private requireAccount(accountId: string) {
    const account = this.db.getAccount(accountId);

    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    return account;
  }
}
