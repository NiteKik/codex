import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { GatewayDatabase } from "./db/database.js";
import {
  getAccountAutomationSettings,
  updateAccountAutomationSettings,
} from "./runtime-settings.js";

const databasesToClose: GatewayDatabase[] = [];

afterEach(() => {
  while (databasesToClose.length > 0) {
    databasesToClose.pop()?.close();
  }
});

const createDatabase = () => {
  const dir = mkdtempSync(join(process.cwd(), ".tmp-runtime-settings-"));
  const db = new GatewayDatabase(join(dir, "settings.sqlite"));
  db.init();
  databasesToClose.push(db);
  return db;
};

describe("runtime-settings", () => {
  test("persists automation settings", () => {
    const db = createDatabase();

    updateAccountAutomationSettings(db, {
      tempMailBaseUrl: "https://mail.example.com",
      tempMailAdminPassword: "admin-secret",
      tempMailSitePassword: "site-secret",
      tempMailDefaultDomain: "example.com",
      managedBrowserExecutablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      autoRegisterEnabled: true,
      enableFreeAccountScheduling: false,
      autoRegisterThreshold: 15,
      autoRegisterBatchSize: 2,
      autoRegisterCheckIntervalMs: 45_000,
      autoRegisterTimeoutMs: 600_000,
      autoRegisterHeadless: true,
    });

    expect(getAccountAutomationSettings(db)).toMatchObject({
      tempMailBaseUrl: "https://mail.example.com",
      tempMailAdminPassword: "admin-secret",
      tempMailSitePassword: "site-secret",
      tempMailDefaultDomain: "example.com",
      managedBrowserExecutablePath:
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      autoRegisterEnabled: true,
      enableFreeAccountScheduling: false,
      autoRegisterThreshold: 15,
      autoRegisterBatchSize: 2,
      autoRegisterCheckIntervalMs: 45_000,
      autoRegisterTimeoutMs: 600_000,
      autoRegisterHeadless: true,
    });
  });
});
