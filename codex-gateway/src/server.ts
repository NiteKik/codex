import { join } from "node:path";
import Fastify from "fastify";
import { AccountManager } from "./accounts/account-manager.js";
import { GatewayTokenManager } from "./auth/gateway-token-manager.js";
import { config } from "./config.js";
import { GatewayDatabase } from "./db/database.js";
import { buildSeededSnapshot, createDemoSeeds } from "./demo/demo-data.js";
import {
  CdkActivationService,
  type CdkActivationResult,
} from "./integrations/cdk-activation-service.js";
import { AccountAutoRegisterReplenisher } from "./integrations/account-auto-register-replenisher.js";
import { ChatgptCaptureManager } from "./integrations/chatgpt-capture-manager.js";
import { CodexConfigAutoManager } from "./integrations/codex-config-auto-manager.js";
import { ChatgptRegistrationManager } from "./integrations/chatgpt-registration-manager.js";
import { ChatgptSessionRefreshManager } from "./integrations/chatgpt-session-refresh-manager.js";
import { GenericHttpProvider } from "./providers/generic-http-provider.js";
import { createMockUpstreamServer } from "./providers/mock-upstream.js";
import { ProxyService } from "./proxy/proxy-service.js";
import { QuotaPoller } from "./quota/quota-poller.js";
import { QuotaVirtualizer } from "./quota/quota-virtualizer.js";
import {
  accountAutomationRanges,
  getAccountAutomationSettings,
  updateAccountAutomationSettings,
} from "./runtime-settings.js";
import { Scheduler } from "./scheduler/scheduler.js";
import { SessionManager } from "./session/session-manager.js";
import type {
  Account,
  AccountStatus,
  AuthConfig,
  QuotaSnapshot,
  WorkspaceContext,
  WorkspaceKind,
} from "./types.js";

const accountStatuses = new Set<AccountStatus>(["healthy", "exhausted", "cooling", "invalid"]);
const workspaceKinds = new Set<WorkspaceKind>(["personal", "team", "unknown"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readRequiredString = (source: Record<string, unknown>, key: string) => {
  const value = source[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Field "${key}" is required.`);
  }

  return value.trim();
};

const readOptionalString = (source: Record<string, unknown>, key: string, fallback = "") => {
  const value = source[key];

  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value !== "string") {
    throw new Error(`Field "${key}" must be a string.`);
  }

  return value.trim();
};

const readNullableOptionalString = (
  source: Record<string, unknown>,
  key: string,
  fallback: string | null = null,
) => {
  const value = source[key];
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value !== "string") {
    throw new Error(`Field "${key}" must be a string.`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const parseOptionalStringMap = (
  value: unknown,
  fieldPath: string,
): Record<string, string> | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (!isRecord(value)) {
    throw new Error(`Field "${fieldPath}" must be an object with string values.`);
  }

  const entries = Object.entries(value).map(([key, mapValue]) => {
    if (typeof mapValue !== "string") {
      throw new Error(`Field "${fieldPath}.${key}" must be a string.`);
    }
    return [key, mapValue] as const;
  });

  return entries.length > 0 ? Object.fromEntries(entries) : null;
};

const parseWorkspaceKind = (value: unknown, fallback: WorkspaceKind = "unknown"): WorkspaceKind => {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (workspaceKinds.has(normalized as WorkspaceKind)) {
    return normalized as WorkspaceKind;
  }

  return fallback;
};

const normalizeWorkspaceContext = (
  workspace: WorkspaceContext,
  fallbackKind: WorkspaceKind = "unknown",
): WorkspaceContext => ({
  kind: workspaceKinds.has(workspace.kind) ? workspace.kind : fallbackKind,
  id: workspace.id?.trim() ? workspace.id.trim() : null,
  name: workspace.name?.trim() ? workspace.name.trim() : null,
  headers:
    workspace.headers && Object.keys(workspace.headers).length > 0 ? workspace.headers : null,
});

const parseWorkspacePayload = (
  body: Record<string, unknown>,
  existing: WorkspaceContext | null,
): WorkspaceContext => {
  const existingWorkspace = normalizeWorkspaceContext(
    existing ?? {
      kind: "unknown",
      id: null,
      name: null,
      headers: null,
    },
  );

  if (body.workspace === undefined) {
    return existingWorkspace;
  }

  if (!isRecord(body.workspace)) {
    throw new Error('Field "workspace" must be an object.');
  }

  const workspaceBody = body.workspace;
  return normalizeWorkspaceContext({
    kind: parseWorkspaceKind(workspaceBody.kind, existingWorkspace.kind),
    id: readNullableOptionalString(workspaceBody, "id", existingWorkspace.id),
    name: readNullableOptionalString(workspaceBody, "name", existingWorkspace.name),
    headers:
      workspaceBody.headers === undefined
        ? existingWorkspace.headers
        : parseOptionalStringMap(workspaceBody.headers, "workspace.headers"),
  });
};

const isRecordWithRateLimit = (
  value: unknown,
): value is Record<string, unknown> & { rate_limit: Record<string, unknown> } =>
  isRecord(value) && isRecord(value.rate_limit);

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const toIsoFromEpochSeconds = (value: unknown) => {
  const epochSeconds = toNumber(value);
  if (epochSeconds === null) {
    return null;
  }

  const date = new Date(epochSeconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const parseWhamWindow = (value: unknown) => {
  if (!isRecord(value)) {
    return null;
  }

  const usedPercent = toNumber(value.used_percent);
  if (usedPercent === null) {
    return null;
  }

  const normalizedUsedPercent = Math.min(100, Math.max(0, usedPercent));
  return {
    total: 100,
    used: normalizedUsedPercent,
    resetAt: toIsoFromEpochSeconds(value.reset_at) ?? new Date().toISOString(),
  };
};

const parseCapturedWhamUsage = (payload: unknown, accountId: string): QuotaSnapshot | null => {
  if (!isRecordWithRateLimit(payload)) {
    return null;
  }
  const payloadRecord = payload as Record<string, unknown> & {
    rate_limit: Record<string, unknown>;
  };

  const primaryWindow = parseWhamWindow(payloadRecord.rate_limit["primary_window"]);
  const secondaryWindow = parseWhamWindow(payloadRecord.rate_limit["secondary_window"]);
  const weeklyWindow = secondaryWindow ?? primaryWindow;
  const window5hWindow = primaryWindow ?? secondaryWindow;

  if (!weeklyWindow || !window5hWindow) {
    return null;
  }

  const planTypeRaw =
    typeof payloadRecord.plan_type === "string"
      ? payloadRecord.plan_type.trim().toLowerCase()
      : "";
  const planType = planTypeRaw.length > 0 ? planTypeRaw : null;
  const subscriptionHint = planType
    ? {
        planType,
        status: planType.includes("trial") ? ("trial" as const) : ("active" as const),
      }
    : undefined;

  return {
    accountId,
    weeklyTotal: weeklyWindow.total,
    weeklyUsed: weeklyWindow.used,
    weeklyResetAt: weeklyWindow.resetAt,
    window5hTotal: window5hWindow.total,
    window5hUsed: window5hWindow.used,
    window5hResetAt: window5hWindow.resetAt,
    sampleTime: new Date().toISOString(),
    source: "manual",
    ...(subscriptionHint ? { subscriptionHint } : {}),
  };
};

const readOptionalPositiveInt = (
  source: Record<string, unknown>,
  key: string,
  fallback: number,
  max = 500,
) => {
  const value = source[key];
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Field "${key}" must be a number.`);
  }

  return Math.min(max, Math.max(1, Math.floor(parsed)));
};

const parseRequiredPollIntervalSeconds = (
  source: Record<string, unknown>,
  key: string,
  minSeconds: number,
  maxSeconds: number,
) => {
  if (!hasOwn(source, key)) {
    throw new Error(`Field "${key}" is required.`);
  }

  const raw = source[key];
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(`Field "${key}" must be an integer.`);
  }

  if (parsed < minSeconds || parsed > maxSeconds) {
    throw new Error(`Field "${key}" must be between ${minSeconds} and ${maxSeconds}.`);
  }

  return parsed;
};

