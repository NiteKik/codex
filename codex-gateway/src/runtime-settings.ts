import { config } from "./config.js";
import type { GatewayDatabase } from "./db/database.js";

export interface AccountAutomationSettings {
  tempMailBaseUrl: string;
  tempMailAdminPassword: string;
  tempMailSitePassword: string;
  tempMailDefaultDomain: string;
  managedBrowserExecutablePath: string;
  autoRegisterEnabled: boolean;
  enableFreeAccountScheduling: boolean;
  autoRegisterThreshold: number;
  autoRegisterBatchSize: number;
  autoRegisterCheckIntervalMs: number;
  autoRegisterTimeoutMs: number;
  autoRegisterHeadless: boolean;
}

export const accountAutomationRanges = {
  threshold: {
    min: 1,
    max: 200,
  },
  batchSize: {
    min: 1,
    max: 20,
  },
  checkIntervalSeconds: {
    min: 10,
    max: 3600,
  },
  timeoutSeconds: {
    min: 60,
    max: 1800,
  },
} as const;

const settingKeys = {
  tempMailBaseUrl: "temp_mail_base_url",
  tempMailAdminPassword: "temp_mail_admin_password",
  tempMailSitePassword: "temp_mail_site_password",
  tempMailDefaultDomain: "temp_mail_default_domain",
  managedBrowserExecutablePath: "managed_browser_executable_path",
  autoRegisterEnabled: "auto_register_enabled",
  enableFreeAccountScheduling: "enable_free_account_scheduling",
  autoRegisterThreshold: "auto_register_threshold",
  autoRegisterBatchSize: "auto_register_batch_size",
  autoRegisterCheckIntervalMs: "auto_register_check_interval_ms",
  autoRegisterTimeoutMs: "auto_register_timeout_ms",
  autoRegisterHeadless: "auto_register_headless",
} as const;

const readStringSetting = (db: GatewayDatabase, key: string, fallback: string) =>
  db.getRuntimeSetting(key) ?? fallback;

const readBooleanSetting = (db: GatewayDatabase, key: string, fallback: boolean) => {
  const stored = db.getRuntimeSetting(key);
  if (stored === null) {
    return fallback;
  }

  const normalized = stored.trim().toLowerCase();
  if (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  ) {
    return true;
  }
  if (
    normalized === "0" ||
    normalized === "false" ||
    normalized === "no" ||
    normalized === "off"
  ) {
    return false;
  }

  return fallback;
};

