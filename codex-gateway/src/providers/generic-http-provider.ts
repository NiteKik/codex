import { buildAuthHeaders, buildWorkspaceHeaders, mergeProxyHeaders } from "../utils/headers.js";
import { nowIso } from "../utils/time.js";
import type {
  Account,
  ProxyExecutionResult,
  QuotaSnapshot,
  SubscriptionContext,
  SubscriptionStatus,
  WorkspaceContext,
  WorkspaceKind,
} from "../types.js";
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

const toBoolean = (value: unknown): boolean | null => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }
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

const toWorkspaceKind = (hint: string | null): WorkspaceKind => {
  const normalized = hint?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return "unknown";
  }

  if (
    normalized.includes("team") ||
    normalized.includes("business") ||
    normalized.includes("enterprise") ||
    normalized.includes("org")
  ) {
    return "team";
  }

  if (
    normalized.includes("personal") ||
    normalized.includes("individual") ||
    normalized.includes("free") ||
    normalized.includes("plus") ||
    normalized.includes("pro")
  ) {
    return "personal";
  }

  return "unknown";
};

const pickHeaderValue = (headers: Headers, keys: string[]) => {
  for (const key of keys) {
    const value = headers.get(key);
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
};

const parseWorkspaceHint = (
  payload: unknown,
  responseHeaders: Headers,
  requestWorkspaceHeaders: Record<string, string>,
): WorkspaceContext | null => {
  const payloadWorkspaceId = findTextByPaths(payload, [
    ["workspace_id"],
    ["active_workspace_id"],
    ["default_workspace_id"],
    ["account_id"],
    ["organization_id"],
    ["workspace", "id"],
    ["workspace", "workspace_id"],
    ["workspace", "account_id"],
    ["workspace", "organization_id"],
    ["account", "id"],
    ["organization", "id"],
  ]);
  const payloadWorkspaceName = findTextByPaths(payload, [
    ["workspace_name"],
    ["account_name"],
    ["organization_name"],
    ["workspace", "name"],
    ["workspace", "display_name"],
    ["account", "name"],
    ["organization", "name"],
  ]);
  const payloadKindHint = findTextByPaths(payload, [
    ["workspace_type"],
    ["account_type"],
    ["organization_type"],
    ["workspace", "type"],
    ["account", "type"],
    ["organization", "type"],
    ["plan_type"],
    ["user", "plan_type"],
    ["account", "plan_type"],
    ["subscription", "plan_type"],
    ["entitlement", "plan_type"],
    ["plan", "type"],
  ]);

  const headerWorkspaceId =
    pickHeaderValue(responseHeaders, [
      "x-openai-account-id",
      "x-openai-workspace-id",
      "x-workspace-id",
      "x-account-id",
    ]) ??
    requestWorkspaceHeaders["x-openai-account-id"] ??
    requestWorkspaceHeaders["x-openai-workspace-id"] ??
    requestWorkspaceHeaders["x-workspace-id"] ??
    requestWorkspaceHeaders["x-account-id"] ??
    null;
  const headerWorkspaceName = pickHeaderValue(responseHeaders, [
    "x-openai-account-name",
    "x-openai-workspace-name",
    "x-workspace-name",
    "x-account-name",
  ]);
  const headerKindHint = pickHeaderValue(responseHeaders, [
    "x-openai-account-type",
    "x-openai-workspace-type",
    "x-account-type",
    "x-workspace-type",
  ]);

  const id = payloadWorkspaceId ?? headerWorkspaceId;
  const name = payloadWorkspaceName ?? headerWorkspaceName;
  const kind = toWorkspaceKind(payloadKindHint ?? headerKindHint ?? name);

  if (!id && !name && kind === "unknown") {
    return null;
  }

  return {
    kind,
    id: id?.trim() ? id.trim() : null,
    name: name?.trim() ? name.trim() : null,
    headers: null,
  };
};

const normalizeSubscriptionStatus = (value: string | null): SubscriptionStatus => {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return "unknown";
  }

  if (
    normalized.includes("trial") ||
    normalized.includes("grace")
  ) {
    return "trial";
  }

  if (
    normalized.includes("active") ||
    normalized.includes("enabled") ||
    normalized.includes("current") ||
    normalized.includes("paid") ||
    normalized.includes("valid")
  ) {
    return "active";
  }

  if (
    normalized.includes("cancel") ||
    normalized.includes("inactive") ||
    normalized.includes("expired") ||
    normalized.includes("suspend") ||
    normalized.includes("past_due")
  ) {
    return "inactive";
  }

  return "unknown";
};