const parseOptionalTtlSeconds = (source: Record<string, unknown>, key: string) => {
  if (!hasOwn(source, key)) {
    return null;
  }

  const raw = source[key];
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(`Field "${key}" must be an integer.`);
  }

  if (parsed < 0 || parsed > 10 * 365 * 24 * 3600) {
    throw new Error(`Field "${key}" must be between 0 and 315360000.`);
  }

  return parsed === 0 ? null : parsed;
};

const parseOptionalBoolean = (
  source: Record<string, unknown>,
  key: string,
  fallback = false,
) => {
  if (!hasOwn(source, key)) {
    return fallback;
  }

  const value = source[key];
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
      return true;
    }
    if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
      return false;
    }
  }

  return fallback;
};

const normalizePlanType = (value: string | null | undefined) =>
  value?.trim().toLowerCase() ?? "";

const isFreePlanType = (value: string | null | undefined) => normalizePlanType(value) === "free";

const inferPlanTypeFromProductType = (productType: string) => {
  const normalized = productType.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized.includes("plus")) {
    return "plus";
  }
  if (normalized.includes("pro")) {
    return "pro";
  }
  if (normalized.includes("team")) {
    return "team";
  }
  if (normalized.includes("enterprise")) {
    return "enterprise";
  }

  return null;
};

const accountSessionInfoSettingKey = (accountId: string) => `account_session_info:${accountId}`;

const buildManagedTokenDefaultName = () => {
  const timestamp = new Date()
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\..+$/, "");
  return `token-${timestamp}`;
};

const makeAccountIdFromEmail = (email: string) =>
  `acc_${email
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replaceAll(/^_+|_+$/g, "")}`;

const parseAuthConfig = (value: unknown): AuthConfig => {
  if (!isRecord(value)) {
    throw new Error('Field "auth" must be an object.');
  }

  const mode = readRequiredString(value, "mode");
  if (mode !== "bearer" && mode !== "static-headers") {
    throw new Error('Field "auth.mode" must be "bearer" or "static-headers".');
  }

  if (mode === "bearer") {
    return {
      mode,
      token: readRequiredString(value, "token"),
    };
  }

  const headers = value.headers;
  if (!isRecord(headers)) {
    throw new Error('Field "auth.headers" must be an object when auth.mode is "static-headers".');
  }

  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([headerKey, headerValue]) => {
      if (typeof headerValue !== "string") {
        throw new Error(`Header "${headerKey}" must be a string.`);
      }

      return [headerKey, headerValue];
    }),
  );

  return {
    mode,
    headers: normalizedHeaders,
  };
};

const hasOwn = (source: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(source, key);

const authConfigsEqual = (left: AuthConfig, right: AuthConfig) =>
  JSON.stringify(left) === JSON.stringify(right);

const sanitizeAuthForAdmin = (auth: AuthConfig): AuthConfig => {
  if (auth.mode === "bearer") {
    return {
      mode: "bearer",
    };
  }

  return {
    mode: "static-headers",
    headers: Object.fromEntries(
      Object.keys(auth.headers ?? {}).map((headerKey) => [headerKey, "***"]),
    ),
  };
};

const normalizePathname = (url: string) => {
  const queryIndex = url.indexOf("?");
  return queryIndex >= 0 ? url.slice(0, queryIndex) : url;
};

const isGatewayProtectedPath = (url: string) => {
  const pathname = normalizePathname(url);
  return (
    pathname.startsWith("/proxy/") ||
    pathname.startsWith("/v1/") ||
    pathname.startsWith("/backend-api/") ||
    pathname === "/responses" ||
    pathname.startsWith("/responses/")
  );
};

const isVirtualWhamUsagePath = (url: string) => normalizePathname(url) === "/backend-api/wham/usage";

const readStringHeader = (value: unknown) => {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
    return value[0].trim();
  }

  return "";
};

const extractBearerToken = (authorizationValue: string) => {
  if (!authorizationValue) {
    return null;
  }

  const [scheme, token] = authorizationValue.split(/\s+/, 2);
  if (!scheme || !token) {
    return null;
  }

  return scheme.toLowerCase() === "bearer" ? token.trim() : null;
};

const resolveGatewayTokenFromHeaders = (headers: Record<string, unknown>) => {
  const bearerToken = extractBearerToken(readStringHeader(headers.authorization));
  if (bearerToken) {
    return bearerToken;
  }

  const directToken = readStringHeader(headers["x-gateway-token"]);
  return directToken.length > 0 ? directToken : null;
};

const parseAccountPayload = (
  body: unknown,
  defaults: {
    provider: string;
    upstreamBaseUrl: string;
    quotaPath: string;
    proxyPathPrefix: string;
    status: AccountStatus;
  },
  existing: Account | null = null,
): Pick<
  Account,
  | "id"
  | "name"
  | "provider"
  | "upstreamBaseUrl"
  | "quotaPath"
  | "proxyPathPrefix"
  | "loginEmail"
  | "loginPassword"
  | "managedByGateway"
  | "provisionSource"
  | "provisionState"
  | "auth"
  | "workspace"
  | "status"
