import Fastify from "fastify";
import { AccountManager } from "./accounts/account-manager.js";
import { config } from "./config.js";
import { GatewayDatabase } from "./db/database.js";
import { buildSeededSnapshot, createDemoSeeds } from "./demo/demo-data.js";
import { ChatgptCaptureManager } from "./integrations/chatgpt-capture-manager.js";
import { GenericHttpProvider } from "./providers/generic-http-provider.js";
import { createMockUpstreamServer } from "./providers/mock-upstream.js";
import { ProxyService } from "./proxy/proxy-service.js";
import { QuotaPoller } from "./quota/quota-poller.js";
import { QuotaVirtualizer } from "./quota/quota-virtualizer.js";
import { Scheduler } from "./scheduler/scheduler.js";
import { SessionManager } from "./session/session-manager.js";
import type { Account, AccountStatus, AuthConfig } from "./types.js";

const accountStatuses = new Set<AccountStatus>(["healthy", "exhausted", "cooling", "invalid"]);

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
  | "auth"
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
    auth,
    status,
  };
};

export const createGatewayRuntime = () => {
  const db = new GatewayDatabase(config.dbFile);
  db.init();

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
  );
  const poller = new QuotaPoller(db, accountManager, provider, config.pollIntervalMs);
  const chatgptCaptureManager = new ChatgptCaptureManager(config.browserProfileDir);
  const proxyService = new ProxyService(
    db,
    provider,
    accountManager,
    scheduler,
    sessionManager,
    quotaVirtualizer,
  );
  const serializeAccount = (accountId: string) => {
    const account = accountManager.getAccount(accountId);
    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    return {
      ...account,
      auth: sanitizeAuthForAdmin(account.auth),
      quota: quotaVirtualizer.getAccountQuotaState(account.id),
    };
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

  app.addHook("onRequest", async (request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Headers", "content-type,x-session-id,x-codex-session");
    reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    reply.header(
      "Access-Control-Expose-Headers",
      "x-session-id,x-routed-account-id,x-routing-reason",
    );

    if (request.method === "OPTIONS") {
      return reply.status(204).send();
    }
  });

  app.get("/healthz", async () => ({
    ok: true,
    service: "quota-gateway",
    pollIntervalMs: config.pollIntervalMs,
  }));

  app.get("/admin/accounts", async () => {
    return accountManager.listAccounts().map((account) => serializeAccount(account.id));
  });

  app.post("/admin/accounts", async (request, reply) => {
    try {
      const payload = parseAccountPayload(
        request.body,
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

      accountManager.upsertAccount({
        ...payload,
        successCount: 0,
        failureCount: 0,
        consecutiveFailures: 0,
        consecutive429: 0,
        cooldownUntil: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      });

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
        auth: {
          mode: "bearer",
          token: captureResult.accessToken,
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

      try {
        const account = accountManager.getAccount(requestedAccountId);
        if (account) {
          const snapshot = await provider.fetchQuota(account);
          accountManager.applyQuotaSnapshot({
            ...snapshot,
            source: "manual",
          });
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
    db,
    poller,
    mockUpstream,
  };
};