const readIntSetting = (
  db: GatewayDatabase,
  key: string,
  fallback: number,
  min: number,
  max: number,
) => {
  const stored = db.getRuntimeSetting(key);
  if (stored === null) {
    return fallback;
  }

  const parsed = Number(stored);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

export const getAccountAutomationSettings = (db: GatewayDatabase): AccountAutomationSettings => ({
  tempMailBaseUrl: readStringSetting(db, settingKeys.tempMailBaseUrl, config.tempMailBaseUrl),
  tempMailAdminPassword: readStringSetting(
    db,
    settingKeys.tempMailAdminPassword,
    config.tempMailAdminPassword,
  ),
  tempMailSitePassword: readStringSetting(
    db,
    settingKeys.tempMailSitePassword,
    config.tempMailSitePassword,
  ),
  tempMailDefaultDomain: readStringSetting(
    db,
    settingKeys.tempMailDefaultDomain,
    config.tempMailDefaultDomain,
  ),
  managedBrowserExecutablePath: readStringSetting(
    db,
    settingKeys.managedBrowserExecutablePath,
    config.managedBrowserExecutablePath,
  ),
  autoRegisterEnabled: readBooleanSetting(
    db,
    settingKeys.autoRegisterEnabled,
    config.autoRegisterEnabled,
  ),
  enableFreeAccountScheduling: readBooleanSetting(
    db,
    settingKeys.enableFreeAccountScheduling,
    config.enableFreeAccountScheduling,
  ),
  autoRegisterThreshold: readIntSetting(
    db,
    settingKeys.autoRegisterThreshold,
    config.autoRegisterThreshold,
    accountAutomationRanges.threshold.min,
    accountAutomationRanges.threshold.max,
  ),
  autoRegisterBatchSize: readIntSetting(
    db,
    settingKeys.autoRegisterBatchSize,
    config.autoRegisterBatchSize,
    accountAutomationRanges.batchSize.min,
    accountAutomationRanges.batchSize.max,
  ),
  autoRegisterCheckIntervalMs: readIntSetting(
    db,
    settingKeys.autoRegisterCheckIntervalMs,
    config.autoRegisterCheckIntervalMs,
    accountAutomationRanges.checkIntervalSeconds.min * 1000,
    accountAutomationRanges.checkIntervalSeconds.max * 1000,
  ),
  autoRegisterTimeoutMs: readIntSetting(
    db,
    settingKeys.autoRegisterTimeoutMs,
    config.autoRegisterTimeoutMs,
    accountAutomationRanges.timeoutSeconds.min * 1000,
    accountAutomationRanges.timeoutSeconds.max * 1000,
  ),
  autoRegisterHeadless: readBooleanSetting(
    db,
    settingKeys.autoRegisterHeadless,
    config.autoRegisterHeadless,
  ),
});

export const updateAccountAutomationSettings = (
  db: GatewayDatabase,
  patch: Partial<AccountAutomationSettings>,
) => {
  if (patch.tempMailBaseUrl !== undefined) {
    db.setRuntimeSetting(settingKeys.tempMailBaseUrl, patch.tempMailBaseUrl.trim());
  }
  if (patch.tempMailAdminPassword !== undefined) {
    db.setRuntimeSetting(settingKeys.tempMailAdminPassword, patch.tempMailAdminPassword.trim());
  }
  if (patch.tempMailSitePassword !== undefined) {
    db.setRuntimeSetting(settingKeys.tempMailSitePassword, patch.tempMailSitePassword.trim());
  }
  if (patch.tempMailDefaultDomain !== undefined) {
    db.setRuntimeSetting(settingKeys.tempMailDefaultDomain, patch.tempMailDefaultDomain.trim());
  }
  if (patch.managedBrowserExecutablePath !== undefined) {
    db.setRuntimeSetting(
      settingKeys.managedBrowserExecutablePath,
      patch.managedBrowserExecutablePath.trim(),
    );
  }
  if (patch.autoRegisterEnabled !== undefined) {
    db.setRuntimeSetting(settingKeys.autoRegisterEnabled, patch.autoRegisterEnabled ? "1" : "0");
  }
  if (patch.enableFreeAccountScheduling !== undefined) {
    db.setRuntimeSetting(
      settingKeys.enableFreeAccountScheduling,
      patch.enableFreeAccountScheduling ? "1" : "0",
    );
  }
  if (patch.autoRegisterThreshold !== undefined) {
    db.setRuntimeSetting(settingKeys.autoRegisterThreshold, String(patch.autoRegisterThreshold));
  }
  if (patch.autoRegisterBatchSize !== undefined) {
    db.setRuntimeSetting(settingKeys.autoRegisterBatchSize, String(patch.autoRegisterBatchSize));
  }
  if (patch.autoRegisterCheckIntervalMs !== undefined) {
    db.setRuntimeSetting(
      settingKeys.autoRegisterCheckIntervalMs,
      String(patch.autoRegisterCheckIntervalMs),
    );
  }
  if (patch.autoRegisterTimeoutMs !== undefined) {
    db.setRuntimeSetting(settingKeys.autoRegisterTimeoutMs, String(patch.autoRegisterTimeoutMs));
  }
  if (patch.autoRegisterHeadless !== undefined) {
    db.setRuntimeSetting(settingKeys.autoRegisterHeadless, patch.autoRegisterHeadless ? "1" : "0");
  }

  return getAccountAutomationSettings(db);
};