> => {
  if (!isRecord(body)) {
    throw new Error("Request body must be an object.");
  }

  const status = readOptionalString(
    body,
    "status",
    existing?.status ?? defaults.status,
  ) as AccountStatus;
  if (!accountStatuses.has(status)) {
    throw new Error('Field "status" must be healthy, exhausted, cooling, or invalid.');
  }

  const auth = body.auth === undefined ? existing?.auth : parseAuthConfig(body.auth);
  if (!auth) {
    throw new Error('Field "auth" is required.');
  }
  const workspace = parseWorkspacePayload(body, existing?.workspace ?? null);
  const loginEmail = readNullableOptionalString(body, "loginEmail", existing?.loginEmail ?? null);
  const loginPassword = readNullableOptionalString(
    body,
    "loginPassword",
    existing?.loginPassword ?? null,
  );
  const managedByGateway = parseOptionalBoolean(
    body,
    "managedByGateway",
    existing?.managedByGateway ?? false,
  );
  const provisionSource =
    readOptionalString(body, "provisionSource", existing?.provisionSource ?? "manual") || "manual";
  const provisionState =
    readOptionalString(body, "provisionState", existing?.provisionState ?? "ready") || "ready";

  return {
    id: readRequiredString(body, "id"),
    name: readRequiredString(body, "name"),
    provider: readOptionalString(body, "provider", existing?.provider ?? defaults.provider),
    upstreamBaseUrl: readOptionalString(
      body,
      "upstreamBaseUrl",
      existing?.upstreamBaseUrl ?? defaults.upstreamBaseUrl,
    ),
    quotaPath: readOptionalString(body, "quotaPath", existing?.quotaPath ?? defaults.quotaPath),
    proxyPathPrefix: readOptionalString(
      body,
      "proxyPathPrefix",
      existing?.proxyPathPrefix ?? defaults.proxyPathPrefix,
    ),
    loginEmail,
    loginPassword,
    managedByGateway,
    provisionSource:
      provisionSource === "session-import" ||
      provisionSource === "browser-capture" ||
      provisionSource === "auto-register"
        ? provisionSource
        : "manual",
    provisionState:
      provisionState === "idle" ||
      provisionState === "running" ||
      provisionState === "failed"
        ? provisionState
        : "ready",
    auth,
    workspace,
    status,
  };
};

