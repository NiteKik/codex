import { EventEmitter } from "node:events";
import { AccountManager } from "../accounts/account-manager.js";
import { GatewayDatabase } from "../db/database.js";
import type { Account } from "../types.js";
import { ProviderHttpError, type ProviderClient } from "../providers/provider-client.js";
import { nowIso } from "../utils/time.js";

export class QuotaPoller extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: GatewayDatabase,
    private readonly accountManager: AccountManager,
    private readonly provider: ProviderClient,
    private readonly intervalMs: number,
  ) {
    super();
  }

  start() {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.runOnce("poller");
    }, this.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runOnce(source: "poller" | "manual") {
    const allAccounts = this.accountManager.listAccounts();
    const accounts = allAccounts.filter((account) => account.status !== "invalid");
    const skippedInvalidCount = allAccounts.length - accounts.length;
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
      const snapshot = await this.provider.fetchQuota(account);
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
}
