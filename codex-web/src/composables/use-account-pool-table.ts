import { ref } from "vue";
import { closeDialogOnBackdropClick } from "./use-dialog-backdrop-close.ts";
import { useAccountEditDialog } from "./use-account-edit-dialog.ts";
import { useAccountUpgradeDialog } from "./use-account-upgrade-dialog.ts";
import {
  deleteAccount,
  type AccountRow,
  type SubscriptionStatus,
  type WorkspaceKind,
} from "../services/gateway-api.ts";
import { formatDateTime as formatDateTimeValue } from "../utils/date-time.ts";

type FeedbackTone = "success" | "error";

export const useAccountPoolTable = (notifyCreated: () => void) => {
  const createDialogRef = ref<HTMLDialogElement | null>(null);
  const actionBusyAccountId = ref<string | null>(null);
  const tableFeedback = ref("");
  const tableFeedbackTone = ref<FeedbackTone>("success");

  const workspaceKindLabelMap: Record<WorkspaceKind, string> = {
    personal: "个人",
    team: "团队",
    unknown: "未识别",
  };

  const subscriptionStatusLabelMap: Record<SubscriptionStatus, string> = {
    active: "有效",
    trial: "试用",
    inactive: "停用",
    unknown: "未知",
  };

  const formatPercent = (value: number) => {
    const normalized = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
    const percent = normalized * 100;
    if (percent <= 0.05) {
      return "0%";
    }
    if (percent >= 99.95) {
      return "100%";
    }

    const digits = percent < 10 ? 1 : 0;
    return `${percent.toFixed(digits).replace(/\.0$/, "")}%`;
  };

  const formatNumber = (value: number) =>
    new Intl.NumberFormat("zh-CN").format(value);

  const formatDateTime = (value: string | null) =>
    formatDateTimeValue(value, {
      emptyText: "等待首次更新",
      invalidText: "时间未知",
    });

  const getQuotaTone = (ratio: number) => {
    if (ratio <= 0.2) {
      return "danger";
    }

    if (ratio <= 0.5) {
      return "warning";
    }

    return "healthy";
  };

  const formatWorkspaceKind = (kind: WorkspaceKind) =>
    workspaceKindLabelMap[kind] ?? "未识别";

  const getSubscriptionStatus = (account: AccountRow): SubscriptionStatus =>
    account.subscription?.status ?? "unknown";

  const formatSubscriptionStatus = (status: SubscriptionStatus) =>
    subscriptionStatusLabelMap[status] ?? "未知";

  const formatSubscriptionPlan = (planType: string | null | undefined) => {
    const normalized = planType?.trim().toLowerCase() ?? "";
    if (!normalized) {
      return "未知";
    }

    if (normalized === "free") {
      return "免费";
    }
    if (normalized === "plus") {
      return "Plus";
    }
    if (normalized === "pro") {
      return "Pro";
    }
    if (normalized === "team" || normalized === "business") {
      return "Team";
    }
    if (normalized === "enterprise") {
      return "Enterprise";
    }

    return normalized;
  };

  const hasVirtualQuotaOverlay = (account: AccountRow) =>
    account.quota.reservedUnits > 0 || account.quota.adjustedUnits > 0;

  const isFreeSubscription = (account: AccountRow) =>
    (account.subscription?.planType?.trim().toLowerCase() ?? "") === "free";

  const setTableFeedback = (message: string, tone: FeedbackTone) => {
    tableFeedback.value = message;
    tableFeedbackTone.value = tone;
  };

  const {
    closeEditDialog,
    editAuthMode,
    editDialogRef,
    editFeedback,
    editFeedbackTone,
    editName,
    editStatus,
    editSubmitting,
    editToken,
    editWorkspaceHeadersPayload,
    editWorkspaceId,
    editWorkspaceKind,
    editWorkspaceName,
    onEditDialogClick,
    openEditDialog,
    statusOptions,
    submitEdit,
  } = useAccountEditDialog({
    notifyCreated,
    setTableFeedback,
  });

  const {
    closeUpgradeDialog,
    formatCdkProductType,
    onUpgradeDialogClick,
    submitUpgrade,
    upgradeAccount,
    upgradeBusyAccountId,
    upgradeCdkOptions,
    upgradeDialogRef,
    upgradeFeedback,
    upgradeLoadingOptions,
    upgradeSelectedProductType,
    upgradeSessionInfo,
    upgradeSubmitting,
    upgradeTargetAccount,
  } = useAccountUpgradeDialog({
    isUpgradable: isFreeSubscription,
    notifyCreated,
    setTableFeedback,
  });

  const openCreateDialog = () => {
    createDialogRef.value?.showModal();
  };

  const closeCreateDialog = () => {
    createDialogRef.value?.close();
  };

  const onCreateDialogClick = (event: MouseEvent) => {
    closeDialogOnBackdropClick(createDialogRef.value, event);
  };

  const removeAccount = async (account: AccountRow) => {
    const confirmed = window.confirm(
      `确认删除账号「${account.name}」吗？此操作不可恢复。`,
    );
    if (!confirmed) {
      return;
    }

    actionBusyAccountId.value = account.id;
    try {
      await deleteAccount(account.id);
      setTableFeedback("账号已删除。", "success");
      notifyCreated();
    } catch (error) {
      setTableFeedback(
        error instanceof Error ? error.message : "账号删除失败。",
        "error",
      );
    } finally {
      actionBusyAccountId.value = null;
    }
  };

  const onCreated = () => {
    closeCreateDialog();
    notifyCreated();
  };

  return {
    actionBusyAccountId,
    closeCreateDialog,
    closeEditDialog,
    closeUpgradeDialog,
    createDialogRef,
    editAuthMode,
    editDialogRef,
    editFeedback,
    editFeedbackTone,
    editName,
    editStatus,
    editSubmitting,
    editToken,
    editWorkspaceHeadersPayload,
    editWorkspaceId,
    editWorkspaceKind,
    editWorkspaceName,
    formatCdkProductType,
    formatDateTime,
    formatNumber,
    formatPercent,
    formatSubscriptionPlan,
    formatSubscriptionStatus,
    formatWorkspaceKind,
    getQuotaTone,
    getSubscriptionStatus,
    hasVirtualQuotaOverlay,
    isFreeSubscription,
    onCreateDialogClick,
    onCreated,
    onEditDialogClick,
    onUpgradeDialogClick,
    openCreateDialog,
    openEditDialog,
    removeAccount,
    statusOptions,
    submitEdit,
    submitUpgrade,
    tableFeedback,
    tableFeedbackTone,
    upgradeAccount,
    upgradeBusyAccountId,
    upgradeCdkOptions,
    upgradeDialogRef,
    upgradeFeedback,
    upgradeLoadingOptions,
    upgradeSelectedProductType,
    upgradeSessionInfo,
    upgradeSubmitting,
    upgradeTargetAccount,
  };
};
