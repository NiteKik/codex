import BetterSqlite3, { type Database as BetterSqlite3Database } from "better-sqlite3";
import { readFileSync } from "node:fs";
import { nowIso } from "../utils/time.js";
import type {
  Account,
  AccountProvisionSource,
  AccountProvisionState,
  AccountStatus,
  DecisionLog,
  GatewayManagedToken,
  QuotaReservation,
  QuotaSnapshot,
  RequestLog,
  RuntimeLog,
  SessionBinding,
  SubscriptionStatus,
  WorkspaceKind,
} from "../types.js";

const readSchema = () => readFileSync(new URL("../../src/db/schema.sql", import.meta.url), "utf8");

const toText = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("utf8");
  }

  return JSON.stringify(value);
};

const toNullableText = (value: unknown) =>
  value === null || value === undefined ? null : toText(value);

const parseNullableStringMap = (value: unknown): Record<string, string> | null => {
  const text = toNullableText(value);
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, mapValue]) =>
        typeof mapValue === "string" ? [[key, mapValue]] : [],
      ),
    );
  } catch {
    return null;
  }
};

const parseWorkspaceKind = (value: unknown): WorkspaceKind => {
  const normalized = toNullableText(value)?.trim().toLowerCase();
  if (normalized === "personal" || normalized === "team" || normalized === "unknown") {
    return normalized;
  }

  return "unknown";
};

const parseSubscriptionStatus = (value: unknown): SubscriptionStatus => {
  const normalized = toNullableText(value)?.trim().toLowerCase();
  if (
    normalized === "active" ||
    normalized === "trial" ||
    normalized === "inactive" ||
    normalized === "unknown"
  ) {
    return normalized;
  }

  return "unknown";
};

const parseBoolean = (value: unknown, fallback = false) => {
  if (typeof value === "boolean") {
    return value;
  }

  const text = toNullableText(value)?.trim().toLowerCase();
  if (!text) {
    return fallback;
  }

  if (text === "1" || text === "true" || text === "yes" || text === "on") {
    return true;
  }

  if (text === "0" || text === "false" || text === "no" || text === "off") {
    return false;
  }

  return fallback;
};

const parseProvisionSource = (value: unknown): AccountProvisionSource => {
  const normalized = toNullableText(value)?.trim().toLowerCase();
  if (
    normalized === "manual" ||
    normalized === "session-import" ||
    normalized === "browser-capture" ||
    normalized === "auto-register"
  ) {
    return normalized;
  }

  return "manual";
};

const parseProvisionState = (value: unknown): AccountProvisionState => {
  const normalized = toNullableText(value)?.trim().toLowerCase();
  if (
    normalized === "idle" ||
    normalized === "running" ||
    normalized === "ready" ||
    normalized === "failed"
  ) {
    return normalized;
  }

  return "idle";
};

const parseAccount = (row: Record<string, unknown>): Account => ({
  id: toText(row.id),
  name: toText(row.name),
  provider: toText(row.provider),
  upstreamBaseUrl: toText(row.upstream_base_url),
  quotaPath: toText(row.quota_path),
  proxyPathPrefix: toText(row.proxy_path_prefix),
  loginEmail: toNullableText(row.login_email),
  loginPassword: toNullableText(row.login_password),
  managedByGateway: parseBoolean(row.managed_by_gateway),
  provisionSource: parseProvisionSource(row.provision_source),
  provisionState: parseProvisionState(row.provision_state),
  lastProvisionAttemptAt: toNullableText(row.last_provision_attempt_at),
  lastProvisionedAt: toNullableText(row.last_provisioned_at),
  lastProvisionError: toNullableText(row.last_provision_error),
  auth: JSON.parse(toText(row.auth_json)),
  workspace: {
    kind: parseWorkspaceKind(row.workspace_kind),
    id: toNullableText(row.workspace_id),
    name: toNullableText(row.workspace_name),
    headers: parseNullableStringMap(row.workspace_headers_json),
  },
  subscription: {
    planType: toNullableText(row.subscription_plan_type),
    status: parseSubscriptionStatus(row.subscription_status),
  },
  status: row.status as AccountStatus,
  successCount: Number(row.success_count),
  failureCount: Number(row.failure_count),
  consecutiveFailures: Number(row.consecutive_failures),
  consecutive429: Number(row.consecutive_429),
  cooldownUntil: toNullableText(row.cooldown_until),
  lastErrorCode: toNullableText(row.last_error_code),
  lastErrorMessage: toNullableText(row.last_error_message),
  createdAt: toText(row.created_at),
  updatedAt: toText(row.updated_at),
});

