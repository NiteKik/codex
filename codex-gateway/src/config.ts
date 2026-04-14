import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const rootDir = process.cwd();
const dataDir = resolve(rootDir, "data");

mkdirSync(dataDir, { recursive: true });

const resolveDefaultCdkFilePath = () => {
  const localCdkPath = resolve(dataDir, "CDK.txt");
  const workspaceCdkPath = resolve(rootDir, "..", "data", "CDK.txt");
  const candidates = [localCdkPath, workspaceCdkPath];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }

    const content = readFileSync(candidate, "utf8");
    if (content.trim().length > 0) {
      return candidate;
    }
  }

  if (existsSync(localCdkPath)) {
    return localCdkPath;
  }
  if (existsSync(workspaceCdkPath)) {
    return workspaceCdkPath;
  }

  return localCdkPath;
};

const resolveGatewayAccessToken = () => {
  const tokenFromEnv = process.env.GATEWAY_ACCESS_TOKEN?.trim();
  if (tokenFromEnv) {
    return {
      token: tokenFromEnv,
      source: "env" as const,
      filePath: null,
    };
  }

  const configuredFilePath = process.env.GATEWAY_ACCESS_TOKEN_FILE?.trim();
  const tokenFilePath = configuredFilePath
    ? resolve(rootDir, configuredFilePath)
    : resolve(dataDir, "gateway-access-token.txt");
  mkdirSync(dirname(tokenFilePath), { recursive: true });

  if (existsSync(tokenFilePath)) {
    const persisted = readFileSync(tokenFilePath, "utf8").trim();
    if (persisted.length > 0) {
      return {
        token: persisted,
        source: "file" as const,
        filePath: tokenFilePath,
      };
    }
  }

  const generated = `gk_${randomBytes(24).toString("hex")}`;
  writeFileSync(tokenFilePath, `${generated}\n`, { encoding: "utf8" });

  return {
    token: generated,
    source: "generated" as const,
    filePath: tokenFilePath,
  };
};

const toNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toRatio = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, parsed));
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
const gatewayAccessTokenConfig = resolveGatewayAccessToken();

