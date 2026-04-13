import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { nowIso } from "../utils/time.js";
import type {
  Account,
  AccountStatus,
  DecisionLog,
  QuotaReservation,
  QuotaSnapshot,
  RequestLog,
  RuntimeLog,
  SessionBinding,
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

const parseAccount = (row: Record<string, unknown>): Account => ({
  id: toText(row.id),
  name: toText(row.name),
  provider: toText(row.provider),
  upstreamBaseUrl: toText(row.upstream_base_url),
  quotaPath: toText(row.quota_path),
  proxyPathPrefix: toText(row.proxy_path_prefix),
  auth: JSON.parse(toText(row.auth_json)),
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

export class GatewayDatabase {
  readonly sqlite: Database;

  constructor(filePath: string) {
    this.sqlite = new Database(filePath, { create: true });
    this.sqlite.exec("PRAGMA journal_mode = WAL;");
    this.sqlite.exec("PRAGMA foreign_keys = ON;");
  }

  init() {
    this.sqlite.exec(readSchema());
  }

  close() {
    this.sqlite.close();
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
          id, name, provider, upstream_base_url, quota_path, proxy_path_prefix, auth_json,
          status, success_count, failure_count, consecutive_failures, consecutive_429,
          cooldown_until, last_error_code, last_error_message, created_at, updated_at
        ) VALUES (
          @id, @name, @provider, @upstreamBaseUrl, @quotaPath, @proxyPathPrefix, @authJson,
          @status, @successCount, @failureCount, @consecutiveFailures, @consecutive429,
          @cooldownUntil, @lastErrorCode, @lastErrorMessage, @createdAt, @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          provider = excluded.provider,
          upstream_base_url = excluded.upstream_base_url,
          quota_path = excluded.quota_path,
          proxy_path_prefix = excluded.proxy_path_prefix,
          auth_json = excluded.auth_json,
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
        "@id": account.id,
        "@name": account.name,
        "@provider": account.provider,
        "@upstreamBaseUrl": account.upstreamBaseUrl,
        "@quotaPath": account.quotaPath,
        "@proxyPathPrefix": account.proxyPathPrefix,
        "@authJson": JSON.stringify(account.auth),
        "@status": account.status,
        "@successCount": account.successCount,
        "@failureCount": account.failureCount,
        "@consecutiveFailures": account.consecutiveFailures,
        "@consecutive429": account.consecutive429,
        "@cooldownUntil": account.cooldownUntil,
        "@lastErrorCode": account.lastErrorCode,
        "@lastErrorMessage": account.lastErrorMessage,
        "@createdAt": account.createdAt ?? timestamp,
        "@updatedAt": account.updatedAt ?? timestamp,
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
    this.sqlite
      .prepare(
        "UPDATE quota_adjustments SET reconciled = 1 WHERE account_id = ? AND reconciled = 0",
      )
      .run(accountId);
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
          upstream_status, error_code, error_message, duration_ms, started_at, finished_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

  listRecentRequestLogs(limit = 25) {
    return this.sqlite
      .prepare("SELECT * FROM request_logs ORDER BY started_at DESC LIMIT ?")
      .all(limit);
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
