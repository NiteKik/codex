import { randomUUID } from "node:crypto";
import { GatewayDatabase } from "../db/database.js";
import type { QuotaReservation, QuotaState, VirtualQuotaPool } from "../types.js";
import { nowIso } from "../utils/time.js";

type VirtualPoolOptions = {
  includeInvalid?: boolean;
};

type WhamWindowUsage = {
  used_percent: number;
  reset_at: number;
};

type VirtualWhamUsage = {
  rate_limit: {
    primary_window: WhamWindowUsage;
    secondary_window: WhamWindowUsage;
  };
  virtual_pool: {
    account_count: number;
    weekly_total: number;
    weekly_used: number;
    weekly_remaining: number;
    window_5h_total: number;
    window_5h_used: number;
    window_5h_remaining: number;
  };
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toEpochSeconds = (value: string | null) => {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return Math.floor(timestamp / 1000);
};

const roundTo = (value: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export class QuotaVirtualizer {
  constructor(private readonly db: GatewayDatabase) {}

  getAccountQuotaState(accountId: string): QuotaState {
    const snapshot = this.db.getLatestQuotaSnapshot(accountId);
    // Keep reservations/adjustments persisted for logs and diagnostics,
    // but do not apply local virtual deduction on top of upstream quota snapshots.
    const reservedUnits = 0;
    const adjustedUnits = 0;

    if (!snapshot) {
      return {
        accountId,
        weeklyTotal: 0,
        weeklyUsed: 0,
        weeklyRemaining: 0,
        weeklyRemainingRatio: 0,
        weeklyResetAt: null,
        window5hTotal: 0,
        window5hUsed: 0,
        window5hRemaining: 0,
        window5hRemainingRatio: 0,
        window5hResetAt: null,
        reservedUnits,
        adjustedUnits,
        sampleTime: null,
      };
    }

    const weeklyEffectiveUsed = snapshot.weeklyUsed;
    const windowEffectiveUsed = snapshot.window5hUsed;
    const weeklyRemaining = Math.max(0, snapshot.weeklyTotal - snapshot.weeklyUsed);
    const windowRemaining = Math.max(0, snapshot.window5hTotal - snapshot.window5hUsed);

    return {
      accountId,
      weeklyTotal: snapshot.weeklyTotal,
      weeklyUsed: weeklyEffectiveUsed,
      weeklyRemaining,
      weeklyRemainingRatio: snapshot.weeklyTotal === 0 ? 0 : weeklyRemaining / snapshot.weeklyTotal,
      weeklyResetAt: snapshot.weeklyResetAt,
      window5hTotal: snapshot.window5hTotal,
      window5hUsed: windowEffectiveUsed,
      window5hRemaining: windowRemaining,
      window5hRemainingRatio:
        snapshot.window5hTotal === 0 ? 0 : windowRemaining / snapshot.window5hTotal,
      window5hResetAt: snapshot.window5hResetAt,
      reservedUnits,
      adjustedUnits,
      sampleTime: snapshot.sampleTime,
    };
  }

  getVirtualPool(options: VirtualPoolOptions = {}): VirtualQuotaPool {
    const includeInvalid = options.includeInvalid ?? true;
    const accounts = this.db
      .listAccounts()
      .filter((account) => includeInvalid || account.status !== "invalid");
    const states = accounts.map((account) => this.getAccountQuotaState(account.id));

    return {
      accountCount: states.length,
      weeklyTotal: states.reduce((sum, item) => sum + item.weeklyTotal, 0),
      weeklyUsed: states.reduce((sum, item) => sum + item.weeklyUsed, 0),
      weeklyRemaining: states.reduce((sum, item) => sum + item.weeklyRemaining, 0),
      window5hTotal: states.reduce((sum, item) => sum + item.window5hTotal, 0),
      window5hUsed: states.reduce((sum, item) => sum + item.window5hUsed, 0),
      window5hRemaining: states.reduce((sum, item) => sum + item.window5hRemaining, 0),
    };
  }

  getVirtualWhamUsage(options: VirtualPoolOptions = {}): VirtualWhamUsage {
    const includeInvalid = options.includeInvalid ?? true;
    const accounts = this.db
      .listAccounts()
      .filter((account) => includeInvalid || account.status !== "invalid");
    const states = accounts.map((account) => this.getAccountQuotaState(account.id));
    const pool = this.getVirtualPool({ includeInvalid });
    const nowSeconds = Math.floor(Date.now() / 1000);

    const pickResetAt = (
      values: Array<string | null>,
      fallbackOffsetSeconds: number,
    ) => {
      const parsed = values
        .map((value) => toEpochSeconds(value))
        .filter((value): value is number => value !== null && value > 0)
        .sort((left, right) => left - right);
      return parsed[0] ?? nowSeconds + fallbackOffsetSeconds;
    };

    const toUsedPercent = (used: number, total: number) => {
      if (total <= 0) {
        return 100;
      }

      return roundTo(clamp((used / total) * 100, 0, 100), 2);
    };

    return {
      rate_limit: {
        primary_window: {
          used_percent: toUsedPercent(pool.window5hUsed, pool.window5hTotal),
          reset_at: pickResetAt(
            states.map((state) => state.window5hResetAt),
            5 * 60 * 60,
          ),
        },
        secondary_window: {
          used_percent: toUsedPercent(pool.weeklyUsed, pool.weeklyTotal),
          reset_at: pickResetAt(
            states.map((state) => state.weeklyResetAt),
            7 * 24 * 60 * 60,
          ),
        },
      },
      virtual_pool: {
        account_count: pool.accountCount,
        weekly_total: pool.weeklyTotal,
        weekly_used: pool.weeklyUsed,
        weekly_remaining: pool.weeklyRemaining,
        window_5h_total: pool.window5hTotal,
        window_5h_used: pool.window5hUsed,
        window_5h_remaining: pool.window5hRemaining,
      },
    };
  }

  reserve(
    accountId: string,
    sessionId: string,
    requestId: string,
    units: number,
  ): QuotaReservation {
    const timestamp = nowIso();
    const reservation: QuotaReservation = {
      id: randomUUID(),
      requestId,
      sessionId,
      accountId,
      units,
      status: "reserved",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.db.createReservation(reservation);
    return reservation;
  }

  settle(reservationId: string, _accountId: string, _requestId: string, _units: number) {
    this.db.updateReservation(reservationId, "settled");
  }

  release(reservationId: string) {
    this.db.updateReservation(reservationId, "released");
  }
}
