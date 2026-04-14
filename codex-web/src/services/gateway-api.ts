import { getStoredGatewayBaseUrl } from "../utils/gateway-base-url.ts";
import { requestJson } from "./http-client.ts";

export type AccountStatus = "healthy" | "exhausted" | "cooling" | "invalid";
export type AuthMode = "bearer" | "static-headers";
export type WorkspaceKind = "personal" | "team" | "unknown";
export type SubscriptionStatus = "active" | "trial" | "inactive" | "unknown";
export type AccountProvisionSource =
  | "manual"
  | "session-import"
  | "browser-capture"
  | "auto-register";
export type AccountProvisionState = "idle" | "running" | "ready" | "failed";

export interface AuthConfig {
  mode: AuthMode;
  token?: string;
  headers?: Record<string, string>;
}

export interface AccountQuotaState {
  weeklyUsed: number;
  weeklyRemaining: number;
  weeklyTotal: number;
  weeklyRemainingRatio: number;
  weeklyResetAt: string | null;
  window5hUsed: number;
  window5hRemaining: number;
  window5hTotal: number;
  window5hRemainingRatio: number;
  window5hResetAt: string | null;
  reservedUnits: number;
  adjustedUnits: number;
  sampleTime: string | null;
}

export interface WorkspaceContext {
  kind: WorkspaceKind;
  id: string | null;
  name: string | null;
  headers: Record<string, string> | null;
}

export interface SubscriptionContext {
  planType: string | null;
  status: SubscriptionStatus;
}

export interface AccountRow {
  id: string;
  name: string;
  provider: string;
  upstreamBaseUrl: string;
  quotaPath: string;
  proxyPathPrefix: string;
  loginEmail: string | null;
  managedByGateway: boolean;
  provisionSource: AccountProvisionSource;
  provisionState: AccountProvisionState;
  lastProvisionAttemptAt: string | null;
  lastProvisionedAt: string | null;
  lastProvisionError: string | null;
  hasStoredPassword: boolean;
  auth: AuthConfig;
  workspace: WorkspaceContext;
  subscription: SubscriptionContext;
  status: AccountStatus;
  quota: AccountQuotaState;
}

export interface CreateAccountPayload {
  id: string;
  name: string;
  status: AccountStatus;
  auth: AuthConfig;
  provider?: string;
  upstreamBaseUrl?: string;
  quotaPath?: string;
  proxyPathPrefix?: string;
  loginEmail?: string | null;
  loginPassword?: string | null;
  managedByGateway?: boolean;
  provisionSource?: AccountProvisionSource;
  workspace?: WorkspaceContext;
  sessionInfo?: string | null;
  session_info?: string | null;
}

export interface UpdateAccountPayload {
  id: string;
  name: string;
  status: AccountStatus;
  auth?: AuthConfig;
  provider?: string;
  upstreamBaseUrl?: string;
  quotaPath?: string;
  proxyPathPrefix?: string;
  loginEmail?: string | null;
  loginPassword?: string | null;
  managedByGateway?: boolean;
  provisionSource?: AccountProvisionSource;
  workspace?: WorkspaceContext;
}

export interface ChatgptCaptureTask {
  id: string;
  state: "running" | "completed" | "failed";
  profileKey: string;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  progressMessage: string;
  errorMessage: string | null;
  result:
    | {
        email: string;
        workspace: WorkspaceContext;
        hasUsagePayload: boolean;
        capturedAt: string;
        profileKey: string;
      }
    | null;
}

export interface ChatgptRegistrationTask {
  id: string;
  trigger: "manual" | "threshold";
  state: "running" | "completed" | "failed";
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  progressMessage: string;
  progressHistory: Array<{
    message: string;
    at: string;
  }>;
  errorMessage: string | null;
  result:
    | {
        email: string;
        accountId: string;
        workspace: WorkspaceContext;
        capturedAt: string;
      }
    | null;
}

export type GatewayManagedTokenStatus = "active" | "expired" | "revoked";

export interface GatewayManagedTokenItem {
  id: string;
  name: string;
  tokenPreview: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  status: GatewayManagedTokenStatus;
}

export interface GatewayPrimaryTokenInfo {
  token: string;
  tokenPreview: string;
  source: string;
  tokenFilePath: string | null;
}

export interface GatewayTokenListPayload {
  ok: boolean;
  required: boolean;
  primaryToken: GatewayPrimaryTokenInfo;
  tokens: GatewayManagedTokenItem[];
}