const parseGatewayManagedToken = (row: Record<string, unknown>): GatewayManagedToken => ({
  id: toText(row.id),
  name: toText(row.name),
  tokenHash: toText(row.token_hash),
  tokenPreview: toText(row.token_preview),
  createdAt: toText(row.created_at),
  expiresAt: toNullableText(row.expires_at),
  revokedAt: toNullableText(row.revoked_at),
  lastUsedAt: toNullableText(row.last_used_at),
});

export class GatewayDatabase {
  readonly sqlite: BetterSqlite3Database;

  constructor(filePath: string) {
    this.sqlite = new BetterSqlite3(filePath);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("foreign_keys = ON");
  }

  init() {
    this.sqlite.exec(readSchema());
    this.applyMigrations();
  }

  close() {
    this.sqlite.close();
  }

  private applyMigrations() {
    const accountColumns = this.sqlite
      .prepare("PRAGMA table_info(accounts)")
      .all() as Array<{ name?: unknown }>;
    const existingAccountColumns = new Set(
      accountColumns
        .map((column) => toNullableText(column.name)?.toLowerCase())
        .filter((value): value is string => Boolean(value)),
    );

    if (!existingAccountColumns.has("workspace_kind")) {
      this.sqlite.exec(
        "ALTER TABLE accounts ADD COLUMN workspace_kind TEXT NOT NULL DEFAULT 'unknown'",
      );
    }
    if (!existingAccountColumns.has("login_email")) {
      this.sqlite.exec("ALTER TABLE accounts ADD COLUMN login_email TEXT");
    }
    if (!existingAccountColumns.has("login_password")) {
      this.sqlite.exec("ALTER TABLE accounts ADD COLUMN login_password TEXT");
    }
    if (!existingAccountColumns.has("managed_by_gateway")) {
      this.sqlite.exec(
        "ALTER TABLE accounts ADD COLUMN managed_by_gateway INTEGER NOT NULL DEFAULT 0",
      );
    }
    if (!existingAccountColumns.has("provision_source")) {
      this.sqlite.exec(
        "ALTER TABLE accounts ADD COLUMN provision_source TEXT NOT NULL DEFAULT 'manual'",
      );
    }
    if (!existingAccountColumns.has("provision_state")) {
      this.sqlite.exec(
        "ALTER TABLE accounts ADD COLUMN provision_state TEXT NOT NULL DEFAULT 'idle'",
      );
    }
    if (!existingAccountColumns.has("last_provision_attempt_at")) {
      this.sqlite.exec("ALTER TABLE accounts ADD COLUMN last_provision_attempt_at TEXT");
    }
    if (!existingAccountColumns.has("last_provisioned_at")) {
      this.sqlite.exec("ALTER TABLE accounts ADD COLUMN last_provisioned_at TEXT");
    }
    if (!existingAccountColumns.has("last_provision_error")) {
      this.sqlite.exec("ALTER TABLE accounts ADD COLUMN last_provision_error TEXT");
    }
    if (!existingAccountColumns.has("workspace_id")) {
      this.sqlite.exec("ALTER TABLE accounts ADD COLUMN workspace_id TEXT");
    }
    if (!existingAccountColumns.has("workspace_name")) {
      this.sqlite.exec("ALTER TABLE accounts ADD COLUMN workspace_name TEXT");
    }
    if (!existingAccountColumns.has("workspace_headers_json")) {
      this.sqlite.exec("ALTER TABLE accounts ADD COLUMN workspace_headers_json TEXT");
    }
    if (!existingAccountColumns.has("subscription_plan_type")) {
      this.sqlite.exec("ALTER TABLE accounts ADD COLUMN subscription_plan_type TEXT");
    }
    if (!existingAccountColumns.has("subscription_status")) {
      this.sqlite.exec(
        "ALTER TABLE accounts ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'unknown'",
      );
    }

    const requestLogColumns = this.sqlite
      .prepare("PRAGMA table_info(request_logs)")
      .all() as Array<{ name?: unknown }>;
    const existingRequestLogColumns = new Set(
      requestLogColumns
        .map((column) => toNullableText(column.name)?.toLowerCase())
        .filter((value): value is string => Boolean(value)),
    );

    if (!existingRequestLogColumns.has("model")) {
      this.sqlite.exec("ALTER TABLE request_logs ADD COLUMN model TEXT");
    }
    if (!existingRequestLogColumns.has("input_tokens")) {
      this.sqlite.exec("ALTER TABLE request_logs ADD COLUMN input_tokens INTEGER");
    }
    if (!existingRequestLogColumns.has("output_tokens")) {
      this.sqlite.exec("ALTER TABLE request_logs ADD COLUMN output_tokens INTEGER");
    }
    if (!existingRequestLogColumns.has("reasoning_tokens")) {
      this.sqlite.exec("ALTER TABLE request_logs ADD COLUMN reasoning_tokens INTEGER");
    }
    if (!existingRequestLogColumns.has("cached_input_tokens")) {
      this.sqlite.exec("ALTER TABLE request_logs ADD COLUMN cached_input_tokens INTEGER");
    }
    if (!existingRequestLogColumns.has("total_tokens")) {
      this.sqlite.exec("ALTER TABLE request_logs ADD COLUMN total_tokens INTEGER");
    }
    if (!existingRequestLogColumns.has("token_capture_source")) {
      this.sqlite.exec("ALTER TABLE request_logs ADD COLUMN token_capture_source TEXT");
    }
  }

