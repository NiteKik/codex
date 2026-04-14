export type AccountStatus = "healthy" | "exhausted" | "cooling" | "invalid";
export type AccountProvisionSource =
  | "manual"
  | "session-import"
  | "browser-capture"
  | "auto-register";
export type AccountProvisionState = "idle" | "running" | "ready" | "failed";

export type AuthMode = "bearer" | "static-headers";
export type WorkspaceKind = "personal" | "team" | "unknown";
export type SubscriptionStatus = "active" | "trial" | "inactive" | "unknown";
export type SubscriptionPlanBucket = "free" | "plus" | "team" | "pro" | "unknown";

export interface AuthConfig {
  mode: AuthMode;
  token?: string;
  headers?: Record<string, string>;
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

export interface RequestTokenUsage {
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cachedInputTokens: number | null;
  totalTokens: number | null;
  captureSource: "json" | "sse";
}

export interface GatewayManagedToken {
  id: string;
  name: string;
  tokenHash: string;
  tokenPreview: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

export interface Account {
  id: string;
  name: string;
  provider: string;
  upstreamBaseUrl: string;
  quotaPath: string;
  proxyPathPrefix: string;
  loginEmail: string | null;
  loginPassword: string | null;
  managedByGateway: boolean;
  provisionSource: AccountProvisionSource;
  provisionState: AccountProvisionState;
  lastProvisionAttemptAt: string | null;
  lastProvisionedAt: string | null;
  lastProvisionError: string | null;
  auth: AuthConfig;
  workspace: WorkspaceContext;
  subscription: SubscriptionContext;
  status: AccountStatus;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  consecutive429: number;
  cooldownUntil: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuotaSnapshot {
  accountId: string;
  weeklyTotal: number;
  weeklyUsed: number;
  weeklyResetAt: string;
  window5hTotal: number;
  window5hUsed: number;
  window5hResetAt: string;
  sampleTime: string;
  source: "poller" | "manual";
  workspaceHint?: WorkspaceContext;
  subscriptionHint?: SubscriptionContext;
}

export interface QuotaState {
  accountId: string;
  weeklyTotal: number;
  weeklyUsed: number;
  weeklyRemaining: number;
  weeklyRemainingRatio: number;
  weeklyResetAt: string | null;
  window5hTotal: number;
  window5hUsed: number;
  window5hRemaining: number;
  window5hRemainingRatio: number;
  window5hResetAt: string | null;
  reservedUnits: number;
  adjustedUnits: number;
  sampleTime: string | null;
}

export interface SessionBinding {
  sessionId: string;
  accountId: string;
  stickyUntil: string;
  migrationCount: number;
  lastRequestAt: string;
}

export interface QuotaReservation {
  id: string;
  requestId: string;
  sessionId: string;
  accountId: string;
  units: number;
  status: "reserved" | "settled" | "released";
  createdAt: string;
  updatedAt: string;
}

export interface RequestLog {
  requestId: string;
  sessionId: string;
  accountId: string;
  path: string;
  method: string;
  attempt: number;
  estimatedUnits: number;
  upstreamStatus: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  startedAt: string;
  finishedAt: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cachedInputTokens: number | null;
  totalTokens: number | null;
  tokenCaptureSource: "json" | "sse" | null;
}

export interface DecisionLog {
  requestId: string;
  sessionId: string;
  selectedAccountId: string;
  reason: string;
  scoreJson: string;
  createdAt: string;
}

export type RuntimeLogLevel = "info" | "warn" | "error";

export interface RuntimeLog {
  level: RuntimeLogLevel;
  scope: string;
  event: string;
  message: string;
  accountId?: string | null;
  requestId?: string | null;
  sessionId?: string | null;
  detailsJson?: string | null;
  createdAt: string;
}

export interface VirtualQuotaPool {
  accountCount: number;
  weeklyTotal: number;
  weeklyUsed: number;
  weeklyRemaining: number;
  window5hTotal: number;
  window5hUsed: number;
  window5hRemaining: number;
}

export interface PlanQuotaPool {
  planBucket: SubscriptionPlanBucket;
  planLabel: string;
  accountCount: number;
  routableAccountCount: number;
  healthyAccountCount: number;
  coolingAccountCount: number;
  exhaustedAccountCount: number;
  invalidAccountCount: number;
  weeklyTotal: number;
  weeklyUsed: number;
  weeklyRemaining: number;
  weeklyRemainingRatio: number;
  window5hTotal: number;
  window5hUsed: number;
  window5hRemaining: number;
  window5hRemainingRatio: number;
  latestSampleTime: string | null;
}

export interface TokenUsageSummary {
  requestCount: number;
  requestsWithUsageCount: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  totalTokens: number;
}

export interface PlanTokenUsageSummary extends TokenUsageSummary {
  planBucket: SubscriptionPlanBucket;
  planLabel: string;
}

export interface ScoreBreakdown {
  accountId: string;
  total: number;
  weeklyRemainingRatio: number;
  windowRemainingRatio: number;
  healthScore: number;
  recentErrorPenalty: number;
  switchingCost: number;
  stickyBonus: number;
  preemptiveEligible: boolean;
  weeklyReserveUnits: number;
  windowReserveUnits: number;
  weeklyRemainingAfterRequest: number;
  windowRemainingAfterRequest: number;
  weeklyResetInMs: number | null;
  windowResetInMs: number | null;
}

export interface ScheduleInput {
  requestId: string;
  sessionId: string;
  path: string;
  method: string;
  estimatedUnits: number;
  excludedAccountIds?: string[];
}

export interface ScheduleDecision {
  account: Account;
  quotaState: QuotaState;
  reservation: QuotaReservation;
  binding: SessionBinding;
  reason: string;
  scores: ScoreBreakdown[];
}

export interface SchedulePreview {
  requestId: string;
  sessionId: string;
  path: string;
  method: string;
  estimatedUnits: number;
  selectedAccountId: string;
  selectedStatus: AccountStatus;
  reason: string;
  stickyAccountId: string | null;
  candidateCount: number;
  scores: ScoreBreakdown[];
}

export interface ProxyExecutionResult {
  upstreamStatus: number;
  responseHeaders: Headers;
  responseBody?: Buffer;
  responseText?: string;
  streamResponse?: Response;
  isSse: boolean;
}
