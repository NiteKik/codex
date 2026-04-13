import { randomUUID } from "node:crypto";
import { GatewayDatabase } from "../db/database.js";
import type { QuotaReservation, QuotaState, VirtualQuotaPool } from "../types.js";
import { nowIso } from "../utils/time.js";

export class QuotaVirtualizer {
  constructor(private readonly db: GatewayDatabase) {}

  getAccountQuotaState(accountId: string): QuotaState {
    const snapshot = this.db.getLatestQuotaSnapshot(accountId);
    const reservedUnits = this.db.getOpenReservationUnits(accountId);
    const adjustedUnits = this.db.getUnreconciledAdjustmentUnits(accountId);

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

    const weeklyEffectiveUsed = snapshot.weeklyUsed + reservedUnits + adjustedUnits;
    const windowEffectiveUsed = snapshot.window5hUsed + reservedUnits + adjustedUnits;
    const weeklyRemaining = Math.max(0, snapshot.weeklyTotal - weeklyEffectiveUsed);
    const windowRemaining = Math.max(0, snapshot.window5hTotal - windowEffectiveUsed);

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

  getVirtualPool(): VirtualQuotaPool {
    const accounts = this.db.listAccounts();
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

  settle(reservationId: string, accountId: string, requestId: string, units: number) {
    this.db.updateReservation(reservationId, "settled");
    this.db.addAdjustment(accountId, requestId, units);
  }

  release(reservationId: string) {
    this.db.updateReservation(reservationId, "released");
  }
}
