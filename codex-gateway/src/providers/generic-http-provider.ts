import { buildAuthHeaders, mergeProxyHeaders } from "../utils/headers.js";
import { nowIso } from "../utils/time.js";
import type { Account, ProxyExecutionResult, QuotaSnapshot } from "../types.js";
import { ProviderHttpError, type ForwardRequest, type ProviderClient } from "./provider-client.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeBaseUrl = (baseUrl: string, path: string, queryString: string) => {
  if (/^https?:\/\//iu.test(path)) {
    return `${path}${queryString}`;
  }

  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}${queryString}`;
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const toText = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return null;
};

const pickPathValue = (payload: unknown, path: string[]): unknown => {
  let cursor: unknown = payload;

  for (const key of path) {
    if (!isRecord(cursor)) {
      return null;
    }
    cursor = cursor[key];
  }

  return cursor;
};

const commonPrefixes = [[], ["data"], ["usage"], ["quota"], ["result"]];

const withPrefixes = (paths: string[][]) =>
  commonPrefixes.flatMap((prefix) => paths.map((path) => [...prefix, ...path]));

const findNumberByPaths = (payload: unknown, paths: string[][]) => {
  for (const path of withPrefixes(paths)) {
    const numberValue = toNumber(pickPathValue(payload, path));
    if (numberValue !== null) {
      return numberValue;
    }
  }

  return null;
};

const findTextByPaths = (payload: unknown, paths: string[][]) => {
  for (const path of withPrefixes(paths)) {
    const textValue = toText(pickPathValue(payload, path));
    if (textValue) {
      return textValue;
    }
  }

  return null;
};

const parseQuotaPayload = (payload: unknown, accountId: string) => {
  const weeklyTotal =
    findNumberByPaths(payload, [
      ["weekly_total"],
      ["weeklyTotal"],
      ["weekly", "total"],
      ["weekly", "limit"],
      ["week", "total"],
      ["week", "limit"],
      ["limits", "weekly", "total"],
      ["limits", "weekly", "limit"],
      ["quota", "weekly", "total"],
      ["quota", "weekly", "limit"],
    ]) ?? 0;

  const weeklyUsedDirect = findNumberByPaths(payload, [
    ["weekly_used"],
    ["weeklyUsed"],
    ["weekly", "used"],
    ["weekly", "consumed"],
    ["week", "used"],
    ["week", "consumed"],
    ["usage", "weekly", "used"],
    ["usage", "weekly", "consumed"],
    ["quota", "weekly", "used"],
  ]);
  const weeklyRemaining = findNumberByPaths(payload, [
    ["weekly_remaining"],
    ["weeklyRemaining"],
    ["weekly", "remaining"],
    ["week", "remaining"],
    ["usage", "weekly", "remaining"],
    ["quota", "weekly", "remaining"],
  ]);
  const weeklyUsed =
    weeklyUsedDirect ?? (weeklyRemaining !== null ? Math.max(0, weeklyTotal - weeklyRemaining) : 0);

  const window5hTotal =
    findNumberByPaths(payload, [
      ["window_5h_total"],
      ["window5hTotal"],
      ["window5h", "total"],
      ["window5h", "limit"],
      ["fiveHour", "total"],
      ["fiveHour", "limit"],
      ["five_hour", "total"],
      ["five_hour", "limit"],
      ["rolling5h", "total"],
      ["rolling5h", "limit"],
      ["limits", "window5h", "total"],
      ["limits", "window5h", "limit"],
      ["quota", "window5h", "total"],
      ["quota", "window5h", "limit"],
    ]) ?? 0;

  const windowUsedDirect = findNumberByPaths(payload, [
    ["window_5h_used"],
    ["window5hUsed"],
    ["window5h", "used"],
    ["window5h", "consumed"],
    ["fiveHour", "used"],
    ["fiveHour", "consumed"],
    ["five_hour", "used"],
    ["five_hour", "consumed"],
    ["rolling5h", "used"],
    ["rolling5h", "consumed"],
    ["usage", "window5h", "used"],
    ["usage", "window5h", "consumed"],
  ]);
  const windowRemaining = findNumberByPaths(payload, [
    ["window_5h_remaining"],
    ["window5hRemaining"],
    ["window5h", "remaining"],
    ["fiveHour", "remaining"],
    ["five_hour", "remaining"],
    ["rolling5h", "remaining"],
    ["usage", "window5h", "remaining"],
  ]);
  const window5hUsed =
    windowUsedDirect ??
    (windowRemaining !== null ? Math.max(0, window5hTotal - windowRemaining) : 0);

  const weeklyResetAt =
    findTextByPaths(payload, [
      ["weekly_reset_at"],
      ["weeklyResetAt"],
      ["weekly", "resetAt"],
      ["weekly", "reset_at"],
      ["week", "resetAt"],
      ["resets", "weekly"],
      ["reset", "weekly"],
    ]) ?? nowIso();

  const window5hResetAt =
    findTextByPaths(payload, [
      ["window_5h_reset_at"],
      ["window5hResetAt"],
      ["window5h", "resetAt"],
      ["window5h", "reset_at"],
      ["fiveHour", "resetAt"],
      ["five_hour", "reset_at"],
      ["rolling5h", "resetAt"],
      ["resets", "window5h"],
      ["reset", "window5h"],
    ]) ?? nowIso();

  if (weeklyTotal <= 0 && window5hTotal <= 0) {
    const payloadPreview = JSON.stringify(payload).slice(0, 220);
    throw new Error(
      `Quota payload shape is unsupported for account ${accountId}. Preview: ${payloadPreview}`,
    );
  }

  return {
    weeklyTotal,
    weeklyUsed: Math.min(Math.max(0, weeklyUsed), Math.max(weeklyTotal, weeklyUsed)),
    weeklyResetAt,
    window5hTotal,
    window5hUsed: Math.min(Math.max(0, window5hUsed), Math.max(window5hTotal, window5hUsed)),
    window5hResetAt,
  };
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

  const clampedUsedPercent = Math.min(100, Math.max(0, usedPercent));
  const resetAtIso = toIsoFromEpochSeconds(value.reset_at) ?? nowIso();

  // wham usage does not expose absolute quota units; keep normalized 0..100 scale.
  return {
    total: 100,
    used: clampedUsedPercent,
    resetAt: resetAtIso,
  };
};

const parseWhamUsagePayload = (payload: unknown) => {
  if (!isRecord(payload) || !isRecord(payload.rate_limit)) {
    return null;
  }

  const primaryWindow = parseWhamWindow(payload.rate_limit.primary_window);
  const secondaryWindow = parseWhamWindow(payload.rate_limit.secondary_window);

  if (!primaryWindow || !secondaryWindow) {
    return null;
  }

  return {
    weeklyTotal: secondaryWindow.total,
    weeklyUsed: secondaryWindow.used,
    weeklyResetAt: secondaryWindow.resetAt,
    window5hTotal: primaryWindow.total,
    window5hUsed: primaryWindow.used,
    window5hResetAt: primaryWindow.resetAt,
  };
};

export class GenericHttpProvider implements ProviderClient {
  async fetchQuota(account: Account): Promise<QuotaSnapshot> {
    const response = await fetch(normalizeBaseUrl(account.upstreamBaseUrl, account.quotaPath, ""), {
      headers: {
        accept: "application/json",
        ...buildAuthHeaders(account.auth),
      },
    });

    if (!response.ok) {
      const errorPreview = (await response.text()).slice(0, 180).replaceAll(/\s+/g, " ").trim();
      throw new ProviderHttpError(
        response.status,
        `Quota fetch failed for ${account.id}: ${response.status}${
          errorPreview.length > 0 ? ` ${errorPreview}` : ""
        }`,
      );
    }

    const payload = (await response.json()) as unknown;
    const quota = parseWhamUsagePayload(payload) ?? parseQuotaPayload(payload, account.id);

    return {
      ...quota,
      accountId: account.id,
      sampleTime: nowIso(),
      source: "poller",
    };
  }

  async forward(account: Account, request: ForwardRequest): Promise<ProxyExecutionResult> {
    const path = `${account.proxyPathPrefix}${request.path}`;
    const response = await fetch(
      normalizeBaseUrl(account.upstreamBaseUrl, path, request.queryString),
      {
        method: request.method,
        headers: mergeProxyHeaders(request.headers, {
          ...buildAuthHeaders(account.auth),
          "x-routed-account-id": account.id,
        }),
        body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      },
    );

    const isSse = response.headers.get("content-type")?.includes("text/event-stream") ?? false;

    if (isSse) {
      return {
        upstreamStatus: response.status,
        responseHeaders: response.headers,
        streamResponse: response,
        isSse: true,
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return {
      upstreamStatus: response.status,
      responseHeaders: response.headers,
      responseBody: buffer,
      responseText: buffer.toString("utf8"),
      isSse: false,
    };
  }
}
