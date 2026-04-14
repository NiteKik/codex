import { EventEmitter } from "node:events";
import { AccountManager } from "../accounts/account-manager.js";
import { GatewayDatabase } from "../db/database.js";
import { ChatgptSessionRefreshManager } from "../integrations/chatgpt-session-refresh-manager.js";
import type { Account } from "../types.js";
import { ProviderHttpError, type ProviderClient } from "../providers/provider-client.js";
import { nowIso } from "../utils/time.js";

export class QuotaPoller extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private intervalMs: number;

  constructor(
    private readonly db: GatewayDatabase,
    private readonly accountManager: AccountManager,
    private readonly provider: ProviderClient,
    intervalMs: number,
    private readonly sessionRefreshManager?: ChatgptSessionRefreshManager,
  ) {
    super();
    this.intervalMs = this.normalizeIntervalMs(intervalMs);
  }

  start() {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.runOnce("poller");
    }, this.intervalMs);
  }

  getIntervalMs() {
    return this.intervalMs;
  }

  setIntervalMs(nextIntervalMs: number) {
    const normalized = this.normalizeIntervalMs(nextIntervalMs);
    if (normalized === this.intervalMs) {
      return;
    }

    const previous = this.intervalMs;
    this.intervalMs = normalized;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        void this.runOnce("poller");
      }, this.intervalMs);
    }

    this.db.logRuntime({
      level: "info",
      scope: "quota-poller",
      event: "poll.interval_updated",
      message: `Polling interval updated: ${previous}ms -> ${this.intervalMs}ms`,
      detailsJson: JSON.stringify({
        previousIntervalMs: previous,
        nextIntervalMs: this.intervalMs,
      }),
      createdAt: nowIso(),
    });
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runOnce(source: "poller" | "manual") {
    const allAccounts = this.accountManager.listAccounts();
    const accounts = allAccounts;
    const skippedInvalidCount = 0;
    this.db.logRuntime({
      level: "info",
      scope: "quota-poller",
      event: "poll.start",
      message: `Quota polling started (${source})`,
      detailsJson: JSON.stringify({
        source,
        accountCount: accounts.length,
        skippedInvalidCount,
      }),
      createdAt: nowIso(),
    });
    const results = await Promise.allSettled(
      accounts.map((account) => this.pollAccount(account, source)),
    );
    const successCount = results.filter((result) => result.status === "fulfilled").length;
    const failedCount = results.length - successCount;
    this.db.logRuntime({
      level: failedCount > 0 ? "warn" : "info",
      scope: "quota-poller",
      event: "poll.completed",
      message: `Quota polling completed: ${successCount} success, ${failedCount} failed`,
      detailsJson: JSON.stringify({
        source,
        successCount,
        failedCount,
        skippedInvalidCount,
      }),
      createdAt: nowIso(),
    });
    this.emit("completed", results);
    return results;
  }

  private async pollAccount(account: Account, source: "poller" | "manual") {
    try {
      const snapshot = await this.fetchQuotaWithRecovery(account, source);
      const workspaceUpdated = this.accountManager.mergeWorkspaceHint(
        account.id,
        snapshot.workspaceHint,
      );
      const subscriptionUpdated = this.accountManager.mergeSubscriptionHint(
        account.id,
        snapshot.subscriptionHint,
      );
      this.accountManager.applyQuotaSnapshot({
        ...snapshot,
        source,
      });
      this.db.logRuntime({
        level: "info",
        scope: "quota-poller",
        event: "poll.account_success",
        message: "Quota snapshot updated",
        accountId: account.id,
        detailsJson: JSON.stringify({
          source,
          weeklyTotal: snapshot.weeklyTotal,
          weeklyUsed: snapshot.weeklyUsed,
          window5hTotal: snapshot.window5hTotal,
          window5hUsed: snapshot.window5hUsed,
          sampleTime: snapshot.sampleTime,
          workspaceUpdated,
          subscriptionUpdated,
          workspaceKind: snapshot.workspaceHint?.kind ?? null,
          workspaceId: snapshot.workspaceHint?.id ?? null,
          workspaceName: snapshot.workspaceHint?.name ?? null,
          subscriptionPlanType: snapshot.subscriptionHint?.planType ?? null,
          subscriptionStatus: snapshot.subscriptionHint?.status ?? null,
        }),
        createdAt: nowIso(),
      });
      this.emit("account_polled", { accountId: account.id, ok: true, snapshot });
      return snapshot;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown quota poll error";
      const httpStatus =
        error instanceof ProviderHttpError
          ? error.httpStatus
          : (() => {
              const matched = message.match(/\b([1-5]\d{2})\b/);
              if (!matched) {
                return undefined;
              }
              const parsed = Number(matched[1]);
              return Number.isFinite(parsed) ? parsed : undefined;
            })();
      this.accountManager.markFailure(account.id, {
        code: "quota_poll_failed",
        message,
        httpStatus,
      });
      this.db.logRuntime({
        level: "error",
        scope: "quota-poller",
        event: "poll.account_failed",
        message,
        accountId: account.id,
        detailsJson: JSON.stringify({
          source,
          code: "quota_poll_failed",
          httpStatus: httpStatus ?? null,
          message,
        }),
        createdAt: nowIso(),
      });
      this.emit("account_polled", { accountId: account.id, ok: false, error: message });
      throw error;
    }
  }

  private async fetchQuotaWithRecovery(account: Account, source: "poller" | "manual") {
    try {
      return await this.provider.fetchQuota(account);
    } catch (error) {
      const httpStatus = error instanceof ProviderHttpError ? error.httpStatus : null;
      const canRecover =
        (httpStatus === 401 || httpStatus === 403) &&
        this.sessionRefreshManager?.canRefreshAccount(account);
      if (!canRecover || !this.sessionRefreshManager) {
        throw error;
      }

      this.db.logRuntime({
        level: "warn",
        scope: "quota-poller",
        event: "poll.account_refreshing_session",
        message: "额度采集命中鉴权错误，尝试自动刷新 session",
        accountId: account.id,
        detailsJson: JSON.stringify({
          source,
          httpStatus,
        }),
        createdAt: nowIso(),
      });

      await this.sessionRefreshManager.refreshAccountSession(account.id, {
        reason: `quota-poll:${source}:${httpStatus}`,
      });
      const refreshed = this.accountManager.getAccount(account.id);
      if (!refreshed) {
        throw error;
      }

      return this.provider.fetchQuota(refreshed);
    }
  }

  private normalizeIntervalMs(value: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 180_000;
    }

    return Math.max(1_000, Math.floor(parsed));
  }
}
