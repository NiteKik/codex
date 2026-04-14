import type { WorkspaceContext, WorkspaceKind } from "../types.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const pickStringAtPath = (payload: unknown, path: string[]) => {
  let cursor: unknown = payload;
  for (const key of path) {
    if (!isRecord(cursor)) {
      return null;
    }
    cursor = cursor[key];
  }

  return typeof cursor === "string" && cursor.trim().length > 0 ? cursor.trim() : null;
};

const pickRecordAtPath = (payload: unknown, path: string[]) => {
  let cursor: unknown = payload;
  for (const key of path) {
    if (!isRecord(cursor)) {
      return null;
    }
    cursor = cursor[key];
  }

  return isRecord(cursor) ? cursor : null;
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

export const extractWorkspaceFromSession = (payload: unknown): WorkspaceContext => {
  const directWorkspace =
    pickRecordAtPath(payload, ["workspace"]) ??
    pickRecordAtPath(payload, ["active_workspace"]) ??
    pickRecordAtPath(payload, ["current_workspace"]) ??
    pickRecordAtPath(payload, ["selected_workspace"]) ??
    pickRecordAtPath(payload, ["account"]) ??
    pickRecordAtPath(payload, ["active_account"]) ??
    pickRecordAtPath(payload, ["organization"]) ??
    pickRecordAtPath(payload, ["active_organization"]);

  const workspaceId =
    pickStringAtPath(payload, ["active_workspace_id"]) ??
    pickStringAtPath(payload, ["workspace_id"]) ??
    pickStringAtPath(payload, ["default_workspace_id"]) ??
    pickStringAtPath(payload, ["active_account_id"]) ??
    pickStringAtPath(payload, ["account_id"]) ??
    pickStringAtPath(payload, ["organization_id"]) ??
    (directWorkspace
      ? pickStringAtPath(directWorkspace, ["id"]) ??
        pickStringAtPath(directWorkspace, ["workspace_id"]) ??
        pickStringAtPath(directWorkspace, ["account_id"]) ??
        pickStringAtPath(directWorkspace, ["organization_id"])
      : null);

  const workspaceName =
    (directWorkspace
      ? pickStringAtPath(directWorkspace, ["name"]) ??
        pickStringAtPath(directWorkspace, ["display_name"]) ??
        pickStringAtPath(directWorkspace, ["workspace_name"]) ??
        pickStringAtPath(directWorkspace, ["title"])
      : null) ??
    pickStringAtPath(payload, ["workspace_name"]) ??
    pickStringAtPath(payload, ["account_name"]) ??
    pickStringAtPath(payload, ["organization_name"]);

  const kindHint =
    (directWorkspace
      ? pickStringAtPath(directWorkspace, ["type"]) ??
        pickStringAtPath(directWorkspace, ["workspace_type"]) ??
        pickStringAtPath(directWorkspace, ["plan_type"])
      : null) ??
    pickStringAtPath(payload, ["workspace_type"]) ??
    pickStringAtPath(payload, ["account_type"]) ??
    pickStringAtPath(payload, ["organization_type"]) ??
    pickStringAtPath(payload, ["plan_type"]) ??
    pickStringAtPath(payload, ["user", "plan_type"]) ??
    workspaceName;

  return {
    kind: toWorkspaceKind(kindHint),
    id: workspaceId,
    name: workspaceName,
    headers: null,
  };
};

export const parseSessionPayload = (payload: unknown) => {
  const email =
    pickStringAtPath(payload, ["user", "email"]) ?? pickStringAtPath(payload, ["email"]);
  const accessToken =
    pickStringAtPath(payload, ["accessToken"]) ?? pickStringAtPath(payload, ["access_token"]);

  if (!email || !accessToken) {
    return null;
  }

  return {
    email,
    accessToken,
    workspace: extractWorkspaceFromSession(payload),
  };
};
