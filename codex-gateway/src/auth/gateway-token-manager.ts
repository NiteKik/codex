import { createHash, randomBytes } from "node:crypto";
import { GatewayDatabase } from "../db/database.js";
import type { GatewayManagedToken } from "../types.js";
import { addMs, isExpired, nowIso } from "../utils/time.js";

export type GatewayManagedTokenStatus = "active" | "expired" | "revoked";

export interface GatewayManagedTokenView {
  id: string;
  name: string;
  tokenPreview: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  status: GatewayManagedTokenStatus;
}

export interface CreateGatewayManagedTokenInput {
  name: string;
  ttlSeconds: number | null;
}

export class GatewayTokenManager {
  private readonly primaryToken: string | null;

  constructor(
    private readonly db: GatewayDatabase,
    primaryToken: string | null,
  ) {
    const normalized = primaryToken?.trim() ?? "";
    this.primaryToken = normalized.length > 0 ? normalized : null;
  }

  static buildTokenPreview(token: string) {
    if (token.length <= 12) {
      return token;
    }

    return `${token.slice(0, 8)}...${token.slice(-4)}`;
  }

  static ttlSecondsToExpiresAt(ttlSeconds: number | null) {
    if (ttlSeconds === null) {
      return null;
    }

    const normalizedSeconds = Math.max(1, Math.floor(ttlSeconds));
    return addMs(new Date(), normalizedSeconds * 1000);
  }

  private static hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private static resolveStatus(token: GatewayManagedToken): GatewayManagedTokenStatus {
    if (token.revokedAt) {
      return "revoked";
    }

    if (isExpired(token.expiresAt)) {
      return "expired";
    }

    return "active";
  }

  private static toView(token: GatewayManagedToken): GatewayManagedTokenView {
    return {
      id: token.id,
      name: token.name,
      tokenPreview: token.tokenPreview,
      createdAt: token.createdAt,
      expiresAt: token.expiresAt,
      revokedAt: token.revokedAt,
      lastUsedAt: token.lastUsedAt,
      status: GatewayTokenManager.resolveStatus(token),
    };
  }

  private static shouldTouchUsage(lastUsedAt: string | null) {
    if (!lastUsedAt) {
      return true;
    }

    const lastUsedMs = new Date(lastUsedAt).getTime();
    if (Number.isNaN(lastUsedMs)) {
      return true;
    }

    return Date.now() - lastUsedMs >= 60_000;
  }

  hasPrimaryToken(rawToken: string | null) {
    if (!rawToken || !this.primaryToken) {
      return false;
    }

    return rawToken === this.primaryToken;
  }

  verifyManagedToken(rawToken: string | null) {
    if (!rawToken) {
      return false;
    }

    const token = this.db.getGatewayTokenByHash(GatewayTokenManager.hashToken(rawToken));
    if (!token) {
      return false;
    }

    if (GatewayTokenManager.resolveStatus(token) !== "active") {
      return false;
    }

    if (GatewayTokenManager.shouldTouchUsage(token.lastUsedAt)) {
      this.db.touchGatewayTokenLastUsed(token.id, nowIso());
    }

    return true;
  }

  verifyToken(rawToken: string | null) {
    if (!rawToken) {
      return false;
    }

    if (this.hasPrimaryToken(rawToken)) {
      return true;
    }

    return this.verifyManagedToken(rawToken);
  }

  listManagedTokens() {
    return this.db.listGatewayTokens().map((token) => GatewayTokenManager.toView(token));
  }

  createManagedToken(input: CreateGatewayManagedTokenInput) {
    const tokenValue = `gk_${randomBytes(24).toString("hex")}`;
    const createdAt = nowIso();
    const record: GatewayManagedToken = {
      id: `tok_${randomBytes(8).toString("hex")}`,
      name: input.name,
      tokenHash: GatewayTokenManager.hashToken(tokenValue),
      tokenPreview: GatewayTokenManager.buildTokenPreview(tokenValue),
      createdAt,
      expiresAt: GatewayTokenManager.ttlSecondsToExpiresAt(input.ttlSeconds),
      revokedAt: null,
      lastUsedAt: null,
    };

    this.db.createGatewayToken(record);

    return {
      token: tokenValue,
      item: GatewayTokenManager.toView(record),
    };
  }

  updateManagedTokenTtl(tokenId: string, ttlSeconds: number | null) {
    const existing = this.db.getGatewayTokenById(tokenId);
    if (!existing) {
      return null;
    }

    if (existing.revokedAt) {
      return "revoked" as const;
    }

    const expiresAt = GatewayTokenManager.ttlSecondsToExpiresAt(ttlSeconds);
    this.db.updateGatewayTokenExpiry(tokenId, expiresAt);

    const updated = this.db.getGatewayTokenById(tokenId);
    if (!updated) {
      return null;
    }

    return GatewayTokenManager.toView(updated);
  }

  revokeManagedToken(tokenId: string) {
    const existing = this.db.getGatewayTokenById(tokenId);
    if (!existing) {
      return null;
    }

    if (!existing.revokedAt) {
      this.db.revokeGatewayToken(tokenId, nowIso());
    }

    const updated = this.db.getGatewayTokenById(tokenId);
    if (!updated) {
      return null;
    }

    return GatewayTokenManager.toView(updated);
  }
}