export const config = {
  gatewayPort: toNumber(process.env.GATEWAY_PORT, 4000),
  mockUpstreamPort,
  dbFile: process.env.GATEWAY_DB_FILE ?? resolve(dataDir, "quota-gateway.sqlite"),
  cdkFilePath: process.env.CDK_FILE_PATH ?? resolveDefaultCdkFilePath(),
  cdkActivationBaseUrl:
    process.env.CDK_ACTIVATION_BASE_URL ?? "https://gpt.86gamestore.com/api",
  cdkActivationTimeoutMs: Math.max(1_000, toNumber(process.env.CDK_ACTIVATION_TIMEOUT_MS, 20_000)),
  defaultCdkProductType:
    process.env.DEFAULT_CDK_PRODUCT_TYPE?.trim() || "chatgpt_plus_1m",
  browserProfileDir:
    process.env.BROWSER_PROFILE_DIR ?? resolve(dataDir, "browser-profiles"),
  browserExecutablePath: process.env.BROWSER_EXECUTABLE_PATH ?? "",
  managedBrowserExecutablePath:
    process.env.MANAGED_BROWSER_EXECUTABLE_PATH ?? process.env.BROWSER_EXECUTABLE_PATH ?? "",
  pollIntervalMs: toNumber(process.env.POLL_INTERVAL_MS, 30_000),
  chatgptCaptureTimeoutMs: toNumber(process.env.CHATGPT_CAPTURE_TIMEOUT_MS, 10 * 60_000),
  chatgptCapturePollIntervalMs: toNumber(process.env.CHATGPT_CAPTURE_POLL_INTERVAL_MS, 3_000),
  autoRegisterEnabled: toBoolean(process.env.AUTO_REGISTER_ENABLED, false),
  autoRegisterThreshold: Math.max(1, toNumber(process.env.AUTO_REGISTER_THRESHOLD, 15)),
  autoRegisterBatchSize: Math.max(1, toNumber(process.env.AUTO_REGISTER_BATCH_SIZE, 1)),
  autoRegisterCheckIntervalMs: Math.max(
    10_000,
    toNumber(process.env.AUTO_REGISTER_CHECK_INTERVAL_MS, 60_000),
  ),
  autoRegisterTimeoutMs: Math.max(
    60_000,
    toNumber(process.env.AUTO_REGISTER_TIMEOUT_MS, 8 * 60_000),
  ),
  autoRegisterHeadless: toBoolean(process.env.AUTO_REGISTER_HEADLESS, false),
  enableFreeAccountScheduling: toBoolean(process.env.ENABLE_FREE_ACCOUNT_SCHEDULING, true),
  tempMailBaseUrl: process.env.TEMP_MAIL_BASE_URL?.trim() ?? "",
  tempMailAdminPassword: process.env.TEMP_MAIL_ADMIN_PASSWORD?.trim() ?? "",
  tempMailSitePassword: process.env.TEMP_MAIL_SITE_PASSWORD?.trim() ?? "",
  tempMailDefaultDomain: process.env.TEMP_MAIL_DEFAULT_DOMAIN?.trim() ?? "",
  cooldownMs: toNumber(process.env.COOLDOWN_MS, 15 * 60_000),
  stickyTtlMs: toNumber(process.env.SESSION_STICKY_TTL_MS, 20 * 60_000),
  maxProxyAttempts: toNumber(process.env.MAX_PROXY_ATTEMPTS, 2),
  maxConcurrentPerAccount: toNumber(process.env.MAX_CONCURRENT_PER_ACCOUNT, 4),
  stickyMinWindowRatio: Number(process.env.STICKY_MIN_WINDOW_RATIO ?? "0.05"),
  stickyMinWeeklyRatio: Number(process.env.STICKY_MIN_WEEKLY_RATIO ?? "0.02"),
  estimatedUnitBytes: Math.max(256, toNumber(process.env.ESTIMATED_UNIT_BYTES, 2500)),
  estimatedContextOverheadUnits: Math.max(
    0,
    toNumber(process.env.ESTIMATED_CONTEXT_OVERHEAD_UNITS, 2),
  ),
  maxEstimatedUnitsPerRequest: Math.max(
    1,
    toNumber(process.env.MAX_ESTIMATED_UNITS_PER_REQUEST, 12),
  ),
  preemptiveWeeklyReserveRatio: toRatio(process.env.PREEMPTIVE_WEEKLY_RESERVE_RATIO, 0.02),
  preemptiveWindowReserveRatio: toRatio(process.env.PREEMPTIVE_WINDOW_RESERVE_RATIO, 0.05),
  preemptiveWeeklyReserveUnits: Math.max(
    0,
    toNumber(process.env.PREEMPTIVE_WEEKLY_RESERVE_UNITS, 0),
  ),
  preemptiveWindowReserveUnits: Math.max(
    0,
    toNumber(process.env.PREEMPTIVE_WINDOW_RESERVE_UNITS, 0),
  ),
  enableDemoSeeds: toBoolean(process.env.ENABLE_DEMO_SEEDS, false),
  defaultAccountProvider: process.env.DEFAULT_ACCOUNT_PROVIDER ?? "chatgpt-web-session",
  defaultUpstreamBaseUrl: process.env.DEFAULT_UPSTREAM_BASE_URL ?? "https://chatgpt.com",
  defaultQuotaPath: process.env.DEFAULT_QUOTA_PATH ?? "/backend-api/wham/usage",
  defaultProxyPathPrefix: process.env.DEFAULT_PROXY_PATH_PREFIX ?? "",
  exposeVirtualWhamUsage: toBoolean(process.env.EXPOSE_VIRTUAL_WHAM_USAGE, true),
  requireGatewayAccessToken: toBoolean(process.env.REQUIRE_GATEWAY_ACCESS_TOKEN, true),
  gatewayAccessToken: gatewayAccessTokenConfig.token,
  gatewayAccessTokenSource: gatewayAccessTokenConfig.source,
  gatewayAccessTokenFilePath: gatewayAccessTokenConfig.filePath,
};

export const schedulerWeights = {
  weekly: 0.35,
  window: 0.4,
  health: 0.2,
  error: 0.15,
  switching: 0.12,
  stickyBonus: 0.08,
};
