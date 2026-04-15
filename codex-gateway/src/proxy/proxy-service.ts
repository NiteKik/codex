import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AccountManager } from "../accounts/account-manager.js";
import { config } from "../config.js";
import { GatewayDatabase } from "../db/database.js";
import { ChatgptSessionRefreshManager } from "../integrations/chatgpt-session-refresh-manager.js";
import type { Account } from "../types.js";
import type { ProviderClient } from "../providers/provider-client.js";
import { QuotaVirtualizer } from "../quota/quota-virtualizer.js";
import { Scheduler } from "../scheduler/scheduler.js";
import { SessionManager } from "../session/session-manager.js";
import { copyResponseHeaders } from "../utils/headers.js";
import { nowIso } from "../utils/time.js";

const retryableStatuses = new Set([401, 403, 429, 502, 503, 504]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const collectTextLengthFromContent = (content: unknown) => {
  if (typeof content === "string") {
    return content.length;
  }

  if (Array.isArray(content)) {
    const total = content.reduce((sum, part) => {
      if (!isRecord(part)) {
        return sum;
      }
      const textValue = part.text;
      return typeof textValue === "string" ? sum + textValue.length : sum;
    }, 0);
    return total > 0 ? total : null;
  }

  return null;
};

const extractLatestUserTextLength = (body: unknown): number | null => {
  if (!isRecord(body)) {
    return null;
  }

  const collectFromMessages = (value: unknown) => {
    if (!Array.isArray(value)) {
      return null;
    }

    let latest: number | null = null;
    for (const item of value) {
      if (!isRecord(item)) {
        continue;
      }

      if (item.role !== "user") {
        continue;
      }

      const length =
        collectTextLengthFromContent(item.content) ??
        (typeof item.input === "string" ? item.input.length : null);
      if (typeof length === "number" && length > 0) {
        latest = length;
      }
    }

    return latest;
  };

  const fromInputMessages = collectFromMessages(body.input);
  if (fromInputMessages !== null) {
    return fromInputMessages;
  }

  const fromChatMessages = collectFromMessages(body.messages);
  if (fromChatMessages !== null) {
    return fromChatMessages;
  }

  if (typeof body.input === "string" && body.input.length > 0) {
    return body.input.length;
  }

  return null;
};

const estimateUnits = (body: unknown) => {
  if (!body) {
    return 1;
  }

  const serialized = typeof body === "string" ? body : JSON.stringify(body);
  const payloadEstimated = Math.ceil(serialized.length / config.estimatedUnitBytes);
  const latestUserLength = extractLatestUserTextLength(body);
  const latestUserEstimated =
    latestUserLength === null ? payloadEstimated : Math.ceil(latestUserLength / config.estimatedUnitBytes);
  // Prefer latest user input size, but keep a small context overhead.
  const estimated = Math.min(
    payloadEstimated,
    latestUserEstimated + config.estimatedContextOverheadUnits,
  );
  return Math.min(config.maxEstimatedUnitsPerRequest, Math.max(1, estimated));
};

const serializeBody = (body: unknown) => {
  if (body === undefined || body === null) {
    return undefined;
  }

  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (typeof body === "string") {
    return Buffer.from(body);
  }

  return Buffer.from(JSON.stringify(body));
};

const isNoSchedulableError = (error: unknown) =>
  error instanceof Error && error.message.includes("No schedulable account is available.");

const normalizePlanType = (value: string | null | undefined) =>
  value?.trim().toLowerCase() ?? "";

const isFreePlanType = (value: string | null | undefined) => normalizePlanType(value) === "free";

const isResponsesPath = (path: string) =>
  path === "/responses" ||
  path.startsWith("/responses/") ||
  path === "/v1/responses" ||
  path.startsWith("/v1/responses/");

const getResponsesSuffix = (path: string) => {
  if (path.startsWith("/v1/responses")) {
    return path.slice("/v1/responses".length);
  }

  if (path.startsWith("/responses")) {
    return path.slice("/responses".length);
  }

  return "";
};

export class ProxyService {
  constructor(
    private readonly db: GatewayDatabase,
    private readonly provider: ProviderClient,
    private readonly accountManager: AccountManager,
    private readonly scheduler: Scheduler,
    private readonly sessionManager: SessionManager,
    private readonly quotaVirtualizer: QuotaVirtualizer,
    private readonly sessionRefreshManager?: ChatgptSessionRefreshManager,
  ) {}

  async handle(request: FastifyRequest, reply: FastifyReply) {
    const wildcard = (request.params as Record<string, string>)["*"];
    const proxyPath = `/${wildcard}`;
    return this.handleResolvedPath(request, reply, proxyPath);
  }

  async handleResolvedPath(
    request: FastifyRequest,
    reply: FastifyReply,
    proxyPath: string,
  ) {
    const sessionId = this.sessionManager.resolveSessionId(
      request.headers["x-session-id"] ?? request.headers["x-codex-session"],
    );
    const requestId = randomUUID();
    const initialEstimatedUnits = estimateUnits(request.body);
    const excludedAccountIds: string[] = [];
    const refreshedAccountIds = new Set<string>();
    const body = serializeBody(request.body);
    const queryString = request.url.includes("?")
      ? request.url.slice(request.url.indexOf("?"))
      : "";
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= config.maxProxyAttempts; attempt += 1) {
      const requestLogId = `${requestId}:${attempt}`;
      const startedAt = Date.now();
      let decision: ReturnType<Scheduler["schedule"]> | null = null;
      let estimatedUnits = initialEstimatedUnits;
      let estimateRelaxed = false;

      try {
        ({ decision, estimatedUnits, estimateRelaxed } = this.scheduleWithAdaptiveEstimate({
          requestId,
          sessionId,
          path: proxyPath,
          method: request.method,
          initialEstimatedUnits,
          excludedAccountIds,
        }));

        this.db.logRequestStart({
          requestId: requestLogId,
          sessionId,
          accountId: decision.account.id,
          path: proxyPath,
          method: request.method,
          attempt,
          estimatedUnits,
          upstreamStatus: null,
          errorCode: null,
          errorMessage: null,
          durationMs: null,
          startedAt: nowIso(),
          finishedAt: null,
          model: null,
          inputTokens: null,
          outputTokens: null,
          reasoningTokens: null,
          cachedInputTokens: null,
          totalTokens: null,
          tokenCaptureSource: null,
        });

        const upstreamPath = this.resolveUpstreamPath(decision.account, proxyPath);
        const upstreamBody = this.normalizeUpstreamBody(
          upstreamPath,
          request.method,
          request.body,
          body,
        );
        const upstream = await this.provider.forward(decision.account, {
          method: request.method,
          path: upstreamPath,
          queryString,
          headers: request.headers,
          body: upstreamBody,
        });

        const upstreamContentType = upstream.responseHeaders.get("content-type")?.toLowerCase() ?? "";
        if (isResponsesPath(proxyPath) && upstreamContentType.includes("text/html")) {
          throw new Error(
            "Upstream returned HTML for responses endpoint. Verify path mapping/authentication.",
          );
        }

        const shouldSkipAuthRefreshForFreeUnauthorizedResponses =
          upstream.upstreamStatus === 401 &&
          isResponsesPath(proxyPath) &&
          isFreePlanType(decision.account.subscription.planType);

        if (shouldSkipAuthRefreshForFreeUnauthorizedResponses) {
          this.db.logRuntime({
            level: "warn",
            scope: "proxy",
            event: "proxy.auth_refresh_skipped_free_401",
            message: "免费账号 /responses 返回 401，跳过自动刷新并转入冻结冷却",
            accountId: decision.account.id,
            requestId,
            sessionId,
            detailsJson: JSON.stringify({
              proxyPath,
              upstreamStatus: upstream.upstreamStatus,
              planType: decision.account.subscription.planType,
            }),
            createdAt: nowIso(),
          });
        }

        if (
          (upstream.upstreamStatus === 401 || upstream.upstreamStatus === 403) &&
          this.sessionRefreshManager?.canRefreshAccount(decision.account) &&
          !refreshedAccountIds.has(decision.account.id) &&
          !shouldSkipAuthRefreshForFreeUnauthorizedResponses
        ) {
          refreshedAccountIds.add(decision.account.id);
          try {
            this.db.logRuntime({
              level: "warn",
              scope: "proxy",
              event: "proxy.auth_refresh_started",
              message: "代理请求命中鉴权错误，尝试自动刷新 session",
              accountId: decision.account.id,
              requestId,
              sessionId,
              detailsJson: JSON.stringify({
                proxyPath,
                upstreamStatus: upstream.upstreamStatus,
              }),
              createdAt: nowIso(),
            });
            await this.sessionRefreshManager.refreshAccountSession(decision.account.id, {
              reason: `proxy:${proxyPath}:${upstream.upstreamStatus}`,
            });
            this.quotaVirtualizer.release(decision.reservation.id);
            this.db.logRequestFinish(requestLogId, {
              upstreamStatus: upstream.upstreamStatus,
              errorCode: `auth_refreshed_${upstream.upstreamStatus}`,
              errorMessage: "Managed session refreshed; retrying request",
              durationMs: Date.now() - startedAt,
              finishedAt: nowIso(),
            });
            continue;
          } catch (refreshError) {
            this.db.logRuntime({
              level: "warn",
              scope: "proxy",
              event: "proxy.auth_refresh_failed",
              message:
                refreshError instanceof Error ? refreshError.message : "自动刷新 session 失败。",
              accountId: decision.account.id,
              requestId,
              sessionId,
              detailsJson: JSON.stringify({
                proxyPath,
                upstreamStatus: upstream.upstreamStatus,
              }),
              createdAt: nowIso(),
            });
          }
        }

        if (retryableStatuses.has(upstream.upstreamStatus) && attempt < config.maxProxyAttempts) {
          this.accountManager.markFailure(decision.account.id, {
            code: `upstream_${upstream.upstreamStatus}`,
            message: `Retryable upstream status ${upstream.upstreamStatus}`,
            httpStatus: upstream.upstreamStatus,
          });
          this.quotaVirtualizer.release(decision.reservation.id);
          this.db.logRequestFinish(requestLogId, {
            upstreamStatus: upstream.upstreamStatus,
            errorCode: `retry_${upstream.upstreamStatus}`,
            errorMessage: "Retry with another account",
            durationMs: Date.now() - startedAt,
            finishedAt: nowIso(),
          });
          excludedAccountIds.push(decision.account.id);
          continue;
        }

        if (upstream.upstreamStatus >= 400) {
          this.accountManager.markFailure(decision.account.id, {
            code: `upstream_${upstream.upstreamStatus}`,
            message: `Upstream status ${upstream.upstreamStatus}`,
            httpStatus: upstream.upstreamStatus,
          });
          this.quotaVirtualizer.release(decision.reservation.id);
        } else {
          this.accountManager.markSuccess(decision.account.id);
          this.quotaVirtualizer.settle(
            decision.reservation.id,
            decision.account.id,
            requestId,
            estimatedUnits,
          );
        }

        this.db.logRequestFinish(requestLogId, {
          upstreamStatus: upstream.upstreamStatus,
          errorCode: upstream.upstreamStatus >= 400 ? `http_${upstream.upstreamStatus}` : null,
          errorMessage: upstream.upstreamStatus >= 400 ? "Upstream request failed" : null,
          durationMs: Date.now() - startedAt,
          finishedAt: nowIso(),
        });

        reply.header("x-session-id", sessionId);
        reply.header("x-routed-account-id", decision.account.id);
        reply.header("x-routing-reason", decision.reason);
        if (estimateRelaxed) {
          reply.header("x-estimated-units-relaxed", "1");
          reply.header("x-estimated-units", String(estimatedUnits));
        }
        if (upstream.isSse && upstream.streamResponse?.body) {
          reply.hijack();
          const headerObject: Record<string, string> = {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache",
            connection: "keep-alive",
            "x-session-id": sessionId,
            "x-routed-account-id": decision.account.id,
            "x-routing-reason": decision.reason,
            ...(estimateRelaxed
              ? {
                  "x-estimated-units-relaxed": "1",
                  "x-estimated-units": String(estimatedUnits),
                }
              : {}),
          };

          upstream.responseHeaders.forEach((value, key) => {
            if (
              !["connection", "content-length", "transfer-encoding", "content-encoding"].includes(
                key.toLowerCase(),
              )
            ) {
              headerObject[key] = value;
            }
          });

          reply.raw.writeHead(upstream.upstreamStatus, headerObject);
          const reader = upstream.streamResponse.body.getReader();

          while (true) {
            const chunk = await reader.read();
            if (chunk.done) {
              break;
            }
            reply.raw.write(Buffer.from(chunk.value));
          }

          reply.raw.end();
          return reply;
        }

        copyResponseHeaders(upstream.responseHeaders, reply);
        return reply.status(upstream.upstreamStatus).send(upstream.responseBody);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown proxy error";
        lastError = error instanceof Error ? error : new Error(message);
        if (decision) {
          this.accountManager.markFailure(decision.account.id, {
            code: "proxy_error",
            message,
          });
          this.quotaVirtualizer.release(decision.reservation.id);
          excludedAccountIds.push(decision.account.id);
        }
        this.db.logRequestFinish(requestLogId, {
          upstreamStatus: null,
          errorCode: "proxy_error",
          errorMessage: message,
          durationMs: Date.now() - startedAt,
          finishedAt: nowIso(),
        });
      }
    }

    reply.header("x-session-id", sessionId);
    return reply.status(503).send({
      error: "all_accounts_unavailable",
      message: lastError?.message ?? "No account available after retries.",
    });
  }

  private scheduleWithAdaptiveEstimate(input: {
    requestId: string;
    sessionId: string;
    path: string;
    method: string;
    initialEstimatedUnits: number;
    excludedAccountIds: string[];
  }) {
    const candidates = [
      input.initialEstimatedUnits,
      6,
      3,
      1,
    ].filter((value, index, list) => value >= 1 && list.indexOf(value) === index);
    let lastError: unknown = null;

    for (const estimatedUnits of candidates) {
      try {
        const decision = this.scheduler.schedule({
          requestId: input.requestId,
          sessionId: input.sessionId,
          path: input.path,
          method: input.method,
          estimatedUnits,
          excludedAccountIds: input.excludedAccountIds,
        });
        return {
          decision,
          estimatedUnits,
          estimateRelaxed: estimatedUnits !== input.initialEstimatedUnits,
        };
      } catch (error) {
        lastError = error;
        if (!isNoSchedulableError(error)) {
          throw error;
        }
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }

    throw new Error("No schedulable account is available.");
  }

  private resolveUpstreamPath(account: Account, proxyPath: string) {
    if (!isResponsesPath(proxyPath)) {
      return proxyPath;
    }

    const suffix = getResponsesSuffix(proxyPath);
    const isChatgptProvider =
      account.provider === "chatgpt-web-session" ||
      account.upstreamBaseUrl.toLowerCase().includes("chatgpt.com");

    if (isChatgptProvider) {
      return `/backend-api/codex/responses${suffix}`;
    }

    return `/v1/responses${suffix}`;
  }

  private normalizeUpstreamBody(
    upstreamPath: string,
    method: string,
    parsedBody: unknown,
    serializedBody: Buffer | undefined,
  ) {
    if (!upstreamPath.startsWith("/backend-api/codex/responses")) {
      return serializedBody;
    }

    if (method === "GET" || method === "HEAD" || !isRecord(parsedBody)) {
      return serializedBody;
    }

    const payload: Record<string, unknown> = { ...parsedBody };
    let changed = false;

    if (payload.store !== false) {
      payload.store = false;
      changed = true;
    }

    if (payload.input !== undefined && !Array.isArray(payload.input)) {
      if (typeof payload.input === "string") {
        payload.input = [{ role: "user", content: payload.input }];
      } else {
        payload.input = [payload.input];
      }
      changed = true;
    }

    if (!changed) {
      return serializedBody;
    }

    return Buffer.from(JSON.stringify(payload));
  }
}
