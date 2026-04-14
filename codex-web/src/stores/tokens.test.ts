import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { createPinia, setActivePinia } from "pinia";
import { useTokensStore } from "./tokens.ts";
import type { GatewayManagedTokenItem, GatewayTokenListPayload } from "../services/gateway-api.ts";

const {
  createGatewayTokenMock,
  fetchGatewayTokensMock,
  revokeGatewayTokenMock,
  updateGatewayTokenTtlMock,
} = vi.hoisted(() => ({
  createGatewayTokenMock: vi.fn(),
  fetchGatewayTokensMock: vi.fn(),
  revokeGatewayTokenMock: vi.fn(),
  updateGatewayTokenTtlMock: vi.fn(),
}));

vi.mock("../services/gateway-api.ts", () => ({
  createGatewayToken: createGatewayTokenMock,
  fetchGatewayTokens: fetchGatewayTokensMock,
  revokeGatewayToken: revokeGatewayTokenMock,
  updateGatewayTokenTtl: updateGatewayTokenTtlMock,
}));

const createTokenItem = (status: GatewayManagedTokenItem["status"] = "active"): GatewayManagedTokenItem => ({
  id: "token-1",
  name: "Token 1",
  tokenPreview: "tk-***",
  createdAt: "2026-04-14T00:00:00.000Z",
  expiresAt: status === "active" ? "2026-04-30T00:00:00.000Z" : null,
  revokedAt: status === "revoked" ? "2026-04-14T01:00:00.000Z" : null,
  lastUsedAt: null,
  status,
});

const createTokenPayload = (): GatewayTokenListPayload => ({
  ok: true,
  required: true,
  primaryToken: {
    token: "primary-token",
    tokenPreview: "primary-***",
    source: "env",
    tokenFilePath: null,
  },
  tokens: [createTokenItem()],
});

describe("useTokensStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    createGatewayTokenMock.mockReset();
    fetchGatewayTokensMock.mockReset();
    revokeGatewayTokenMock.mockReset();
    updateGatewayTokenTtlMock.mockReset();
  });

  test("deduplicates concurrent loadTokens requests", async () => {
    let resolveFetch: ((payload: GatewayTokenListPayload) => void) | undefined;

    fetchGatewayTokensMock.mockReturnValue(
      new Promise<GatewayTokenListPayload>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const store = useTokensStore();
    const first = store.loadTokens();
    const second = store.loadTokens();

    expect(fetchGatewayTokensMock).toHaveBeenCalledTimes(1);

    resolveFetch?.(createTokenPayload());
    await Promise.all([first, second]);

    expect(store.tokens).toHaveLength(1);
    expect(store.loading).toBe(false);
  });

  test("uses stale cache for repeated loadTokens calls", async () => {
    const nowSpy = vi.spyOn(Date, "now");
    fetchGatewayTokensMock.mockResolvedValue(createTokenPayload());

    try {
      const store = useTokensStore();

      nowSpy.mockReturnValue(1_000);
      await store.loadTokens();

      nowSpy.mockReturnValue(5_000);
      await store.loadTokens();

      nowSpy.mockReturnValue(20_000);
      await store.loadTokens();

      expect(fetchGatewayTokensMock).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
    }
  });

  test("loadTokens force option bypasses stale cache", async () => {
    const nowSpy = vi.spyOn(Date, "now");
    fetchGatewayTokensMock.mockResolvedValue(createTokenPayload());

    try {
      const store = useTokensStore();

      nowSpy.mockReturnValue(1_000);
      await store.loadTokens();

      nowSpy.mockReturnValue(2_000);
      await store.loadTokens({ force: true });

      expect(fetchGatewayTokensMock).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
    }
  });

  test("createToken refreshes list and returns new token", async () => {
    createGatewayTokenMock.mockResolvedValue({
      ok: true,
      token: "new-token",
      authHeader: "Bearer new-token",
      item: createTokenItem(),
    });
    fetchGatewayTokensMock.mockResolvedValue(createTokenPayload());

    const store = useTokensStore();
    const token = await store.createToken({ name: "test", ttlSeconds: 3600 });

    expect(token).toBe("new-token");
    expect(createGatewayTokenMock).toHaveBeenCalledTimes(1);
    expect(fetchGatewayTokensMock).toHaveBeenCalledTimes(1);
    expect(store.pageFeedback).toBe("Token 已创建。");
    expect(store.pageFeedbackTone).toBe("success");
  });

  test("updateTokenTtl refreshes list", async () => {
    updateGatewayTokenTtlMock.mockResolvedValue({
      ok: true,
      item: createTokenItem(),
    });
    fetchGatewayTokensMock.mockResolvedValue(createTokenPayload());

    const store = useTokensStore();
    await store.updateTokenTtl("token-1", 7200);

    expect(updateGatewayTokenTtlMock).toHaveBeenCalledWith("token-1", 7200);
    expect(fetchGatewayTokensMock).toHaveBeenCalledTimes(1);
    expect(store.pageFeedback).toBe("Token 时效已更新。");
  });

  test("destroyToken returns false for revoked token without api call", async () => {
    const store = useTokensStore();
    const result = await store.destroyToken(createTokenItem("revoked"));

    expect(result).toBe(false);
    expect(revokeGatewayTokenMock).not.toHaveBeenCalled();
  });

  test("destroyToken captures api error and resets busy state", async () => {
    revokeGatewayTokenMock.mockRejectedValue(new Error("销毁失败"));
    const store = useTokensStore();

    const result = await store.destroyToken(createTokenItem("active"));

    expect(result).toBe(false);
    expect(revokeGatewayTokenMock).toHaveBeenCalledTimes(1);
    expect(store.pageFeedback).toBe("销毁失败");
    expect(store.pageFeedbackTone).toBe("error");
    expect(store.busyTokenId).toBeNull();
  });
});
