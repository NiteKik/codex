import { storeToRefs } from "pinia";
import { onMounted, ref } from "vue";
import { closeDialogOnBackdropClick } from "./use-dialog-backdrop-close.ts";
import { type GatewayManagedTokenItem } from "../services/gateway-api.ts";
import { type TokensFeedbackTone, useTokensStore } from "../stores/tokens.ts";

const DEFAULT_TTL_HOURS = "168";
const MAX_TTL_HOURS = 24 * 365 * 10;

const parsePositiveHours = (rawHours: string, fieldLabel: string) => {
  const parsed = Number(rawHours);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(`${fieldLabel}必须是整数小时。`);
  }

  if (parsed <= 0) {
    throw new Error(`${fieldLabel}必须大于 0。`);
  }

  if (parsed > MAX_TTL_HOURS) {
    throw new Error(`${fieldLabel}不能超过 10 年。`);
  }

  return parsed;
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export const useTokensPage = () => {
  const tokensStore = useTokensStore();
  const {
    required,
    primaryToken,
    tokens,
    pageError,
    pageFeedback,
    pageFeedbackTone,
    busyTokenId,
    activeCount,
    revokedCount,
    expiredCount,
  } = storeToRefs(tokensStore);

  const createSubmitting = ref(false);
  const createName = ref("");
  const createNeverExpires = ref(false);
  const createTtlHours = ref(DEFAULT_TTL_HOURS);
  const createFeedback = ref("");
  const createFeedbackTone = ref<TokensFeedbackTone>("success");

  const ttlSubmitting = ref(false);
  const editingTokenId = ref("");
  const editingTokenName = ref("");
  const ttlNeverExpires = ref(false);
  const ttlHours = ref(DEFAULT_TTL_HOURS);
  const ttlFeedback = ref("");
  const ttlFeedbackTone = ref<TokensFeedbackTone>("success");

  const revealedTokenValue = ref("");

  const createDialogRef = ref<HTMLDialogElement | null>(null);
  const ttlDialogRef = ref<HTMLDialogElement | null>(null);
  const revealDialogRef = ref<HTMLDialogElement | null>(null);

  const resetCreateForm = () => {
    createName.value = "";
    createNeverExpires.value = false;
    createTtlHours.value = DEFAULT_TTL_HOURS;
    createFeedback.value = "";
    createFeedbackTone.value = "success";
  };

  const openCreateDialog = () => {
    resetCreateForm();
    createDialogRef.value?.showModal();
  };

  const closeCreateDialog = () => {
    createDialogRef.value?.close();
  };

  const openRevealDialog = (token: string) => {
    revealedTokenValue.value = token;
    revealDialogRef.value?.showModal();
  };

  const closeRevealDialog = () => {
    revealDialogRef.value?.close();
  };

  const submitCreate = async () => {
    if (createSubmitting.value) {
      return;
    }

    createSubmitting.value = true;
    createFeedback.value = "";

    try {
      const ttlSeconds = createNeverExpires.value
        ? null
        : parsePositiveHours(createTtlHours.value, "有效时长") * 3600;

      const createdToken = await tokensStore.createToken({
        name: createName.value.trim() || undefined,
        ttlSeconds,
      });

      closeCreateDialog();
      openRevealDialog(createdToken);
    } catch (error) {
      createFeedback.value = getErrorMessage(error, "Token 创建失败。");
      createFeedbackTone.value = "error";
    } finally {
      createSubmitting.value = false;
    }
  };

  const prepareTtlForm = (token: GatewayManagedTokenItem) => {
    editingTokenId.value = token.id;
    editingTokenName.value = token.name;
    ttlFeedback.value = "";
    ttlFeedbackTone.value = "success";

    if (!token.expiresAt) {
      ttlNeverExpires.value = true;
      ttlHours.value = DEFAULT_TTL_HOURS;
      return;
    }

    const expiresAtMs = new Date(token.expiresAt).getTime();
    const hoursRemaining = Math.max(1, Math.ceil((expiresAtMs - Date.now()) / 3_600_000));

    ttlNeverExpires.value = false;
    ttlHours.value = String(hoursRemaining);
  };

  const openTtlDialog = (token: GatewayManagedTokenItem) => {
    prepareTtlForm(token);
    ttlDialogRef.value?.showModal();
  };

  const closeTtlDialog = () => {
    ttlDialogRef.value?.close();
  };

  const submitTtlUpdate = async () => {
    if (ttlSubmitting.value || !editingTokenId.value) {
      return;
    }

    ttlSubmitting.value = true;
    ttlFeedback.value = "";

    try {
      const nextTtlSeconds = ttlNeverExpires.value
        ? null
        : parsePositiveHours(ttlHours.value, "有效时长") * 3600;

      await tokensStore.updateTokenTtl(editingTokenId.value, nextTtlSeconds);
      closeTtlDialog();
    } catch (error) {
      ttlFeedback.value = getErrorMessage(error, "Token 时效更新失败。");
      ttlFeedbackTone.value = "error";
    } finally {
      ttlSubmitting.value = false;
    }
  };

  const destroyToken = async (token: GatewayManagedTokenItem) => {
    if (token.status === "revoked") {
      return;
    }

    const confirmed = window.confirm(`确认销毁 Token「${token.name}」吗？销毁后无法恢复。`);
    if (!confirmed) {
      return;
    }

    await tokensStore.destroyToken(token);
  };

  const copyText = async (value: string, successMessage: string) => {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      tokensStore.setPageFeedback(successMessage, "success");
    } catch {
      tokensStore.setPageFeedback("复制失败，请手动复制。", "error");
    }
  };

  const onCreateDialogClick = (event: MouseEvent) => {
    closeDialogOnBackdropClick(createDialogRef.value, event);
  };

  const onTtlDialogClick = (event: MouseEvent) => {
    closeDialogOnBackdropClick(ttlDialogRef.value, event);
  };

  const onRevealDialogClick = (event: MouseEvent) => {
    closeDialogOnBackdropClick(revealDialogRef.value, event);
  };

  onMounted(() => {
    void tokensStore.loadTokens();
  });

  return {
    activeCount,
    busyTokenId,
    closeCreateDialog,
    closeRevealDialog,
    closeTtlDialog,
    copyText,
    createDialogRef,
    createFeedback,
    createFeedbackTone,
    createName,
    createNeverExpires,
    createSubmitting,
    createTtlHours,
    destroyToken,
    editingTokenName,
    expiredCount,
    onCreateDialogClick,
    onRevealDialogClick,
    onTtlDialogClick,
    openCreateDialog,
    openTtlDialog,
    pageError,
    pageFeedback,
    pageFeedbackTone,
    primaryToken,
    required,
    revealDialogRef,
    revealedTokenValue,
    revokedCount,
    submitCreate,
    submitTtlUpdate,
    tokens,
    ttlDialogRef,
    ttlFeedback,
    ttlFeedbackTone,
    ttlHours,
    ttlNeverExpires,
    ttlSubmitting,
  };
};
