import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = process.cwd();
const dataDir = resolve(rootDir, "data");

mkdirSync(dataDir, { recursive: true });

const toNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBoolean = (value: string | undefined, fallback: boolean) => {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }

  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }

  return fallback;
};

const mockUpstreamPort = toNumber(process.env.MOCK_UPSTREAM_PORT, 4010);

export const config = {
  gatewayPort: toNumber(process.env.GATEWAY_PORT, 4000),
  mockUpstreamPort,
  dbFile: process.env.GATEWAY_DB_FILE ?? resolve(dataDir, "quota-gateway.sqlite"),
  browserProfileDir:
    process.env.BROWSER_PROFILE_DIR ?? resolve(dataDir, "browser-profiles"),
  browserExecutablePath: process.env.BROWSER_EXECUTABLE_PATH ?? "",
  pollIntervalMs: toNumber(process.env.POLL_INTERVAL_MS, 180_000),
  chatgptCaptureTimeoutMs: toNumber(process.env.CHATGPT_CAPTURE_TIMEOUT_MS, 10 * 60_000),
  chatgptCapturePollIntervalMs: toNumber(process.env.CHATGPT_CAPTURE_POLL_INTERVAL_MS, 3_000),
  cooldownMs: toNumber(process.env.COOLDOWN_MS, 15 * 60_000),
  stickyTtlMs: toNumber(process.env.SESSION_STICKY_TTL_MS, 20 * 60_000),
  maxProxyAttempts: toNumber(process.env.MAX_PROXY_ATTEMPTS, 2),
  maxConcurrentPerAccount: toNumber(process.env.MAX_CONCURRENT_PER_ACCOUNT, 4),
  stickyMinWindowRatio: Number(process.env.STICKY_MIN_WINDOW_RATIO ?? "0.15"),
  stickyMinWeeklyRatio: Number(process.env.STICKY_MIN_WEEKLY_RATIO ?? "0.08"),
  enableDemoSeeds: toBoolean(process.env.ENABLE_DEMO_SEEDS, false),
  defaultAccountProvider: process.env.DEFAULT_ACCOUNT_PROVIDER ?? "chatgpt-web-session",
  defaultUpstreamBaseUrl: process.env.DEFAULT_UPSTREAM_BASE_URL ?? "https://chatgpt.com",
  defaultQuotaPath: process.env.DEFAULT_QUOTA_PATH ?? "/backend-api/wham/usage",
  defaultProxyPathPrefix: process.env.DEFAULT_PROXY_PATH_PREFIX ?? "",
};

export const schedulerWeights = {
  weekly: 0.35,
  window: 0.4,
  health: 0.2,
  error: 0.15,
  switching: 0.12,
  stickyBonus: 0.08,
};
