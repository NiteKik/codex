export type AccountStatus = "healthy" | "exhausted" | "cooling" | "invalid";
export type AuthMode = "bearer" | "static-headers";

export interface AuthConfig {
  mode: AuthMode;
  token?: string;
  headers?: Record<string, string>;
}

export interface AccountQuotaState {
  weeklyRemaining: number;
  weeklyTotal: number;
  weeklyRemainingRatio: number;
  weeklyResetAt: string | null;
  window5hRemaining: number;
  window5hTotal: number;
  window5hRemainingRatio: number;
  window5hResetAt: string | null;
  sampleTime: string | null;
}

export interface AccountRow {
  id: string;
  name: string;
  provider: string;
  upstreamBaseUrl: string;
  quotaPath: string;
  proxyPathPrefix: string;
  auth: AuthConfig;
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
        hasUsagePayload: boolean;
        capturedAt: string;
        profileKey: string;
      }
    | null;
}

const gatewayBaseUrl = "/gateway-api";

export const requestGateway = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${gatewayBaseUrl}${path}`, init);
  const rawText = await response.text();
  const payload = rawText ? (JSON.parse(rawText) as unknown) : null;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message: unknown }).message)
        : `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  return payload as T;
};

export const fetchHealth = () => requestGateway<{ ok: boolean }>("/healthz");

export const fetchAccounts = () => requestGateway<AccountRow[]>("/admin/accounts");

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

export const saveChatgptCaptureTask = (
  taskId: string,
  payload?: {
    id?: string;
    name?: string;
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
