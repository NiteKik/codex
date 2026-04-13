import type { WorkspaceContext, WorkspaceKind } from "../services/gateway-api.ts";

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const pickRecordByPath = (payload: unknown, path: string[]) => {
  let cursor: unknown = payload;
  for (const key of path) {
    if (!isRecord(cursor)) {
      return null;
    }
    cursor = cursor[key];
  }

  return isRecord(cursor) ? cursor : null;
};

const pickStringByPath = (payload: unknown, path: string[]) => {
  let cursor: unknown = payload;
  for (const key of path) {
    if (!isRecord(cursor)) {
      return null;
    }
    cursor = cursor[key];
  }

  return typeof cursor === "string" && cursor.trim().length > 0 ? cursor.trim() : null;
};

const findStringByKeys = (
  value: unknown,
  keys: Set<string>,
  depth = 0,
): string | null => {
  if (depth > 6 || value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringByKeys(item, keys, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const [key, current] of Object.entries(record)) {
      if (
        keys.has(key) &&
        typeof current === "string" &&
        current.trim().length > 0
      ) {
        return current.trim();
      }
    }

    for (const current of Object.values(record)) {
      const found = findStringByKeys(current, keys, depth + 1);
      if (found) {
        return found;
      }
    }
  }

  return null;
};

const toWorkspaceKind = (value: string | null): WorkspaceKind => {
  const normalized = value?.trim().toLowerCase() ?? "";
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

const extractWorkspaceContext = (payload: unknown): WorkspaceContext => {
  const directWorkspace =
    pickRecordByPath(payload, ["workspace"]) ??
    pickRecordByPath(payload, ["active_workspace"]) ??
    pickRecordByPath(payload, ["current_workspace"]) ??
    pickRecordByPath(payload, ["selected_workspace"]) ??
    pickRecordByPath(payload, ["account"]) ??
    pickRecordByPath(payload, ["active_account"]) ??
    pickRecordByPath(payload, ["organization"]) ??
    pickRecordByPath(payload, ["active_organization"]);

  const id =
    pickStringByPath(payload, ["active_workspace_id"]) ??
    pickStringByPath(payload, ["workspace_id"]) ??
    pickStringByPath(payload, ["default_workspace_id"]) ??
    pickStringByPath(payload, ["active_account_id"]) ??
    pickStringByPath(payload, ["account_id"]) ??
    pickStringByPath(payload, ["organization_id"]) ??
    (directWorkspace
      ? pickStringByPath(directWorkspace, ["id"]) ??
        pickStringByPath(directWorkspace, ["workspace_id"]) ??
        pickStringByPath(directWorkspace, ["account_id"]) ??
        pickStringByPath(directWorkspace, ["organization_id"])
      : null);

  const name =
    (directWorkspace
      ? pickStringByPath(directWorkspace, ["name"]) ??
        pickStringByPath(directWorkspace, ["display_name"]) ??
        pickStringByPath(directWorkspace, ["workspace_name"]) ??
        pickStringByPath(directWorkspace, ["title"])
      : null) ??
    pickStringByPath(payload, ["workspace_name"]) ??
    pickStringByPath(payload, ["account_name"]) ??
    pickStringByPath(payload, ["organization_name"]);

  const kindHint =
    (directWorkspace
      ? pickStringByPath(directWorkspace, ["type"]) ??
        pickStringByPath(directWorkspace, ["workspace_type"]) ??
        pickStringByPath(directWorkspace, ["plan_type"])
      : null) ??
    pickStringByPath(payload, ["workspace_type"]) ??
    pickStringByPath(payload, ["account_type"]) ??
    pickStringByPath(payload, ["organization_type"]) ??
    pickStringByPath(payload, ["plan_type"]) ??
    pickStringByPath(payload, ["user", "plan_type"]) ??
    name;

  return {
    kind: toWorkspaceKind(kindHint),
    id,
    name,
    headers: null,
  };
};

export type SessionParseResult =
  | {
      ok: true;
      email: string;
    }
  | {
      ok: false;
      message: string;
    };

export type SessionAuthParseResult =
  | {
      ok: true;
      email: string;
      accessToken: string;
      workspace: WorkspaceContext;
    }
  | {
      ok: false;
      message: string;
    };

export function parseSessionPayload(payload: string): SessionParseResult {
  const trimmedPayload = payload.trim();

  if (!trimmedPayload) {
    return {
      ok: false,
      message: "请先粘贴完整的 Session 响应",
    };
  }

  try {
    const parsedPayload = JSON.parse(trimmedPayload) as {
      user?: {
        email?: unknown;
      };
    };
    const email = parsedPayload.user?.email;

    if (typeof email === "string" && EMAIL_PATTERN.test(email)) {
      return {
        ok: true,
        email,
      };
    }
  } catch {
    const fallbackEmail = trimmedPayload.match(EMAIL_PATTERN)?.[0];

    if (fallbackEmail) {
      return {
        ok: true,
        email: fallbackEmail,
      };
    }

    return {
      ok: false,
      message: "Session 格式无效，请粘贴 /api/auth/session 返回的完整 JSON",
    };
  }

  const fallbackEmail = trimmedPayload.match(EMAIL_PATTERN)?.[0];
  if (fallbackEmail) {
    return {
      ok: true,
      email: fallbackEmail,
    };
  }

  return {
    ok: false,
    message: "未识别到邮箱，请确认粘贴的是 /api/auth/session 的完整 JSON",
  };
}

export function parseSessionAuthPayload(
  payload: string,
): SessionAuthParseResult {
  const trimmedPayload = payload.trim();
  if (!trimmedPayload) {
    return {
      ok: false,
      message: "请先粘贴完整的 Session 响应",
    };
  }

  try {
    const parsedPayload = JSON.parse(trimmedPayload) as unknown;
    const email = findStringByKeys(parsedPayload, new Set(["email"]));
    const accessToken = findStringByKeys(parsedPayload, new Set(["accessToken", "access_token"]));

    if (!email || !EMAIL_PATTERN.test(email)) {
      return {
        ok: false,
        message: "未识别到邮箱，请确认粘贴的是 /api/auth/session 的完整 JSON",
      };
    }

    if (!accessToken) {
      return {
        ok: false,
        message: "未识别到 access token，请重新复制 /api/auth/session 的完整 JSON。",
      };
    }

    return {
      ok: true,
      email,
      accessToken,
      workspace: extractWorkspaceContext(parsedPayload),
    };
  } catch {
    return {
      ok: false,
      message: "Session 格式无效，请粘贴 /api/auth/session 返回的完整 JSON",
    };
  }
}