  getRuntimeSetting(key: string) {
    const row = this.sqlite
      .prepare("SELECT value FROM runtime_settings WHERE key = ? LIMIT 1")
      .get(key) as { value?: unknown } | undefined;
    return row ? toNullableText(row.value) : null;
  }

  setRuntimeSetting(key: string, value: string) {
    this.sqlite
      .prepare(
        `
        INSERT INTO runtime_settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
        `,
      )
      .run(key, value, nowIso());
  }

  deleteRuntimeSetting(key: string) {
    this.sqlite.prepare("DELETE FROM runtime_settings WHERE key = ?").run(key);
  }

  getPollIntervalMs() {
    const stored = this.getRuntimeSetting("poll_interval_ms");
    if (!stored) {
      return null;
    }

    const parsed = Number(stored);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }

    return Math.floor(parsed);
  }

  setPollIntervalMs(intervalMs: number) {
    const normalized = Math.max(1_000, Math.floor(intervalMs));
    this.setRuntimeSetting("poll_interval_ms", String(normalized));
    return normalized;
  }

  createGatewayToken(token: GatewayManagedToken) {
    this.sqlite
      .prepare(
        `
        INSERT INTO gateway_tokens (
          id, name, token_hash, token_preview, created_at, expires_at, revoked_at, last_used_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        token.id,
        token.name,
        token.tokenHash,
        token.tokenPreview,
        token.createdAt,
        token.expiresAt,
        token.revokedAt,
        token.lastUsedAt,
      );
  }

  listGatewayTokens() {
    const rows = this.sqlite
      .prepare("SELECT * FROM gateway_tokens ORDER BY created_at DESC")
      .all() as Record<string, unknown>[];
    return rows.map(parseGatewayManagedToken);
  }

  getGatewayTokenById(tokenId: string) {
    const row = this.sqlite.prepare("SELECT * FROM gateway_tokens WHERE id = ?").get(tokenId) as
      | Record<string, unknown>
      | undefined;
    return row ? parseGatewayManagedToken(row) : null;
  }

  getGatewayTokenByHash(tokenHash: string) {
    const row = this.sqlite
      .prepare("SELECT * FROM gateway_tokens WHERE token_hash = ? LIMIT 1")
      .get(tokenHash) as Record<string, unknown> | undefined;
    return row ? parseGatewayManagedToken(row) : null;
  }

  updateGatewayTokenExpiry(tokenId: string, expiresAt: string | null) {
    const result = this.sqlite
      .prepare(
        `
        UPDATE gateway_tokens
        SET expires_at = ?
        WHERE id = ?
        `,
      )
      .run(expiresAt, tokenId);

    return Number(result.changes ?? 0);
  }

  revokeGatewayToken(tokenId: string, revokedAt = nowIso()) {
    const result = this.sqlite
      .prepare(
        `
        UPDATE gateway_tokens
        SET revoked_at = ?
        WHERE id = ? AND revoked_at IS NULL
        `,
      )
      .run(revokedAt, tokenId);

    return Number(result.changes ?? 0);
  }

  touchGatewayTokenLastUsed(tokenId: string, lastUsedAt = nowIso()) {
    const result = this.sqlite
      .prepare(
        `
        UPDATE gateway_tokens
        SET last_used_at = ?
        WHERE id = ?
        `,
      )
      .run(lastUsedAt, tokenId);

    return Number(result.changes ?? 0);
  }

  upsertAccount(
    account: Omit<Account, "createdAt" | "updatedAt"> &
      Partial<Pick<Account, "createdAt" | "updatedAt">>,
  ) {
    const timestamp = nowIso();
    this.sqlite
      .prepare(
        `
        INSERT INTO accounts (
          id, name, provider, upstream_base_url, quota_path, proxy_path_prefix,
          login_email, login_password, managed_by_gateway, provision_source, provision_state,
          last_provision_attempt_at, last_provisioned_at, last_provision_error,
          auth_json,
          workspace_kind, workspace_id, workspace_name, workspace_headers_json,
          subscription_plan_type, subscription_status,
          status, success_count, failure_count, consecutive_failures, consecutive_429,
          cooldown_until, last_error_code, last_error_message, created_at, updated_at
        ) VALUES (
          @id, @name, @provider, @upstreamBaseUrl, @quotaPath, @proxyPathPrefix,
          @loginEmail, @loginPassword, @managedByGateway, @provisionSource, @provisionState,
          @lastProvisionAttemptAt, @lastProvisionedAt, @lastProvisionError,
          @authJson,
          @workspaceKind, @workspaceId, @workspaceName, @workspaceHeadersJson,
          @subscriptionPlanType, @subscriptionStatus,
          @status, @successCount, @failureCount, @consecutiveFailures, @consecutive429,
          @cooldownUntil, @lastErrorCode, @lastErrorMessage, @createdAt, @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          provider = excluded.provider,
          upstream_base_url = excluded.upstream_base_url,
          quota_path = excluded.quota_path,
          proxy_path_prefix = excluded.proxy_path_prefix,
          login_email = excluded.login_email,
          login_password = excluded.login_password,
          managed_by_gateway = excluded.managed_by_gateway,
          provision_source = excluded.provision_source,
          provision_state = excluded.provision_state,
          last_provision_attempt_at = excluded.last_provision_attempt_at,
          last_provisioned_at = excluded.last_provisioned_at,
          last_provision_error = excluded.last_provision_error,
          auth_json = excluded.auth_json,
          workspace_kind = excluded.workspace_kind,
          workspace_id = excluded.workspace_id,
          workspace_name = excluded.workspace_name,
          workspace_headers_json = excluded.workspace_headers_json,
          subscription_plan_type = excluded.subscription_plan_type,
          subscription_status = excluded.subscription_status,
          status = excluded.status,
          success_count = excluded.success_count,
          failure_count = excluded.failure_count,
          consecutive_failures = excluded.consecutive_failures,
          consecutive_429 = excluded.consecutive_429,
          cooldown_until = excluded.cooldown_until,
          last_error_code = excluded.last_error_code,
          last_error_message = excluded.last_error_message,
          updated_at = excluded.updated_at
        `,
      )
      .run({
        id: account.id,
        name: account.name,
        provider: account.provider,
        upstreamBaseUrl: account.upstreamBaseUrl,
        quotaPath: account.quotaPath,
        proxyPathPrefix: account.proxyPathPrefix,
        loginEmail: account.loginEmail,
        loginPassword: account.loginPassword,
        managedByGateway: account.managedByGateway ? 1 : 0,
        provisionSource: account.provisionSource,
        provisionState: account.provisionState,
        lastProvisionAttemptAt: account.lastProvisionAttemptAt,
        lastProvisionedAt: account.lastProvisionedAt,
        lastProvisionError: account.lastProvisionError,
        authJson: JSON.stringify(account.auth),
        workspaceKind: account.workspace.kind,
        workspaceId: account.workspace.id,
        workspaceName: account.workspace.name,
        workspaceHeadersJson: account.workspace.headers
          ? JSON.stringify(account.workspace.headers)
          : null,
        subscriptionPlanType: account.subscription.planType,
        subscriptionStatus: account.subscription.status,
        status: account.status,
        successCount: account.successCount,
        failureCount: account.failureCount,
        consecutiveFailures: account.consecutiveFailures,
        consecutive429: account.consecutive429,
        cooldownUntil: account.cooldownUntil,
        lastErrorCode: account.lastErrorCode,
        lastErrorMessage: account.lastErrorMessage,
        createdAt: account.createdAt ?? timestamp,
        updatedAt: account.updatedAt ?? timestamp,
      });
  }

  listAccounts() {
    const rows = this.sqlite.prepare("SELECT * FROM accounts ORDER BY id").all() as Record<
      string,
      unknown
    >[];
    return rows.map(parseAccount);
  }

  getAccount(accountId: string) {
    const row = this.sqlite.prepare("SELECT * FROM accounts WHERE id = ?").get(accountId) as
      | Record<string, unknown>
      | undefined;
    return row ? parseAccount(row) : null;
  }

  updateAccountState(
    accountId: string,
    patch: Partial<
      Omit<
        Account,
        | "id"
        | "auth"
        | "workspace"
        | "name"
        | "provider"
        | "upstreamBaseUrl"
        | "quotaPath"
        | "proxyPathPrefix"
        | "createdAt"
      >
    >,
  ) {
    const current = this.getAccount(accountId);

    if (!current) {
      throw new Error(`Account not found: ${accountId}`);
    }

    this.upsertAccount({
      ...current,
      ...patch,
      updatedAt: nowIso(),
    });
  }

  deleteAccountWithRelatedData(accountId: string) {
    this.sqlite.exec("BEGIN");

    try {
      this.sqlite.prepare("DELETE FROM quota_snapshots WHERE account_id = ?").run(accountId);
      this.sqlite.prepare("DELETE FROM session_bindings WHERE account_id = ?").run(accountId);
      this.sqlite.prepare("DELETE FROM quota_reservations WHERE account_id = ?").run(accountId);
      this.sqlite.prepare("DELETE FROM quota_adjustments WHERE account_id = ?").run(accountId);
      this.sqlite.prepare("DELETE FROM request_logs WHERE account_id = ?").run(accountId);
      this.sqlite.prepare("DELETE FROM decision_logs WHERE selected_account_id = ?").run(accountId);
      this.sqlite.prepare("DELETE FROM accounts WHERE id = ?").run(accountId);
      this.sqlite.exec("COMMIT");
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  saveQuotaSnapshot(snapshot: QuotaSnapshot) {
    this.sqlite
      .prepare(
        `
        INSERT INTO quota_snapshots (
          account_id, weekly_total, weekly_used, weekly_reset_at,
          window_5h_total, window_5h_used, window_5h_reset_at, sample_time, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        snapshot.accountId,
        snapshot.weeklyTotal,
        snapshot.weeklyUsed,
        snapshot.weeklyResetAt,
        snapshot.window5hTotal,
        snapshot.window5hUsed,
        snapshot.window5hResetAt,
        snapshot.sampleTime,
        snapshot.source,
      );
  }

  getLatestQuotaSnapshot(accountId: string) {
    return (this.sqlite
      .prepare(
        `
        SELECT
          account_id as accountId,
          weekly_total as weeklyTotal,
          weekly_used as weeklyUsed,
          weekly_reset_at as weeklyResetAt,
          window_5h_total as window5hTotal,
          window_5h_used as window5hUsed,
          window_5h_reset_at as window5hResetAt,
          sample_time as sampleTime,
          source
        FROM quota_snapshots
        WHERE account_id = ?
        ORDER BY sample_time DESC
        LIMIT 1
        `,
      )
      .get(accountId) ?? null) as QuotaSnapshot | null;
  }

  getSessionBinding(sessionId: string) {
    return (this.sqlite
      .prepare(
        `
        SELECT
          session_id as sessionId,
          account_id as accountId,
          sticky_until as stickyUntil,
          migration_count as migrationCount,
          last_request_at as lastRequestAt
        FROM session_bindings
        WHERE session_id = ?
        `,
      )
      .get(sessionId) ?? null) as SessionBinding | null;
  }

  upsertSessionBinding(binding: SessionBinding) {
    this.sqlite
      .prepare(
        `
        INSERT INTO session_bindings (
          session_id, account_id, sticky_until, migration_count, last_request_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          account_id = excluded.account_id,
          sticky_until = excluded.sticky_until,
          migration_count = excluded.migration_count,
          last_request_at = excluded.last_request_at
        `,
      )
      .run(
        binding.sessionId,
        binding.accountId,
        binding.stickyUntil,
        binding.migrationCount,
        binding.lastRequestAt,
      );
  }

  createReservation(reservation: QuotaReservation) {
    this.sqlite
      .prepare(
        `
        INSERT INTO quota_reservations (
          id, request_id, session_id, account_id, units, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        reservation.id,
        reservation.requestId,
        reservation.sessionId,
        reservation.accountId,
        reservation.units,
        reservation.status,
        reservation.createdAt,
        reservation.updatedAt,
      );
  }

  updateReservation(reservationId: string, status: QuotaReservation["status"]) {
    this.sqlite
      .prepare(
        `
        UPDATE quota_reservations
        SET status = ?, updated_at = ?
        WHERE id = ?
        `,
      )
      .run(status, nowIso(), reservationId);
  }

  getOpenReservationUnits(accountId: string) {
    const row = this.sqlite
      .prepare(
        `
        SELECT COALESCE(SUM(units), 0) AS total
        FROM quota_reservations
        WHERE account_id = ? AND status = 'reserved'
        `,
      )
      .get(accountId) as { total: number };

    return Number(row.total);
  }

  addAdjustment(accountId: string, requestId: string, units: number) {
    this.sqlite
      .prepare(
        `
        INSERT INTO quota_adjustments (account_id, request_id, units, reconciled, created_at)
        VALUES (?, ?, ?, 0, ?)
        `,
      )
      .run(accountId, requestId, units, nowIso());
  }

  getUnreconciledAdjustmentUnits(accountId: string) {
    const row = this.sqlite
      .prepare(
        `
        SELECT COALESCE(SUM(units), 0) AS total
        FROM quota_adjustments
        WHERE account_id = ? AND reconciled = 0
        `,
      )
      .get(accountId) as { total: number };

    return Number(row.total);
  }

  reconcileAdjustments(accountId: string) {
    const result = this.sqlite
      .prepare(
        "UPDATE quota_adjustments SET reconciled = 1 WHERE account_id = ? AND reconciled = 0",
      )
      .run(accountId);

    return Number(result.changes ?? 0);
  }

  consumeUnreconciledAdjustments(accountId: string, units: number) {
    const targetUnits = Math.max(0, Math.floor(units));
    if (targetUnits <= 0) {
      return 0;
    }

    const rows = this.sqlite
      .prepare(
        `
        SELECT id, units
        FROM quota_adjustments
        WHERE account_id = ? AND reconciled = 0
        ORDER BY id ASC
        `,
      )
      .all(accountId) as Array<{ id: number; units: number }>;

    if (rows.length === 0) {
      return 0;
    }

    const reconcileStmt = this.sqlite.prepare(
      "UPDATE quota_adjustments SET reconciled = 1 WHERE id = ?",
    );
    const reduceStmt = this.sqlite.prepare(
      "UPDATE quota_adjustments SET units = ? WHERE id = ?",
    );

    let remaining = targetUnits;
    let consumed = 0;

    this.sqlite.exec("BEGIN");
    try {
      for (const row of rows) {
        if (remaining <= 0) {
          break;
        }

        const parsedUnits = Number(row.units);
        const rowUnits = Number.isFinite(parsedUnits) ? Math.max(0, parsedUnits) : 0;
        if (rowUnits <= 0) {
          reconcileStmt.run(row.id);
          continue;
        }

        if (rowUnits <= remaining) {
          reconcileStmt.run(row.id);
          consumed += rowUnits;
          remaining -= rowUnits;
          continue;
        }

        reduceStmt.run(rowUnits - remaining, row.id);
        consumed += remaining;
        remaining = 0;
      }

      this.sqlite.exec("COMMIT");
      return consumed;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  logDecision(entry: DecisionLog) {
    this.sqlite
      .prepare(
        `
        INSERT INTO decision_logs (
          request_id, session_id, selected_account_id, reason, score_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        entry.requestId,
        entry.sessionId,
        entry.selectedAccountId,
        entry.reason,
        entry.scoreJson,
        entry.createdAt,
      );
  }

  logRequestStart(entry: RequestLog) {
    this.sqlite
      .prepare(
        `
        INSERT INTO request_logs (
          request_id, session_id, account_id, path, method, attempt, estimated_units,
          upstream_status, error_code, error_message, duration_ms, started_at, finished_at,
          model, input_tokens, output_tokens, reasoning_tokens, cached_input_tokens, total_tokens,
          token_capture_source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        entry.requestId,
        entry.sessionId,
        entry.accountId,
        entry.path,
        entry.method,
        entry.attempt,
        entry.estimatedUnits,
        entry.upstreamStatus,
        entry.errorCode,
        entry.errorMessage,
        entry.durationMs,
        entry.startedAt,
        entry.finishedAt,
        entry.model,
        entry.inputTokens,
        entry.outputTokens,
        entry.reasoningTokens,
        entry.cachedInputTokens,
        entry.totalTokens,
        entry.tokenCaptureSource,
      );
  }

  logRequestFinish(
    requestId: string,
    patch: Pick<
      RequestLog,
      "upstreamStatus" | "errorCode" | "errorMessage" | "durationMs" | "finishedAt"
    >,
  ) {
    this.sqlite
      .prepare(
        `
        UPDATE request_logs
        SET upstream_status = ?, error_code = ?, error_message = ?, duration_ms = ?, finished_at = ?
        WHERE request_id = ?
        `,
      )
      .run(
        patch.upstreamStatus,
        patch.errorCode,
        patch.errorMessage,
        patch.durationMs,
        patch.finishedAt,
        requestId,
      );
  }

  updateRequestTokenUsage(
    requestId: string,
    usage: {
      model: string | null;
      inputTokens: number | null;
      outputTokens: number | null;
      reasoningTokens: number | null;
      cachedInputTokens: number | null;
      totalTokens: number | null;
      captureSource: "json" | "sse";
    },
  ) {
    this.sqlite
      .prepare(
        `
        UPDATE request_logs
        SET
          model = ?,
          input_tokens = ?,
          output_tokens = ?,
          reasoning_tokens = ?,
          cached_input_tokens = ?,
          total_tokens = ?,
          token_capture_source = ?
        WHERE request_id = ?
        `,
      )
      .run(
        usage.model,
        usage.inputTokens,
        usage.outputTokens,
        usage.reasoningTokens,
        usage.cachedInputTokens,
        usage.totalTokens,
        usage.captureSource,
        requestId,
      );
  }

  listRecentRequestLogs(limit = 25) {
    return this.sqlite
      .prepare("SELECT * FROM request_logs ORDER BY started_at DESC LIMIT ?")
      .all(limit);
  }

  summarizeRequestTokenUsage(hours?: number | null) {
    const since =
      typeof hours === "number" && Number.isFinite(hours) && hours > 0
        ? new Date(Date.now() - hours * 60 * 60_000).toISOString()
        : null;
    const params = since ? [since] : [];
    const timeFilter = since ? "AND started_at >= ?" : "";
    const row = this.sqlite
      .prepare(
        `
        SELECT
          COUNT(*) as request_count,
          COUNT(
            CASE
              WHEN total_tokens IS NOT NULL OR input_tokens IS NOT NULL OR output_tokens IS NOT NULL
                THEN 1
            END
          ) as requests_with_usage_count,
          COALESCE(SUM(input_tokens), 0) as input_tokens,
          COALESCE(SUM(output_tokens), 0) as output_tokens,
          COALESCE(SUM(reasoning_tokens), 0) as reasoning_tokens,
          COALESCE(SUM(cached_input_tokens), 0) as cached_input_tokens,
          COALESCE(SUM(total_tokens), 0) as total_tokens
        FROM request_logs
        WHERE upstream_status IS NOT NULL AND upstream_status < 400
          ${timeFilter}
        `,
      )
      .get(...params) as Record<string, unknown>;

    return {
      requestCount: Number(row.request_count ?? 0),
      requestsWithUsageCount: Number(row.requests_with_usage_count ?? 0),
      inputTokens: Number(row.input_tokens ?? 0),
      outputTokens: Number(row.output_tokens ?? 0),
      reasoningTokens: Number(row.reasoning_tokens ?? 0),
      cachedInputTokens: Number(row.cached_input_tokens ?? 0),
      totalTokens: Number(row.total_tokens ?? 0),
    };
  }

  summarizeRequestTokenUsageByPlan(hours?: number | null) {
    const since =
      typeof hours === "number" && Number.isFinite(hours) && hours > 0
        ? new Date(Date.now() - hours * 60 * 60_000).toISOString()
        : null;
    const params = since ? [since] : [];
    const timeFilter = since ? "AND request_logs.started_at >= ?" : "";

    return this.sqlite
      .prepare(
        `
        SELECT
          accounts.subscription_plan_type as plan_type,
          COUNT(*) as request_count,
          COUNT(
            CASE
              WHEN request_logs.total_tokens IS NOT NULL
                OR request_logs.input_tokens IS NOT NULL
                OR request_logs.output_tokens IS NOT NULL
                THEN 1
            END
          ) as requests_with_usage_count,
          COALESCE(SUM(request_logs.input_tokens), 0) as input_tokens,
          COALESCE(SUM(request_logs.output_tokens), 0) as output_tokens,
          COALESCE(SUM(request_logs.reasoning_tokens), 0) as reasoning_tokens,
          COALESCE(SUM(request_logs.cached_input_tokens), 0) as cached_input_tokens,
          COALESCE(SUM(request_logs.total_tokens), 0) as total_tokens
        FROM request_logs
        INNER JOIN accounts ON accounts.id = request_logs.account_id
        WHERE request_logs.upstream_status IS NOT NULL AND request_logs.upstream_status < 400
          ${timeFilter}
        GROUP BY accounts.subscription_plan_type
        ORDER BY request_count DESC, total_tokens DESC
        `,
      )
      .all(...params) as Array<Record<string, unknown>>;
  }

  listRecentDecisionLogs(limit = 25) {
    return this.sqlite
      .prepare("SELECT * FROM decision_logs ORDER BY created_at DESC LIMIT ?")
      .all(limit);
  }

  logRuntime(entry: RuntimeLog) {
    this.sqlite
      .prepare(
        `
        INSERT INTO runtime_logs (
          level, scope, event, message, account_id, request_id, session_id, details_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        entry.level,
        entry.scope,
        entry.event,
        entry.message,
        entry.accountId ?? null,
        entry.requestId ?? null,
        entry.sessionId ?? null,
        entry.detailsJson ?? null,
        entry.createdAt,
      );
  }

  listRecentRuntimeLogs(limit = 80) {
    return this.sqlite
      .prepare("SELECT * FROM runtime_logs ORDER BY created_at DESC LIMIT ?")
      .all(limit);
  }
}