const parseSubscriptionHint = (
  payload: unknown,
  responseHeaders: Headers,
): SubscriptionContext | null => {
  const rawPlanType =
    findTextByPaths(payload, [
      ["plan_type"],
      ["planType"],
      ["user", "plan_type"],
      ["account", "plan_type"],
      ["subscription", "plan_type"],
      ["subscription", "plan"],
      ["entitlement", "plan_type"],
      ["plan", "type"],
    ]) ??
    pickHeaderValue(responseHeaders, [
      "x-openai-plan-type",
      "x-plan-type",
      "x-subscription-plan",
    ]);
  const planType = rawPlanType?.trim().toLowerCase() || null;

  const rawStatus =
    findTextByPaths(payload, [
      ["subscription_status"],
      ["subscriptionStatus"],
      ["subscription", "status"],
      ["plan_status"],
      ["planStatus"],
      ["plan", "status"],
    ]) ??
    pickHeaderValue(responseHeaders, [
      "x-openai-subscription-status",
      "x-subscription-status",
      "x-plan-status",
    ]);

  let status = normalizeSubscriptionStatus(rawStatus);
  if (status === "unknown") {
    const isTrial = toBoolean(
      pickPathValue(payload, ["subscription", "is_trial"]) ??
        pickPathValue(payload, ["trial_active"]) ??
        pickPathValue(payload, ["is_trial"]),
    );
    if (isTrial === true || (planType && planType.includes("trial"))) {
      status = "trial";
    } else if (planType) {
      status = "active";
    } else {
      const allowed = toBoolean(pickPathValue(payload, ["rate_limit", "allowed"]));
      if (allowed === true) {
        status = "active";
      } else if (allowed === false) {
        status = "inactive";
      }
    }
  }

  if (!planType && status === "unknown") {
    return null;
  }

  return {
    planType,
    status,
  };
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

const toIsoTimestamp = (value: unknown) => {
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = new Date(value.trim());
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return toIsoFromEpochSeconds(value);
};

const parseWhamWindow = (value: unknown) => {
  if (!isRecord(value)) {
    return null;
  }

  const usedPercent =
    toNumber(value.used_percent) ??
    toNumber(value.usedPercent) ??
    toNumber(value.used_percentage);
  if (usedPercent === null) {
    return null;
  }

  const normalizedUsedPercent =
    usedPercent >= 0 && usedPercent <= 1 ? usedPercent * 100 : usedPercent;
  const clampedUsedPercent = Math.min(100, Math.max(0, normalizedUsedPercent));
  const resetAtIso = toIsoTimestamp(value.reset_at) ?? nowIso();

  // wham usage does not expose absolute quota units; keep normalized 0..100 scale.
  return {
    total: 100,
    used: clampedUsedPercent,
    resetAt: resetAtIso,
  };
};

const parseWhamUsagePayload = (payload: unknown) => {
  if (!isRecord(payload)) {
    return null;
  }

  const rateLimit =
    (isRecord(payload.rate_limit) ? payload.rate_limit : null) ??
    (isRecord(payload.code_review_rate_limit) ? payload.code_review_rate_limit : null);
  if (!rateLimit) {
    return null;
  }

  const primaryWindow = parseWhamWindow(rateLimit.primary_window);
  const secondaryWindow = parseWhamWindow(rateLimit.secondary_window);
  const weeklyWindow = secondaryWindow ?? primaryWindow;
  const window5hWindow = primaryWindow ?? secondaryWindow;

  if (!weeklyWindow || !window5hWindow) {
    return null;
  }

  return {
    weeklyTotal: weeklyWindow.total,
    weeklyUsed: weeklyWindow.used,
    weeklyResetAt: weeklyWindow.resetAt,
    window5hTotal: window5hWindow.total,
    window5hUsed: window5hWindow.used,
    window5hResetAt: window5hWindow.resetAt,
  };
};

export class GenericHttpProvider implements ProviderClient {
  async fetchQuota(account: Account): Promise<QuotaSnapshot> {
    const authHeaders = buildAuthHeaders(account.auth);
    const workspaceHeaders = buildWorkspaceHeaders(account.workspace.headers);
    const response = await fetch(normalizeBaseUrl(account.upstreamBaseUrl, account.quotaPath, ""), {
      headers: {
        accept: "application/json",
        ...authHeaders,
        ...workspaceHeaders,
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
    const workspaceHint = parseWorkspaceHint(payload, response.headers, workspaceHeaders);
    const subscriptionHint = parseSubscriptionHint(payload, response.headers);

    return {
      ...quota,
      accountId: account.id,
      sampleTime: nowIso(),
      source: "poller",
      ...(workspaceHint ? { workspaceHint } : {}),
      ...(subscriptionHint ? { subscriptionHint } : {}),
    };
  }

  async forward(account: Account, request: ForwardRequest): Promise<ProxyExecutionResult> {
    const path = `${account.proxyPathPrefix}${request.path}`;
    const authHeaders = buildAuthHeaders(account.auth);
    const workspaceHeaders = buildWorkspaceHeaders(account.workspace.headers);
    const response = await fetch(
      normalizeBaseUrl(account.upstreamBaseUrl, path, request.queryString),
      {
        method: request.method,
        headers: mergeProxyHeaders(request.headers, {
          ...authHeaders,
          ...workspaceHeaders,
          "x-routed-account-id": account.id,
        }),
        body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      },
    );

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const acceptHeader =
      typeof request.headers.accept === "string"
        ? request.headers.accept.toLowerCase()
        : Array.isArray(request.headers.accept) && typeof request.headers.accept[0] === "string"
          ? request.headers.accept[0].toLowerCase()
          : "";
    const expectsStream = acceptHeader.includes("text/event-stream");
    const likelyCodexResponsesPath = path.toLowerCase().includes("/codex/responses");
    const isSse =
      contentType.includes("text/event-stream") ||
      (response.ok && expectsStream && likelyCodexResponsesPath && contentType.length === 0);

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
