import { addMs, clamp, isExpired, nowIso } from "../utils/time.js";
import type { Account, QuotaSnapshot, SubscriptionContext, WorkspaceContext } from "../types.js";
import { GatewayDatabase } from "../db/database.js";

const normalizeWorkspace = (workspace: WorkspaceContext): WorkspaceContext => ({
  kind: workspace.kind,
  id: workspace.id?.trim() ? workspace.id.trim() : null,
  name: workspace.name?.trim() ? workspace.name.trim() : null,
  headers:
    workspace.headers && Object.keys(workspace.headers).length > 0 ? workspace.headers : null,
});

const normalizeSubscription = (subscription: SubscriptionContext): SubscriptionContext => ({
  planType: subscription.planType?.trim().toLowerCase() || null,
  status: subscription.status,
});

const inferWorkspaceKindFromPlanType = (planType: string | null): WorkspaceContext["kind"] => {
  const normalized = planType?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return "unknown";
  }

  if (
    normalized.includes("team") ||
    normalized.includes("business") ||
    normalized.includes("enterprise") ||
    normalized.includes("org")
  ) {
    return "team";
  }

  if (
    normalized.includes("free") ||
    normalized.includes("plus") ||
    normalized.includes("pro") ||
    normalized.includes("individual") ||
    normalized.includes("personal")
  ) {
    return "personal";
  }

  return "unknown";
};

