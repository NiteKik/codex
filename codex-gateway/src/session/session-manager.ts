import { randomUUID } from "node:crypto";
import { GatewayDatabase } from "../db/database.js";
import type { SessionBinding } from "../types.js";
import { addMs, nowIso } from "../utils/time.js";

export class SessionManager {
  constructor(
    private readonly db: GatewayDatabase,
    private readonly stickyTtlMs: number,
  ) {}

  resolveSessionId(input: string | string[] | undefined) {
    if (typeof input === "string" && input.trim().length > 0) {
      return input.trim();
    }

    if (Array.isArray(input) && input.length > 0 && input[0].trim().length > 0) {
      return input[0].trim();
    }

    return randomUUID();
  }

  getBinding(sessionId: string) {
    return this.db.getSessionBinding(sessionId);
  }

  bind(sessionId: string, accountId: string, migrated = false): SessionBinding {
    const current = this.db.getSessionBinding(sessionId);
    const binding: SessionBinding = {
      sessionId,
      accountId,
      stickyUntil: addMs(new Date(), this.stickyTtlMs),
      migrationCount: current ? current.migrationCount + (migrated ? 1 : 0) : 0,
      lastRequestAt: nowIso(),
    };

    this.db.upsertSessionBinding(binding);
    return binding;
  }
}
