import { requestJson } from "./http-client.ts";

export type GatewayAccessTokenPayload = {
  ok: boolean;
  required: boolean;
  token: string;
  source: string;
  tokenFilePath: string | null;
  authHeader: string;
  codexConfigSnippet: string;
  codexEnvVar?: string;
  windowsSetxCommand?: string;
  windowsSessionCommand?: string;
  providerConfigSnippet?: string;
  openaiBaseUrlConfigSnippet?: string;
  openaiBaseUrlCompatible?: boolean;
  strategyDiff?: {
    providerMode?: string;
    openaiBaseUrlMode?: string;
  };
};

export type GatewaySettingsPayload = {
  ok: boolean;
  pollIntervalMs: number;
  pollIntervalSeconds: number;
  pollIntervalRange: {
    minSeconds: number;
    maxSeconds: number;
  };
  tempMailBaseUrl: string;
  tempMailAdminPassword: string;
  tempMailSitePassword: string;
  tempMailDefaultDomain: string;
  managedBrowserExecutablePath: string;
  autoRegisterEnabled: boolean;
  enableFreeAccountScheduling: boolean;
  autoRegisterThreshold: number;
  autoRegisterBatchSize: number;
  autoRegisterCheckIntervalSeconds: number;
  autoRegisterTimeoutSeconds: number;
  autoRegisterHeadless: boolean;
  autoRegisterRanges: {
    threshold: {
      min: number;
      max: number;
    };
    batchSize: {
      min: number;
      max: number;
    };
    checkIntervalSeconds: {
      min: number;
      max: number;
    };
    timeoutSeconds: {
      min: number;
      max: number;
    };
  };
};

export type CodexAutoConfigStatusPayload = {
  ok: boolean;
  enabled: boolean;
  active: boolean;
  mode: "provider_auth" | "provider_env" | "openai_base_url" | "openai_base_url_no_forced";
  resolvedMode?: "provider_auth" | "provider_env" | "openai_base_url" | "openai_base_url_no_forced";
  bunAvailable?: boolean;
  configPath: string;
  backupPath: string;
  backupExists: boolean;
  guardianPid: number | null;
  guardianRunning: boolean;
  lastError: string | null;
  lastAppliedAt: string | null;
};

export type RuntimeLog = {
  id: number;
  level: "info" | "warn" | "error";
  scope: string;
  event: string;
  message: string;
  account_id: string | null;
  request_id: string | null;
  session_id: string | null;
  details_json: string | null;
  created_at: string;
};

export const fetchGatewayAccessToken = (baseUrl: string) =>
  requestJson<GatewayAccessTokenPayload>(baseUrl, "/admin/access-token");

export const fetchGatewaySettings = (baseUrl: string) =>
  requestJson<GatewaySettingsPayload>(baseUrl, "/admin/settings");

export const updateGatewaySettings = (
  baseUrl: string,
  payload: {
    pollIntervalSeconds: number;
    tempMailBaseUrl?: string;
    tempMailAdminPassword?: string;
    tempMailSitePassword?: string;
    tempMailDefaultDomain?: string;
    managedBrowserExecutablePath?: string;
    autoRegisterEnabled?: boolean;
    enableFreeAccountScheduling?: boolean;
    autoRegisterThreshold?: number;
    autoRegisterBatchSize?: number;
    autoRegisterCheckIntervalSeconds?: number;
    autoRegisterTimeoutSeconds?: number;
    autoRegisterHeadless?: boolean;
  },
) =>
  requestJson<GatewaySettingsPayload>(baseUrl, "/admin/settings", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

export const fetchCodexAutoConfigStatus = (baseUrl: string) =>
  requestJson<CodexAutoConfigStatusPayload>(baseUrl, "/admin/codex-auto-config");

export const updateCodexAutoConfigStatus = (
  baseUrl: string,
  enabled: boolean,
  mode?: "provider_auth" | "provider_env" | "openai_base_url" | "openai_base_url_no_forced",
) =>
  requestJson<CodexAutoConfigStatusPayload>(baseUrl, "/admin/codex-auto-config", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      enabled,
      ...(mode ? { mode } : {}),
    }),
  });

export const fetchRuntimeLogs = (
  baseUrl: string,
  options?: {
    runtimeLimit?: number;
    requestLimit?: number;
    decisionLimit?: number;
  },
) => {
  const requestLimit = options?.requestLimit ?? 1;
  const decisionLimit = options?.decisionLimit ?? 1;
  const runtimeLimit = options?.runtimeLimit ?? 80;
  const query = new URLSearchParams({
    request_limit: String(requestLimit),
    decision_limit: String(decisionLimit),
    runtime_limit: String(runtimeLimit),
  });

  return requestJson<{ runtime?: RuntimeLog[] }>(
    baseUrl,
    `/admin/logs?${query.toString()}`,
  );
};