export interface AccountUpgradeActivationResult {
  productType: string;
  cdkeyPreview: string;
  checkMessage: string;
  message: string;
  remainingCdks: number;
}

export interface AccountUpgradeResponse {
  ok: boolean;
  account: AccountRow;
  activation: AccountUpgradeActivationResult;
}

export interface CdkProductOption {
  productType: string;
  count: number;
}

export interface CdkOptionsResponse {
  options: CdkProductOption[];
  defaultProductType: string;
}

export const requestGateway = <T>(
  path: string,
  init?: RequestInit,
  baseUrl = getStoredGatewayBaseUrl(),
) => requestJson<T>(baseUrl, path, init);

export const fetchHealth = () => requestGateway<{ ok: boolean }>("/healthz");

export const fetchAccounts = () => requestGateway<AccountRow[]>("/admin/accounts");

export const fetchCdkOptions = () => requestGateway<CdkOptionsResponse>("/admin/cdks/options");

export const triggerQuotaPoll = () =>
  requestGateway<{ ok: boolean }>("/admin/poll", { method: "POST" });

export const createAccount = (payload: CreateAccountPayload) =>
  requestGateway<{ ok: boolean }>("/admin/accounts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

export const updateAccount = (accountId: string, payload: UpdateAccountPayload) =>
  requestGateway<{ ok: boolean; account: AccountRow }>(`/admin/accounts/${encodeURIComponent(accountId)}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

export const deleteAccount = (accountId: string) =>
  requestGateway<{ ok: boolean }>(`/admin/accounts/${encodeURIComponent(accountId)}`, {
    method: "DELETE",
  });

export const upgradeAccountSubscription = (
  accountId: string,
  payload?: {
    productType?: string;
    cdkey?: string;
    force?: boolean;
    sessionInfo?: string | null;
  },
) =>
  requestGateway<AccountUpgradeResponse>(`/admin/accounts/${encodeURIComponent(accountId)}/upgrade`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload ?? {}),
  });

export const startChatgptCapture = (payload?: {
  profileKey?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  browserExecutablePath?: string;
}) =>
  requestGateway<{ ok: boolean; task: ChatgptCaptureTask }>("/admin/chatgpt-capture/start", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload ?? {}),
  });

export const getChatgptCaptureTask = (taskId: string) =>
  requestGateway<{ ok: boolean; task: ChatgptCaptureTask }>(
    `/admin/chatgpt-capture/${encodeURIComponent(taskId)}`,
  );

export const startChatgptRegistration = (payload?: {
  timeoutMs?: number;
  headless?: boolean;
  browserExecutablePath?: string;
}) =>
  requestGateway<{ ok: boolean; task: ChatgptRegistrationTask }>("/admin/chatgpt-register/start", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload ?? {}),
  });

export const getChatgptRegistrationTask = (taskId: string) =>
  requestGateway<{ ok: boolean; task: ChatgptRegistrationTask }>(
    `/admin/chatgpt-register/${encodeURIComponent(taskId)}`,
  );

export const cancelChatgptRegistrationTask = (taskId: string) =>
  requestGateway<{ ok: boolean; task: ChatgptRegistrationTask }>(
    `/admin/chatgpt-register/${encodeURIComponent(taskId)}/cancel`,
    {
      method: "POST",
    },
  );

export const saveChatgptCaptureTask = (
  taskId: string,
  payload?: {
    id?: string;
    name?: string;
    workspace?: WorkspaceContext;
  },
) =>
  requestGateway<{ ok: boolean; account: AccountRow }>(
    `/admin/chatgpt-capture/${encodeURIComponent(taskId)}/save`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload ?? {}),
    },
  );

export const fetchGatewayTokens = () =>
  requestGateway<GatewayTokenListPayload>("/admin/tokens");

export const createGatewayToken = (payload: { name?: string; ttlSeconds?: number | null }) =>
  requestGateway<{
    ok: boolean;
    token: string;
    authHeader: string;
    item: GatewayManagedTokenItem;
  }>("/admin/tokens", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

export const updateGatewayTokenTtl = (tokenId: string, ttlSeconds: number | null) =>
  requestGateway<{ ok: boolean; item: GatewayManagedTokenItem }>(
    `/admin/tokens/${encodeURIComponent(tokenId)}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ttlSeconds,
      }),
    },
  );

export const revokeGatewayToken = (tokenId: string) =>
  requestGateway<{ ok: boolean; item: GatewayManagedTokenItem }>(
    `/admin/tokens/${encodeURIComponent(tokenId)}`,
    {
      method: "DELETE",
    },
  );