export const createGatewayRuntime = () => {
  const pollIntervalMinSeconds = 5;
  const pollIntervalMaxSeconds = 3600;
  const db = new GatewayDatabase(config.dbFile);
  db.init();
  const tokenManager = new GatewayTokenManager(db, config.gatewayAccessToken);

  const accountManager = new AccountManager(db, config.cooldownMs);
  const provider = new GenericHttpProvider();
  const sessionManager = new SessionManager(db, config.stickyTtlMs);
  const quotaVirtualizer = new QuotaVirtualizer(db);
  const scheduler = new Scheduler(
    db,
    accountManager,
    sessionManager,
    quotaVirtualizer,
    config.maxConcurrentPerAccount,
    config.stickyMinWindowRatio,
    config.stickyMinWeeklyRatio,
    config.preemptiveWeeklyReserveRatio,
    config.preemptiveWindowReserveRatio,
    config.preemptiveWeeklyReserveUnits,
    config.preemptiveWindowReserveUnits,
  );
  const configuredPollIntervalMs = db.getPollIntervalMs() ?? config.pollIntervalMs;
  const sessionRefreshManager = new ChatgptSessionRefreshManager(
    join(config.browserProfileDir, "managed-refresh"),
    db,
    accountManager,
  );
  const poller = new QuotaPoller(
    db,
    accountManager,
    provider,
    configuredPollIntervalMs,
    sessionRefreshManager,
  );
  const chatgptCaptureManager = new ChatgptCaptureManager(config.browserProfileDir);
  const chatgptRegistrationManager = new ChatgptRegistrationManager(
    join(config.browserProfileDir, "managed-register"),
    db,
    accountManager,
    provider,
  );
  const codexConfigAutoManager = new CodexConfigAutoManager(db, {
    gatewayPort: config.gatewayPort,
    gatewayWorkingDir: process.cwd(),
  });
  codexConfigAutoManager.initialize();
  const autoRegisterReplenisher = new AccountAutoRegisterReplenisher(
    db,
    accountManager,
    chatgptRegistrationManager,
  );
  const cdkActivationService = new CdkActivationService({
    cdkFilePath: config.cdkFilePath,
    activationBaseUrl: config.cdkActivationBaseUrl,
    requestTimeoutMs: config.cdkActivationTimeoutMs,
    defaultProductType: config.defaultCdkProductType,
  });
  const proxyService = new ProxyService(
    db,
    provider,
    accountManager,
    scheduler,
    sessionManager,
    quotaVirtualizer,
    sessionRefreshManager,
  );
  const serializeAccount = (accountId: string) => {
    const account = accountManager.getAccount(accountId);
    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    const { loginPassword: _loginPassword, ...safeAccount } = account;

    return {
      ...safeAccount,
      hasStoredPassword: Boolean(account.loginPassword),
      auth: sanitizeAuthForAdmin(account.auth),
      quota: quotaVirtualizer.getAccountQuotaState(account.id),
    };
  };

  const refreshQuotaForAccount = async (accountId: string, reason: string) => {
    const account = accountManager.getAccount(accountId);
    if (!account) {
      return;
    }

    try {
      const snapshot = await provider.fetchQuota(account);
      const workspaceUpdated = accountManager.mergeWorkspaceHint(accountId, snapshot.workspaceHint);
      const subscriptionUpdated = accountManager.mergeSubscriptionHint(
        accountId,
        snapshot.subscriptionHint,
      );
      accountManager.applyQuotaSnapshot({
        ...snapshot,
        source: "manual",
      });
      db.logRuntime({
        level: "info",
        scope: "cdk-activation",
        event: "activation.quota_refresh",
        message: "Post-upgrade quota refresh succeeded",
        accountId,
        detailsJson: JSON.stringify({
          reason,
          weeklyTotal: snapshot.weeklyTotal,
          weeklyUsed: snapshot.weeklyUsed,
          window5hTotal: snapshot.window5hTotal,
          window5hUsed: snapshot.window5hUsed,
          sampleTime: snapshot.sampleTime,
          workspaceUpdated,
          subscriptionUpdated,
        }),
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      db.logRuntime({
        level: "warn",
        scope: "cdk-activation",
        event: "activation.quota_refresh_failed",
        message: error instanceof Error ? error.message : "Post-upgrade quota refresh failed.",
        accountId,
        detailsJson: JSON.stringify({
          reason,
        }),
        createdAt: new Date().toISOString(),
      });
    }
  };

  const schedulePostUpgradeQuotaRefresh = (accountId: string) => {
    const followUpDelayMs = [15_000, 60_000];
    for (const delayMs of followUpDelayMs) {
      setTimeout(() => {
        void refreshQuotaForAccount(accountId, `cdk-upgrade+${Math.floor(delayMs / 1000)}s`);
      }, delayMs);
    }
  };

  if (config.enableDemoSeeds) {
    const seeds = createDemoSeeds(config.mockUpstreamPort);
    for (const seed of seeds) {
      accountManager.upsertAccount(seed.account);
      if (!db.getLatestQuotaSnapshot(seed.account.id)) {
        accountManager.applyQuotaSnapshot(buildSeededSnapshot(seed));
      }
    }
  }

  const app = Fastify({
    logger: false,
    bodyLimit: 10 * 1024 * 1024,
  });

  const shouldRequireGatewayAccessToken = () => {
    if (!config.requireGatewayAccessToken) {
      return false;
    }
    const status = codexConfigAutoManager.getStatus();
    if (!status.enabled) {
      return true;
    }
    return !(
      status.resolvedMode === "openai_base_url" ||
      status.resolvedMode === "openai_base_url_no_forced"
    );
  };

  app.addHook("onRequest", (request, reply, done) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header(
      "Access-Control-Allow-Headers",
      "content-type,x-session-id,x-codex-session,authorization,x-gateway-token",
    );
    reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    reply.header(
      "Access-Control-Expose-Headers",
      "x-session-id,x-routed-account-id,x-routing-reason,x-quota-source",
    );

    if (request.method === "OPTIONS") {
      reply.status(204).send();
      return;
    }

    if (
      request.method === "GET" &&
      config.exposeVirtualWhamUsage &&
      isVirtualWhamUsagePath(request.url)
    ) {
      done();
      return;
    }

    if (!shouldRequireGatewayAccessToken() || !isGatewayProtectedPath(request.url)) {
      done();
      return;
    }

    const inboundToken = resolveGatewayTokenFromHeaders(
      request.headers as unknown as Record<string, unknown>,
    );
    if (tokenManager.verifyToken(inboundToken)) {
      done();
      return;
    }

    reply.header("www-authenticate", 'Bearer realm="quota-gateway"');
    reply.status(401).send({
      error: "gateway_auth_required",
      message: "Missing or invalid gateway access token.",
    });
  });

  app.get("/healthz", async () => ({
    ok: true,
    service: "quota-gateway",
    pollIntervalMs: poller.getIntervalMs(),
  }));

  app.get("/admin/settings", async () => {
    const intervalMs = poller.getIntervalMs();
    const automationSettings = getAccountAutomationSettings(db);
    return {
      ok: true,
      pollIntervalMs: intervalMs,
      pollIntervalSeconds: Math.floor(intervalMs / 1000),
      pollIntervalRange: {
        minSeconds: pollIntervalMinSeconds,
        maxSeconds: pollIntervalMaxSeconds,
      },
      tempMailBaseUrl: automationSettings.tempMailBaseUrl,
      tempMailAdminPassword: automationSettings.tempMailAdminPassword,
      tempMailSitePassword: automationSettings.tempMailSitePassword,
      tempMailDefaultDomain: automationSettings.tempMailDefaultDomain,
      managedBrowserExecutablePath: automationSettings.managedBrowserExecutablePath,
      autoRegisterEnabled: automationSettings.autoRegisterEnabled,
      enableFreeAccountScheduling: automationSettings.enableFreeAccountScheduling,
      autoRegisterThreshold: automationSettings.autoRegisterThreshold,
      autoRegisterBatchSize: automationSettings.autoRegisterBatchSize,
      autoRegisterCheckIntervalSeconds: Math.floor(
        automationSettings.autoRegisterCheckIntervalMs / 1000,
      ),
      autoRegisterTimeoutSeconds: Math.floor(automationSettings.autoRegisterTimeoutMs / 1000),
      autoRegisterHeadless: automationSettings.autoRegisterHeadless,
      autoRegisterRanges: {
        threshold: accountAutomationRanges.threshold,
        batchSize: accountAutomationRanges.batchSize,
        checkIntervalSeconds: accountAutomationRanges.checkIntervalSeconds,
        timeoutSeconds: accountAutomationRanges.timeoutSeconds,
      },
    };
  });

  app.put("/admin/settings", async (request, reply) => {
    try {
      const body = isRecord(request.body) ? request.body : {};
      const currentSettings = getAccountAutomationSettings(db);
      const pollIntervalSeconds = parseRequiredPollIntervalSeconds(
        body,
        "pollIntervalSeconds",
        pollIntervalMinSeconds,
        pollIntervalMaxSeconds,
      );
      const pollIntervalMs = pollIntervalSeconds * 1000;
      db.setPollIntervalMs(pollIntervalMs);
      poller.setIntervalMs(pollIntervalMs);
      const tempMailBaseUrl = readOptionalString(
        body,
        "tempMailBaseUrl",
        currentSettings.tempMailBaseUrl,
      );
      const tempMailAdminPassword = readOptionalString(
        body,
        "tempMailAdminPassword",
        currentSettings.tempMailAdminPassword,
      );
      const tempMailSitePassword = readOptionalString(
        body,
        "tempMailSitePassword",
        currentSettings.tempMailSitePassword,
      );
      const tempMailDefaultDomain = readOptionalString(
        body,
        "tempMailDefaultDomain",
        currentSettings.tempMailDefaultDomain,
      );
      const managedBrowserExecutablePath = readOptionalString(
        body,
        "managedBrowserExecutablePath",
        currentSettings.managedBrowserExecutablePath,
      );
      const autoRegisterEnabled = parseOptionalBoolean(
        body,
        "autoRegisterEnabled",
        currentSettings.autoRegisterEnabled,
      );
      const enableFreeAccountScheduling = parseOptionalBoolean(
        body,
        "enableFreeAccountScheduling",
        currentSettings.enableFreeAccountScheduling,
      );
      const autoRegisterHeadless = parseOptionalBoolean(
        body,
        "autoRegisterHeadless",
        currentSettings.autoRegisterHeadless,
      );
      const autoRegisterThreshold = readOptionalPositiveInt(
        body,
        "autoRegisterThreshold",
        currentSettings.autoRegisterThreshold,
        accountAutomationRanges.threshold.max,
      );
      const autoRegisterBatchSize = readOptionalPositiveInt(
        body,
        "autoRegisterBatchSize",
        currentSettings.autoRegisterBatchSize,
        accountAutomationRanges.batchSize.max,
      );
      const autoRegisterCheckIntervalSeconds = readOptionalPositiveInt(
        body,
        "autoRegisterCheckIntervalSeconds",
        Math.floor(currentSettings.autoRegisterCheckIntervalMs / 1000),
        accountAutomationRanges.checkIntervalSeconds.max,
      );
      const autoRegisterTimeoutSeconds = readOptionalPositiveInt(
        body,
        "autoRegisterTimeoutSeconds",
        Math.floor(currentSettings.autoRegisterTimeoutMs / 1000),
        accountAutomationRanges.timeoutSeconds.max,
      );
      const automationSettings = updateAccountAutomationSettings(db, {
        tempMailBaseUrl,
        tempMailAdminPassword,
        tempMailSitePassword,
        tempMailDefaultDomain,
        managedBrowserExecutablePath,
        autoRegisterEnabled,
        enableFreeAccountScheduling,
        autoRegisterThreshold: Math.max(
          accountAutomationRanges.threshold.min,
          autoRegisterThreshold,
        ),
        autoRegisterBatchSize: Math.max(accountAutomationRanges.batchSize.min, autoRegisterBatchSize),
        autoRegisterCheckIntervalMs: Math.max(
          accountAutomationRanges.checkIntervalSeconds.min * 1000,
          autoRegisterCheckIntervalSeconds * 1000,
        ),
        autoRegisterTimeoutMs: Math.max(
          accountAutomationRanges.timeoutSeconds.min * 1000,
          autoRegisterTimeoutSeconds * 1000,
        ),
        autoRegisterHeadless,
      });
      autoRegisterReplenisher.start();
      void autoRegisterReplenisher.runOnce("settings");

      return {
        ok: true,
        pollIntervalMs,
        pollIntervalSeconds,
        tempMailBaseUrl: automationSettings.tempMailBaseUrl,
        tempMailAdminPassword: automationSettings.tempMailAdminPassword,
        tempMailSitePassword: automationSettings.tempMailSitePassword,
        tempMailDefaultDomain: automationSettings.tempMailDefaultDomain,
        managedBrowserExecutablePath: automationSettings.managedBrowserExecutablePath,
        autoRegisterEnabled: automationSettings.autoRegisterEnabled,
        enableFreeAccountScheduling: automationSettings.enableFreeAccountScheduling,
        autoRegisterThreshold: automationSettings.autoRegisterThreshold,
        autoRegisterBatchSize: automationSettings.autoRegisterBatchSize,
        autoRegisterCheckIntervalSeconds: Math.floor(
          automationSettings.autoRegisterCheckIntervalMs / 1000,
        ),
        autoRegisterTimeoutSeconds: Math.floor(automationSettings.autoRegisterTimeoutMs / 1000),
        autoRegisterHeadless: automationSettings.autoRegisterHeadless,
      };
    } catch (error) {
      return reply.status(400).send({
        error: "invalid_settings_payload",
        message: error instanceof Error ? error.message : "Invalid settings payload.",
      });
    }
  });

  app.get("/admin/codex-auto-config", async () => {
    return {
      ok: true,
      ...codexConfigAutoManager.getStatus(),
    };
  });

  app.put("/admin/codex-auto-config", async (request, reply) => {
    try {
      const body = isRecord(request.body) ? request.body : {};
      if (!hasOwn(body, "enabled")) {
        throw new Error('Field "enabled" is required.');
      }

      if (hasOwn(body, "mode")) {
        const mode = String(body.mode);
        if (
          mode !== "provider_auth" &&
          mode !== "provider_env" &&
          mode !== "openai_base_url" &&
          mode !== "openai_base_url_no_forced"
        ) {
          throw new Error(
            'Field "mode" must be "provider_auth", "provider_env", "openai_base_url", or "openai_base_url_no_forced".',
          );
        }
        codexConfigAutoManager.setMode(mode);
      }

      const enabled = parseOptionalBoolean(body, "enabled", false);
      const status = codexConfigAutoManager.setEnabled(enabled);
      return {
        ok: true,
        ...status,
      };
    } catch (error) {
      return reply.status(400).send({
        error: "invalid_codex_auto_config_payload",
        message: error instanceof Error ? error.message : "Invalid codex auto-config payload.",
      });
    }
  });

  app.get("/admin/access-token", async () => {
    const baseUrl = `http://127.0.0.1:${config.gatewayPort}`;
    const envVarName = "QUOTA_GATEWAY_TOKEN";
    const requireGatewayAccessToken = shouldRequireGatewayAccessToken();
    const codexConfigSnippet = [
      'model_provider = "quota_gateway"',
      "",
      "[model_providers.quota_gateway]",
      'name = "Local Quota Gateway"',
      `base_url = "${baseUrl}"`,
      `env_key = "${envVarName}"`,
      "",
      "# 可选：如协议不匹配再启用",
      '# wire_api = "responses"',
    ].join("\n");
    const openaiBaseUrlSnippet = [
      `openai_base_url = "${baseUrl}"`,
      'forced_login_method = "chatgpt"',
      "",
      '# 为了保留原有历史会话，请保持默认 model_provider = "openai"',
      '# 该方案下不要设置 model_provider = "quota_gateway"',
    ].join("\n");

    return {
      ok: true,
      required: requireGatewayAccessToken,
      token: config.gatewayAccessToken,
      tokenPreview: GatewayTokenManager.buildTokenPreview(config.gatewayAccessToken),
      source: config.gatewayAccessTokenSource,
      tokenFilePath: config.gatewayAccessTokenFilePath,
      authHeader: `Bearer ${config.gatewayAccessToken}`,
      managedTokensEndpoint: "/admin/tokens",
      codexEnvVar: envVarName,
      windowsSetxCommand: `setx ${envVarName} "${config.gatewayAccessToken}"`,
      windowsSessionCommand: `$env:${envVarName} = "${config.gatewayAccessToken}"`,
      codexBaseUrl: baseUrl,
      codexConfigSnippet,
      providerConfigSnippet: codexConfigSnippet,
      openaiBaseUrlConfigSnippet: openaiBaseUrlSnippet,
      openaiBaseUrlCompatible: !requireGatewayAccessToken,
      strategyDiff: {
        providerMode: "需要通过 env_key 提供 token；会切换到自定义 provider 命名空间。",
        openaiBaseUrlMode:
          "保持内置 openai provider 的命名空间与历史会话。要求网关关闭 token 强校验（REQUIRE_GATEWAY_ACCESS_TOKEN=0）。",
      },
    };
  });

  app.get("/admin/tokens", async () => {
    return {
      ok: true,
      required: config.requireGatewayAccessToken,
      primaryToken: {
        token: config.gatewayAccessToken,
        tokenPreview: GatewayTokenManager.buildTokenPreview(config.gatewayAccessToken),
        source: config.gatewayAccessTokenSource,
        tokenFilePath: config.gatewayAccessTokenFilePath,
      },
      tokens: tokenManager.listManagedTokens(),
    };
  });

  app.post("/admin/tokens", async (request, reply) => {
    try {
      const body = isRecord(request.body) ? request.body : {};
      const requestedName = readOptionalString(body, "name", "");
      const name = requestedName.length > 0 ? requestedName : buildManagedTokenDefaultName();
      const ttlSeconds = parseOptionalTtlSeconds(body, "ttlSeconds");
      const created = tokenManager.createManagedToken({
        name,
        ttlSeconds,
      });

      return reply.status(201).send({
        ok: true,
        token: created.token,
        authHeader: `Bearer ${created.token}`,
        item: created.item,
      });
    } catch (error) {
      return reply.status(400).send({
        error: "invalid_token_payload",
        message: error instanceof Error ? error.message : "Invalid token payload.",
      });
    }
  });

  app.patch("/admin/tokens/:tokenId", async (request, reply) => {
    const tokenId = (request.params as { tokenId: string }).tokenId;

    try {
      const body = isRecord(request.body) ? request.body : {};
      if (!hasOwn(body, "ttlSeconds")) {
        return reply.status(400).send({
          error: "invalid_token_payload",
          message: 'Field "ttlSeconds" is required.',
        });
      }

      const ttlSeconds = parseOptionalTtlSeconds(body, "ttlSeconds");
      const updated = tokenManager.updateManagedTokenTtl(tokenId, ttlSeconds);
      if (!updated) {
        return reply.status(404).send({
          error: "token_not_found",
          message: `Token ${tokenId} does not exist.`,
        });
      }

      if (updated === "revoked") {
        return reply.status(409).send({
          error: "token_revoked",
          message: "Cannot update TTL for a revoked token.",
        });
      }

      return {
        ok: true,
        item: updated,
      };
    } catch (error) {
      return reply.status(400).send({
        error: "invalid_token_payload",
        message: error instanceof Error ? error.message : "Invalid token payload.",
      });
    }
  });

  app.delete("/admin/tokens/:tokenId", async (request, reply) => {
    const tokenId = (request.params as { tokenId: string }).tokenId;
    const revoked = tokenManager.revokeManagedToken(tokenId);
    if (!revoked) {
      return reply.status(404).send({
        error: "token_not_found",
        message: `Token ${tokenId} does not exist.`,
      });
    }

    return {
      ok: true,
      item: revoked,
    };
  });

  app.get("/admin/accounts", async () => {
    return accountManager.listAccounts().map((account) => serializeAccount(account.id));
  });

  app.post("/admin/accounts", async (request, reply) => {
    try {
      const body = isRecord(request.body) ? request.body : {};
      const payload = parseAccountPayload(
        body,
        {
          provider: config.defaultAccountProvider,
          upstreamBaseUrl: config.defaultUpstreamBaseUrl,
          quotaPath: config.defaultQuotaPath,
          proxyPathPrefix: config.defaultProxyPathPrefix,
          status: "healthy",
        },
        null,
      );
      if (accountManager.getAccount(payload.id)) {
        return reply.status(409).send({
          error: "account_exists",
          message: `Account ${payload.id} already exists.`,
        });
      }

      const sessionInfoFromBody =
        readNullableOptionalString(body, "sessionInfo", null) ??
        readNullableOptionalString(body, "session_info", null);

      accountManager.upsertAccount({
        ...payload,
        provisionSource:
          sessionInfoFromBody ? "session-import" : payload.provisionSource,
        provisionState: "ready",
        lastProvisionAttemptAt: new Date().toISOString(),
        lastProvisionedAt: new Date().toISOString(),
        lastProvisionError: null,
        subscription: {
          planType: null,
          status: "unknown",
        },
        successCount: 0,
        failureCount: 0,
        consecutiveFailures: 0,
        consecutive429: 0,
        cooldownUntil: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      });
      if (sessionInfoFromBody) {
        db.setRuntimeSetting(accountSessionInfoSettingKey(payload.id), sessionInfoFromBody);
      }

      return reply.status(201).send({
        ok: true,
        account: serializeAccount(payload.id),
      });
    } catch (error) {
      return reply.status(400).send({
        error: "invalid_account_payload",
        message: error instanceof Error ? error.message : "Unknown payload error.",
      });
    }
  });

  app.post("/admin/chatgpt-capture/start", async (request, reply) => {
    try {
      const body = isRecord(request.body) ? request.body : {};
      const profileKey = readOptionalString(body, "profileKey", "default");
      const timeoutMs = readOptionalPositiveInt(
        body,
        "timeoutMs",
        config.chatgptCaptureTimeoutMs,
        30 * 60_000,
      );
      const pollIntervalMs = readOptionalPositiveInt(
        body,
        "pollIntervalMs",
        config.chatgptCapturePollIntervalMs,
        60_000,
      );
      const browserExecutablePath = readOptionalString(
        body,
        "browserExecutablePath",
        config.browserExecutablePath,
      );

      const task = chatgptCaptureManager.startCapture({
        profileKey,
        timeoutMs,
        pollIntervalMs,
        browserExecutablePath: browserExecutablePath || undefined,
      });

      db.logRuntime({
        level: "info",
        scope: "chatgpt-capture",
        event: "capture.started",
        message: "ChatGPT capture task started",
        detailsJson: JSON.stringify({
          taskId: task.id,
          profileKey: task.profileKey,
          timeoutMs,
          pollIntervalMs,
          browserExecutablePath: browserExecutablePath || null,
        }),
        createdAt: new Date().toISOString(),
      });

      return reply.status(202).send({
        ok: true,
        task,
      });
    } catch (error) {
      return reply.status(400).send({
        error: "invalid_capture_payload",
        message: error instanceof Error ? error.message : "Invalid capture payload.",
      });
    }
  });

  app.get("/admin/chatgpt-capture/:taskId", async (request, reply) => {
    const taskId = (request.params as { taskId: string }).taskId;
    const task = chatgptCaptureManager.getTask(taskId);
    if (!task) {
      return reply.status(404).send({
        error: "capture_task_not_found",
        message: `Capture task ${taskId} does not exist.`,
      });
    }

    return {
      ok: true,
      task,
    };
  });

  app.post("/admin/chatgpt-capture/:taskId/save", async (request, reply) => {
    const taskId = (request.params as { taskId: string }).taskId;
    const captureResult = chatgptCaptureManager.getCompletedResult(taskId);
    if (!captureResult) {
      return reply.status(409).send({
        error: "capture_not_completed",
        message: `Capture task ${taskId} is not completed yet.`,
      });
    }

    try {
      const body = isRecord(request.body) ? request.body : {};
      const requestedAccountId = readOptionalString(
        body,
        "id",
        makeAccountIdFromEmail(captureResult.email),
      );
      const accountName = readOptionalString(body, "name", captureResult.email);
      const workspace = parseWorkspacePayload(body, captureResult.workspace);

      const existing = accountManager.getAccount(requestedAccountId);
      const providerName = readOptionalString(
        body,
        "provider",
        config.defaultAccountProvider,
      );
      const upstreamBaseUrl = readOptionalString(
        body,
        "upstreamBaseUrl",
        config.defaultUpstreamBaseUrl,
      );
      const quotaPath = readOptionalString(
        body,
        "quotaPath",
        config.defaultQuotaPath,
      );
      const proxyPathPrefix = readOptionalString(
        body,
        "proxyPathPrefix",
        config.defaultProxyPathPrefix,
      );

      accountManager.upsertAccount({
        id: requestedAccountId,
        name: accountName,
        provider: providerName,
        upstreamBaseUrl,
        quotaPath,
        proxyPathPrefix,
        loginEmail: captureResult.email,
        loginPassword: existing?.loginPassword ?? null,
        managedByGateway: existing?.managedByGateway ?? false,
        provisionSource: "browser-capture",
        provisionState: "ready",
        lastProvisionAttemptAt: captureResult.capturedAt,
        lastProvisionedAt: captureResult.capturedAt,
        lastProvisionError: null,
        auth: {
          mode: "bearer",
          token: captureResult.accessToken,
        },
        workspace,
        subscription:
          existing?.subscription ?? {
            planType: null,
            status: "unknown",
          },
        status: "healthy",
        successCount: existing?.successCount ?? 0,
        failureCount: existing?.failureCount ?? 0,
        consecutiveFailures: 0,
        consecutive429: 0,
        cooldownUntil: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      });

      db.setRuntimeSetting(
        accountSessionInfoSettingKey(requestedAccountId),
        JSON.stringify(captureResult.sessionPayload),
      );

      try {
        const capturedSnapshot = parseCapturedWhamUsage(
          captureResult.usagePayload,
          requestedAccountId,
        );

        if (capturedSnapshot) {
          accountManager.mergeSubscriptionHint(
            requestedAccountId,
            capturedSnapshot.subscriptionHint,
          );
          accountManager.applyQuotaSnapshot(capturedSnapshot);
        } else {
          const account = accountManager.getAccount(requestedAccountId);
          if (account) {
            const snapshot = await provider.fetchQuota(account);
            accountManager.mergeWorkspaceHint(requestedAccountId, snapshot.workspaceHint);
            accountManager.mergeSubscriptionHint(
              requestedAccountId,
              snapshot.subscriptionHint,
            );
            accountManager.applyQuotaSnapshot({
              ...snapshot,
              source: "manual",
            });
          }
        }
      } catch (error) {
        db.logRuntime({
          level: "warn",
          scope: "chatgpt-capture",
          event: "capture.quota_refresh_failed",
          message:
            error instanceof Error
              ? error.message
              : "Quota refresh after capture failed.",
          accountId: requestedAccountId,
          createdAt: new Date().toISOString(),
        });
      }

      db.logRuntime({
        level: "info",
        scope: "chatgpt-capture",
        event: "capture.saved_account",
        message: "Captured ChatGPT session saved to account pool",
        accountId: requestedAccountId,
        detailsJson: JSON.stringify({
          taskId,
          email: captureResult.email,
          profileKey: captureResult.profileKey,
          workspaceKind: workspace.kind,
          workspaceId: workspace.id,
          workspaceName: workspace.name,
        }),
        createdAt: new Date().toISOString(),
      });

      return {
        ok: true,
        account: serializeAccount(requestedAccountId),
      };
    } catch (error) {
      return reply.status(400).send({
        error: "invalid_save_payload",
        message: error instanceof Error ? error.message : "Invalid save payload.",
      });
    }
  });

  app.post("/admin/chatgpt-register/start", async (request, reply) => {
    try {
      const body = isRecord(request.body) ? request.body : {};
      const settings = getAccountAutomationSettings(db);
      const timeoutMs =
        readOptionalPositiveInt(
          body,
          "timeoutMs",
          Math.floor(settings.autoRegisterTimeoutMs),
          accountAutomationRanges.timeoutSeconds.max * 1000,
        ) || settings.autoRegisterTimeoutMs;
      const headless = parseOptionalBoolean(body, "headless", settings.autoRegisterHeadless);
      const browserExecutablePath = readOptionalString(
        body,
        "browserExecutablePath",
        settings.managedBrowserExecutablePath,
      );
      const task = chatgptRegistrationManager.startRegistration({
        trigger: "manual",
        timeoutMs: Math.max(accountAutomationRanges.timeoutSeconds.min * 1000, timeoutMs),
        headless,
        browserExecutablePath: browserExecutablePath || undefined,
      });

      return reply.status(202).send({
        ok: true,
        task,
      });
    } catch (error) {
      return reply.status(400).send({
        error: "invalid_register_payload",
        message: error instanceof Error ? error.message : "自动注册任务启动失败。",
      });
    }
  });

  app.get("/admin/chatgpt-register/:taskId", async (request, reply) => {
    const taskId = (request.params as { taskId: string }).taskId;
    const task = chatgptRegistrationManager.getTask(taskId);
    if (!task) {
      return reply.status(404).send({
        error: "register_task_not_found",
        message: `Register task ${taskId} does not exist.`,
      });
    }

    return {
      ok: true,
      task,
    };
  });

  app.post("/admin/chatgpt-register/:taskId/cancel", async (request, reply) => {
    const taskId = (request.params as { taskId: string }).taskId;
    const task = await chatgptRegistrationManager.cancelTask(taskId);
    if (!task) {
      return reply.status(404).send({
        error: "register_task_not_found",
        message: `Register task ${taskId} does not exist.`,
      });
    }

    return {
      ok: true,
      task,
    };
  });

  app.put("/admin/accounts/:accountId", async (request, reply) => {
    const accountId = (request.params as { accountId: string }).accountId;
    const existing = accountManager.getAccount(accountId);

    if (!existing) {
      return reply.status(404).send({
        error: "account_not_found",
        message: `Account ${accountId} does not exist.`,
      });
    }

    try {
      const body = isRecord(request.body) ? request.body : null;
      const payload = parseAccountPayload(
        request.body,
        {
          provider: config.defaultAccountProvider,
          upstreamBaseUrl: config.defaultUpstreamBaseUrl,
          quotaPath: config.defaultQuotaPath,
          proxyPathPrefix: config.defaultProxyPathPrefix,
          status: "healthy",
        },
        existing,
      );
      if (payload.id !== accountId) {
        return reply.status(400).send({
          error: "account_id_mismatch",
          message: "Body id must match the route accountId.",
        });
      }

      const authChanged = !authConfigsEqual(payload.auth, existing.auth);
      const statusExplicitlyProvided = body ? hasOwn(body, "status") : false;
      const nextStatus = !statusExplicitlyProvided && authChanged ? "healthy" : payload.status;

      accountManager.upsertAccount({
        ...existing,
        ...payload,
        id: accountId,
        status: nextStatus,
        cooldownUntil: authChanged ? null : existing.cooldownUntil,
        consecutiveFailures: authChanged ? 0 : existing.consecutiveFailures,
        consecutive429: authChanged ? 0 : existing.consecutive429,
        lastErrorCode: authChanged ? null : existing.lastErrorCode,
        lastErrorMessage: authChanged ? null : existing.lastErrorMessage,
      });

      if (authChanged) {
        db.deleteRuntimeSetting(accountSessionInfoSettingKey(accountId));
      }

      return reply.send({
        ok: true,
        account: serializeAccount(accountId),
      });
    } catch (error) {
      return reply.status(400).send({
        error: "invalid_account_payload",
        message: error instanceof Error ? error.message : "Unknown payload error.",
      });
    }
  });

  app.get("/admin/cdks/options", async () => {
    const options = await cdkActivationService.listAvailableProductInventories();
    return {
      options,
      defaultProductType: config.defaultCdkProductType,
    };
  });

  app.post("/admin/accounts/:accountId/upgrade", async (request, reply) => {
    const accountId = (request.params as { accountId: string }).accountId;
    const existing = accountManager.getAccount(accountId);

    if (!existing) {
      return reply.status(404).send({
        error: "account_not_found",
        message: `Account ${accountId} does not exist.`,
      });
    }

    try {
      const body = isRecord(request.body) ? request.body : {};
      const requestedProductType = readOptionalString(body, "productType", "");
      const productType = requestedProductType || config.defaultCdkProductType;
      const specifiedCdkey = readOptionalString(body, "cdkey", "");
      const force = parseOptionalBoolean(body, "force", false);
      const sessionInfoFromBody =
        readNullableOptionalString(body, "sessionInfo", null) ??
        readNullableOptionalString(body, "session_info", null);
      const savedSessionInfo = db.getRuntimeSetting(accountSessionInfoSettingKey(accountId));
      const sessionInfo = sessionInfoFromBody ?? savedSessionInfo;

      if (sessionInfoFromBody) {
        db.setRuntimeSetting(accountSessionInfoSettingKey(accountId), sessionInfoFromBody);
      }

      if (!isFreePlanType(existing.subscription.planType) && !force) {
        const currentPlanType = normalizePlanType(existing.subscription.planType) || "unknown";
        return reply.status(409).send({
          error: "account_not_free_plan",
          message: `该账号当前 plan 为 ${currentPlanType}，仅允许免费账号升级。`,
        });
      }

      let activation: CdkActivationResult;
      if (specifiedCdkey) {
        activation = await cdkActivationService.activateWithSpecifiedCdk({
          account: existing,
          cdkey: specifiedCdkey,
          productType: requestedProductType || undefined,
          sessionInfo,
          force,
        });
      } else {
        const availableCount = await cdkActivationService.countAvailableCdks(productType);
        if (availableCount <= 0) {
          return reply.status(409).send({
            error: "cdk_out_of_stock",
            message: `当前暂无可用 ${productType} CDK。`,
          });
        }

        activation = await cdkActivationService.activateWithAvailableCdk({
          account: existing,
          productType,
          sessionInfo,
          force,
        });
      }

      const inferredPlanType = inferPlanTypeFromProductType(activation.productType);
      if (inferredPlanType) {
        accountManager.mergeSubscriptionHint(accountId, {
          planType: inferredPlanType,
          status: "active",
        });
      }

      await refreshQuotaForAccount(accountId, "cdk-upgrade-immediate");
      schedulePostUpgradeQuotaRefresh(accountId);

      const remainingCdks = await cdkActivationService.countAvailableCdks(activation.productType);

      db.logRuntime({
        level: "info",
        scope: "cdk-activation",
        event: "activation.completed",
        message: "Account upgraded via CDK activation flow",
        accountId,
        detailsJson: JSON.stringify({
          productType: activation.productType,
          cdkeyPreview: activation.cdkeyPreview,
          remainingCdks,
        }),
        createdAt: new Date().toISOString(),
      });

      return {
        ok: true,
        account: serializeAccount(accountId),
        activation: {
          ...activation,
          remainingCdks,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "账号升级失败。";
      db.logRuntime({
        level: "warn",
        scope: "cdk-activation",
        event: "activation.failed",
        message,
        accountId,
        createdAt: new Date().toISOString(),
      });
      return reply.status(400).send({
        error: "account_upgrade_failed",
        message,
      });
    }
  });

  app.delete("/admin/accounts/:accountId", async (request, reply) => {
    const accountId = (request.params as { accountId: string }).accountId;
    const existing = accountManager.getAccount(accountId);

    if (!existing) {
      return reply.status(404).send({
        error: "account_not_found",
        message: `Account ${accountId} does not exist.`,
      });
    }

    db.deleteAccountWithRelatedData(accountId);
    db.deleteRuntimeSetting(accountSessionInfoSettingKey(accountId));
    return reply.send({
      ok: true,
    });
  });

  app.get("/admin/virtual-quota", async () => quotaVirtualizer.getVirtualPool());

  app.get("/admin/logs", async (request, reply) => {
    try {
      const query = isRecord(request.query) ? request.query : {};
      const requestLimit = readOptionalPositiveInt(query, "request_limit", 20, 200);
      const decisionLimit = readOptionalPositiveInt(query, "decision_limit", 20, 200);
      const runtimeLimit = readOptionalPositiveInt(query, "runtime_limit", 80, 500);

      return {
        requests: db.listRecentRequestLogs(requestLimit),
        decisions: db.listRecentDecisionLogs(decisionLimit),
        runtime: db.listRecentRuntimeLogs(runtimeLimit),
      };
    } catch (error) {
      return reply.status(400).send({
        error: "invalid_query",
        message: error instanceof Error ? error.message : "Invalid logs query.",
      });
    }
  });

  app.get("/admin/scheduler/preview", async (request, reply) => {
    try {
      const query = isRecord(request.query) ? request.query : {};
      const sessionId = readOptionalString(query, "session_id", "preview-session");
      const path = readOptionalString(query, "path", "/v1/chat/completions");
      const method = readOptionalString(query, "method", "POST").toUpperCase();
      const estimatedUnits = readOptionalPositiveInt(query, "estimated_units", 1, 10_000);

      const preview = scheduler.preview({
        sessionId,
        path,
        method,
        estimatedUnits,
      });

      return {
        ok: true,
        preview,
      };
    } catch (error) {
      return reply.status(400).send({
        error: "invalid_preview_query",
        message: error instanceof Error ? error.message : "Invalid scheduler preview query.",
      });
    }
  });

  app.post("/admin/poll", async () => {
    await poller.runOnce("manual");
    return {
      ok: true,
    };
  });

  app.get("/backend-api/wham/usage", async (request, reply) => {
    if (!config.exposeVirtualWhamUsage) {
      return proxyService.handleResolvedPath(request, reply, "/backend-api/wham/usage");
    }

    reply.header("cache-control", "no-store");
    reply.header("x-quota-source", "virtual-pool");
    return quotaVirtualizer.getVirtualWhamUsage({ includeInvalid: false });
  });

  // OpenAI Responses-compatible aliases (for clients that use base_url + /responses)
  app.all("/responses", async (request, reply) =>
    proxyService.handleResolvedPath(request, reply, "/responses"),
  );
  app.all("/responses/*", async (request, reply) => {
    const wildcard = (request.params as Record<string, string>)["*"];
    return proxyService.handleResolvedPath(request, reply, `/responses/${wildcard}`);
  });

  app.all("/proxy/*", async (request, reply) => proxyService.handle(request, reply));
  app.all("/v1/*", async (request, reply) => {
    const wildcard = (request.params as Record<string, string>)["*"];
    return proxyService.handleResolvedPath(request, reply, `/v1/${wildcard}`);
  });
  app.all("/backend-api/*", async (request, reply) => {
    const wildcard = (request.params as Record<string, string>)["*"];
    return proxyService.handleResolvedPath(request, reply, `/backend-api/${wildcard}`);
  });

  const mockUpstream = createMockUpstreamServer(config.mockUpstreamPort);

  return {
    app,
    autoRegisterReplenisher,
    codexConfigAutoManager,
    db,
    poller,
    mockUpstream,
  };
};
