import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AccountManager } from "../accounts/account-manager.js";
import { config } from "../config.js";
import { GatewayDatabase } from "../db/database.js";
import type { ProviderClient } from "../providers/provider-client.js";
import { QuotaVirtualizer } from "../quota/quota-virtualizer.js";
import { Scheduler } from "../scheduler/scheduler.js";
import { SessionManager } from "../session/session-manager.js";
import { copyResponseHeaders } from "../utils/headers.js";
import { nowIso } from "../utils/time.js";

const retryableStatuses = new Set([401, 403, 429, 502, 503, 504]);

const estimateUnits = (body: unknown) => {
  if (!body) {
    return 1;
  }

  const serialized = typeof body === "string" ? body : JSON.stringify(body);
  return Math.max(1, Math.ceil(serialized.length / 180));
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

export class ProxyService {
  constructor(
    private readonly db: GatewayDatabase,
    private readonly provider: ProviderClient,
    private readonly accountManager: AccountManager,
    private readonly scheduler: Scheduler,
    private readonly sessionManager: SessionManager,
    private readonly quotaVirtualizer: QuotaVirtualizer,
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
    const estimatedUnits = estimateUnits(request.body);
    const excludedAccountIds: string[] = [];
    const body = serializeBody(request.body);
    const queryString = request.url.includes("?")
      ? request.url.slice(request.url.indexOf("?"))
      : "";
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= config.maxProxyAttempts; attempt += 1) {
      const requestLogId = `${requestId}:${attempt}`;
      const startedAt = Date.now();
      let decision: ReturnType<Scheduler["schedule"]> | null = null;

      try {
        decision = this.scheduler.schedule({
          requestId,
          sessionId,
          path: proxyPath,
          method: request.method,
          estimatedUnits,
          excludedAccountIds,
        });

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
        });

        const upstream = await this.provider.forward(decision.account, {
          method: request.method,
          path: proxyPath,
          queryString,
          headers: request.headers,
          body,
        });

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
        if (upstream.isSse && upstream.streamResponse?.body) {
          reply.hijack();
          const headerObject: Record<string, string> = {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache",
            connection: "keep-alive",
            "x-session-id": sessionId,
            "x-routed-account-id": decision.account.id,
            "x-routing-reason": decision.reason,
          };

          upstream.responseHeaders.forEach((value, key) => {
            if (
              !["connection", "content-length", "transfer-encoding"].includes(key.toLowerCase())
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
}