const usageRollbackTolerance = 1;

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

  mergeWorkspaceHint(accountId: string, workspaceHint: WorkspaceContext | null | undefined) {
    if (!workspaceHint) {
      return false;
    }

    const current = this.requireAccount(accountId);
    const currentWorkspace = normalizeWorkspace(current.workspace);
    const hintWorkspace = normalizeWorkspace(workspaceHint);
    const inferredWorkspaceKind = inferWorkspaceKindFromPlanType(current.subscription.planType);

    const nextKind = (() => {
      if (hintWorkspace.kind !== "unknown") {
        return hintWorkspace.kind;
      }

      if (currentWorkspace.kind !== "unknown") {
        return currentWorkspace.kind;
      }

      return inferredWorkspaceKind;
    })();
    const nextWorkspace: WorkspaceContext = {
      kind: nextKind,
      id: hintWorkspace.id ?? currentWorkspace.id,
      name: hintWorkspace.name ?? currentWorkspace.name,
      // Keep user-configured workspace headers stable.
      headers: currentWorkspace.headers,
    };

    if (JSON.stringify(nextWorkspace) === JSON.stringify(currentWorkspace)) {
      return false;
    }

    this.db.upsertAccount({
      ...current,
      workspace: nextWorkspace,
      updatedAt: nowIso(),
    });

    return true;
  }

  mergeSubscriptionHint(accountId: string, subscriptionHint: SubscriptionContext | null | undefined) {
    if (!subscriptionHint) {
      return false;
    }

    const current = this.requireAccount(accountId);
    const currentSubscription = normalizeSubscription(current.subscription);
    const hintSubscription = normalizeSubscription(subscriptionHint);
    const fallbackStatusFromPlan =
      hintSubscription.planType?.includes("trial") ? "trial" : hintSubscription.planType ? "active" : "unknown";
    const nextSubscription: SubscriptionContext = {
      planType: hintSubscription.planType ?? currentSubscription.planType,
      status:
        hintSubscription.status !== "unknown"
          ? hintSubscription.status
          : currentSubscription.status !== "unknown"
            ? currentSubscription.status
            : fallbackStatusFromPlan,
    };

    const inferredWorkspaceKind = inferWorkspaceKindFromPlanType(nextSubscription.planType);
    const shouldUpgradeWorkspaceKind =
      current.workspace.kind === "unknown" && inferredWorkspaceKind !== "unknown";
    const nextWorkspace = shouldUpgradeWorkspaceKind
      ? {
          ...current.workspace,
          kind: inferredWorkspaceKind,
        }
      : current.workspace;

    if (
      JSON.stringify(nextSubscription) === JSON.stringify(currentSubscription) &&
      !shouldUpgradeWorkspaceKind
    ) {
      return false;
    }

    this.db.upsertAccount({
      ...current,
      subscription: nextSubscription,
      workspace: nextWorkspace,
      updatedAt: nowIso(),
    });

    return true;
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

    if (error.httpStatus === 401) {
      this.db.updateAccountState(accountId, {
        ...next,
        status: "invalid",
        cooldownUntil: null,
      });
      return;
    }

    if (error.httpStatus === 403) {
      this.db.updateAccountState(accountId, {
        ...next,
        status: "cooling",
        cooldownUntil: addMs(new Date(), this.cooldownMs),
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
    const previousSnapshot = this.db.getLatestQuotaSnapshot(snapshot.accountId);
    const unreconciledBefore = this.db.getUnreconciledAdjustmentUnits(snapshot.accountId);
    let adjustmentMode: "none" | "partial-delta" | "full-reset" | "full-total-changed" = "none";
    let consumedAdjustments = 0;

    if (unreconciledBefore > 0 && previousSnapshot) {
      const totalChanged =
        previousSnapshot.weeklyTotal !== snapshot.weeklyTotal ||
        previousSnapshot.window5hTotal !== snapshot.window5hTotal;
      const usageRolledBack =
        snapshot.weeklyUsed < previousSnapshot.weeklyUsed - usageRollbackTolerance ||
        snapshot.window5hUsed < previousSnapshot.window5hUsed - usageRollbackTolerance;

      if (totalChanged || usageRolledBack) {
        this.db.reconcileAdjustments(snapshot.accountId);
        consumedAdjustments = unreconciledBefore;
        adjustmentMode = totalChanged ? "full-total-changed" : "full-reset";
      } else {
        const weeklyDelta = Math.max(0, snapshot.weeklyUsed - previousSnapshot.weeklyUsed);
        const windowDelta = Math.max(0, snapshot.window5hUsed - previousSnapshot.window5hUsed);
        const absorbedUnits = Math.max(weeklyDelta, windowDelta);
        const targetToConsume = Math.min(unreconciledBefore, Math.floor(absorbedUnits));

        if (targetToConsume > 0) {
          consumedAdjustments = this.db.consumeUnreconciledAdjustments(
            snapshot.accountId,
            targetToConsume,
          );
          if (consumedAdjustments > 0) {
            adjustmentMode = "partial-delta";
          }
        }
      }
    }

    const weeklyRemaining = Math.max(0, snapshot.weeklyTotal - snapshot.weeklyUsed);
    const windowRemaining = Math.max(0, snapshot.window5hTotal - snapshot.window5hUsed);
    const isExhausted = weeklyRemaining <= 0 || windowRemaining <= 0;

    this.db.saveQuotaSnapshot(snapshot);

    if (consumedAdjustments > 0) {
      const weeklyDelta = previousSnapshot
        ? Math.max(0, snapshot.weeklyUsed - previousSnapshot.weeklyUsed)
        : 0;
      const windowDelta = previousSnapshot
        ? Math.max(0, snapshot.window5hUsed - previousSnapshot.window5hUsed)
        : 0;
      this.db.logRuntime({
        level: "info",
        scope: "quota-poller",
        event: "poll.adjustment_reconciled",
        message: "Adjustment units reconciled from snapshot delta",
        accountId: snapshot.accountId,
        detailsJson: JSON.stringify({
          mode: adjustmentMode,
          unreconciledBefore,
          consumedAdjustments,
          weeklyUsedDelta: weeklyDelta,
          window5hUsedDelta: windowDelta,
          previousWeeklyUsed: previousSnapshot?.weeklyUsed ?? null,
          previousWindow5hUsed: previousSnapshot?.window5hUsed ?? null,
          currentWeeklyUsed: snapshot.weeklyUsed,
          currentWindow5hUsed: snapshot.window5hUsed,
          previousWeeklyTotal: previousSnapshot?.weeklyTotal ?? null,
          previousWindow5hTotal: previousSnapshot?.window5hTotal ?? null,
          currentWeeklyTotal: snapshot.weeklyTotal,
          currentWindow5hTotal: snapshot.window5hTotal,
        }),
        createdAt: nowIso(),
      });
    }

    this.db.updateAccountState(snapshot.accountId, {
      status: isExhausted ? "exhausted" : "healthy",
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
