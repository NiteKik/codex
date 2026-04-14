import { countAvailablePoolAccounts, getMissingPoolAccountCount } from "../accounts/account-pool-metrics.js";
import { AccountManager } from "../accounts/account-manager.js";
import { GatewayDatabase } from "../db/database.js";
import { getAccountAutomationSettings } from "../runtime-settings.js";
import { ChatgptRegistrationManager } from "./chatgpt-registration-manager.js";
import { nowIso } from "../utils/time.js";

export class AccountAutoRegisterReplenisher {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(
    private readonly db: GatewayDatabase,
    private readonly accountManager: AccountManager,
    private readonly registrationManager: ChatgptRegistrationManager,
  ) {}

  start() {
    this.resetTimer();
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async runOnce(trigger: "startup" | "interval" | "settings" = "interval") {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      const settings = getAccountAutomationSettings(this.db);
      if (!settings.autoRegisterEnabled) {
        return;
      }

      const accounts = this.accountManager.listAccounts();
      const availableCount = countAvailablePoolAccounts(accounts);
      const missingCount = getMissingPoolAccountCount(accounts, settings.autoRegisterThreshold);

      if (missingCount <= 0 || this.registrationManager.hasRunningTask()) {
        return;
      }

      const batchSize = Math.min(settings.autoRegisterBatchSize, missingCount);
      this.db.logRuntime({
        level: "info",
        scope: "auto-register",
        event: "replenish.started",
        message: "账号池低于阈值，开始自动补号",
        detailsJson: JSON.stringify({
          trigger,
          availableCount,
          threshold: settings.autoRegisterThreshold,
          batchSize,
        }),
        createdAt: nowIso(),
      });

      for (let index = 0; index < batchSize; index += 1) {
        if (this.registrationManager.hasRunningTask()) {
          break;
        }

        await this.registrationManager.runRegistration({
          trigger: "threshold",
          timeoutMs: settings.autoRegisterTimeoutMs,
          headless: settings.autoRegisterHeadless,
          browserExecutablePath: settings.managedBrowserExecutablePath || undefined,
        });
      }
    } finally {
      this.running = false;
      this.resetTimer();
    }
  }

  private resetTimer() {
    this.stop();
    const settings = getAccountAutomationSettings(this.db);
    this.timer = setTimeout(() => {
      void this.runOnce("interval");
    }, settings.autoRegisterCheckIntervalMs);
  }
}
