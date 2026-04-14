import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { formatDateTime as formatDateTimeValue } from "../utils/date-time.ts";
import {
  createGatewayToken,
  fetchGatewayTokens,
  revokeGatewayToken,
  updateGatewayTokenTtl,
  type GatewayManagedTokenItem,
  type GatewayManagedTokenStatus,
  type GatewayPrimaryTokenInfo,
} from "../services/gateway-api.ts";

export type TokensFeedbackTone = "success" | "error";

const TOKENS_STALE_TIME_MS = 10_000;

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export const formatDateTime = (value: string | null) => {
  return formatDateTimeValue(value, {
    emptyText: "-",
    invalidText: "时间未知",
  });
};

export const formatTokenStatus = (status: GatewayManagedTokenStatus) => {
  if (status === "active") {
    return "生效中";
  }

  if (status === "expired") {
    return "已过期";
  }

  return "已销毁";
};

export const formatExpiry = (token: GatewayManagedTokenItem) => {
  if (token.status === "revoked") {
    return "已销毁";
  }

  if (!token.expiresAt) {
    return "永不过期";
  }

  return formatDateTime(token.expiresAt);
};

export const useTokensStore = defineStore("tokens", () => {
  const loading = ref(false);
  const required = ref(true);
  const primaryToken = ref<GatewayPrimaryTokenInfo | null>(null);
  const tokens = ref<GatewayManagedTokenItem[]>([]);
  const pageError = ref("");
  const pageFeedback = ref("");
  const pageFeedbackTone = ref<TokensFeedbackTone>("success");
  const busyTokenId = ref<string | null>(null);

  let loadTask: Promise<void> | null = null;
  let lastLoadedAt = 0;

  const activeCount = computed(
    () => tokens.value.filter((token) => token.status === "active").length,
  );
  const revokedCount = computed(
    () => tokens.value.filter((token) => token.status === "revoked").length,
  );
  const expiredCount = computed(
    () => tokens.value.filter((token) => token.status === "expired").length,
  );

  const setPageFeedback = (message: string, tone: TokensFeedbackTone) => {
    pageFeedback.value = message;
    pageFeedbackTone.value = tone;
  };

  const clearPageFeedback = () => {
    pageFeedback.value = "";
    pageFeedbackTone.value = "success";
  };

  const loadTokens = (options?: { force?: boolean }) => {
    const force = Boolean(options?.force);

    if (loadTask) {
      return loadTask;
    }

    if (!force && lastLoadedAt > 0 && Date.now() - lastLoadedAt < TOKENS_STALE_TIME_MS) {
      return Promise.resolve();
    }

    loadTask = (async () => {
      loading.value = true;
      pageError.value = "";

      try {
        const payload = await fetchGatewayTokens();
        required.value = Boolean(payload.required);
        primaryToken.value = payload.primaryToken;
        tokens.value = payload.tokens;
        lastLoadedAt = Date.now();
      } catch (error) {
        pageError.value = getErrorMessage(error, "Token 列表读取失败。");
      } finally {
        loading.value = false;
      }
    })().finally(() => {
      loadTask = null;
    });

    return loadTask;
  };

  const createToken = async (payload: { name?: string; ttlSeconds: number | null }) => {
    const response = await createGatewayToken(payload);
    setPageFeedback("Token 已创建。", "success");
    await loadTokens({ force: true });
    return response.token;
  };

  const updateTokenTtl = async (tokenId: string, ttlSeconds: number | null) => {
    await updateGatewayTokenTtl(tokenId, ttlSeconds);
    setPageFeedback("Token 时效已更新。", "success");
    await loadTokens({ force: true });
  };

  const destroyToken = async (token: GatewayManagedTokenItem) => {
    if (token.status === "revoked") {
      return false;
    }

    busyTokenId.value = token.id;

    try {
      await revokeGatewayToken(token.id);
      setPageFeedback("Token 已销毁。", "success");
      await loadTokens({ force: true });
      return true;
    } catch (error) {
      setPageFeedback(getErrorMessage(error, "Token 销毁失败。"), "error");
      return false;
    } finally {
      busyTokenId.value = null;
    }
  };

  return {
    activeCount,
    busyTokenId,
    clearPageFeedback,
    createToken,
    expiredCount,
    loadTokens,
    loading,
    pageError,
    pageFeedback,
    pageFeedbackTone,
    primaryToken,
    required,
    revokedCount,
    setPageFeedback,
    tokens,
    updateTokenTtl,
    destroyToken,
  };
});
