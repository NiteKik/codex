import { ref } from "vue";
import { closeDialogOnBackdropClick } from "./use-dialog-backdrop-close.ts";
import {
  fetchCdkOptions,
  upgradeAccountSubscription,
  type AccountRow,
  type CdkProductOption,
} from "../services/gateway-api.ts";

type FeedbackTone = "success" | "error";

type UseAccountUpgradeDialogOptions = {
  isUpgradable: (account: AccountRow) => boolean;
  notifyCreated: () => void;
  setTableFeedback: (message: string, tone: FeedbackTone) => void;
};

const normalizeProductType = (value: string) => value.trim().toLowerCase();

export const useAccountUpgradeDialog = ({
  isUpgradable,
  notifyCreated,
  setTableFeedback,
}: UseAccountUpgradeDialogOptions) => {
  const upgradeDialogRef = ref<HTMLDialogElement | null>(null);
  const upgradeBusyAccountId = ref<string | null>(null);
  const upgradeTargetAccount = ref<AccountRow | null>(null);
  const upgradeCdkOptions = ref<CdkProductOption[]>([]);
  const upgradeSelectedProductType = ref("");
  const upgradeSessionInfo = ref("");
  const upgradeLoadingOptions = ref(false);
  const upgradeSubmitting = ref(false);
  const upgradeFeedback = ref("");

  const formatCdkProductType = (productType: string) => {
    const normalized = normalizeProductType(productType);
    if (normalized.includes("plus") && normalized.includes("1m")) {
      return "GPT Plus（月卡）";
    }
    if (normalized.includes("plus") && normalized.includes("1y")) {
      return "GPT Plus（年卡）";
    }

    return productType;
  };

  const onUpgradeDialogClick = (event: MouseEvent) => {
    closeDialogOnBackdropClick(upgradeDialogRef.value, event);
  };

  const upgradeAccount = async (account: AccountRow) => {
    if (!isUpgradable(account)) {
      return;
    }

    upgradeTargetAccount.value = account;
    upgradeFeedback.value = "";
    upgradeSessionInfo.value = "";
    upgradeCdkOptions.value = [];
    upgradeSelectedProductType.value = "";
    upgradeLoadingOptions.value = true;
    upgradeDialogRef.value?.showModal();

    try {
      const payload = await fetchCdkOptions();
      const options = payload.options ?? [];
      upgradeCdkOptions.value = options;

      if (options.length === 0) {
        upgradeFeedback.value = `当前暂无可用 ${payload.defaultProductType} CDK。`;
        return;
      }

      const defaultOption =
        options.find(
          (option) =>
            normalizeProductType(option.productType) ===
            normalizeProductType(payload.defaultProductType),
        ) ?? options[0];
      upgradeSelectedProductType.value = defaultOption.productType;
    } catch (error) {
      upgradeFeedback.value =
        error instanceof Error ? error.message : "获取可用 CDK 失败。";
    } finally {
      upgradeLoadingOptions.value = false;
    }
  };

  const closeUpgradeDialog = (force = false) => {
    if (upgradeSubmitting.value && !force) {
      return;
    }
    upgradeDialogRef.value?.close();
    upgradeTargetAccount.value = null;
    upgradeFeedback.value = "";
    upgradeSessionInfo.value = "";
    upgradeCdkOptions.value = [];
    upgradeSelectedProductType.value = "";
  };

  const submitUpgrade = async () => {
    const account = upgradeTargetAccount.value;
    if (!account) {
      return;
    }

    const selected = upgradeCdkOptions.value.find(
      (option) => option.productType === upgradeSelectedProductType.value,
    );
    if (!selected) {
      upgradeFeedback.value = "请选择要使用的 CDK 类型。";
      return;
    }

    upgradeSubmitting.value = true;
    upgradeBusyAccountId.value = account.id;
    try {
      const response = await upgradeAccountSubscription(account.id, {
        productType: selected.productType,
        sessionInfo: upgradeSessionInfo.value.trim() || undefined,
      });
      setTableFeedback(
        `升级完成（${response.activation.productType}，剩余 CDK：${response.activation.remainingCdks}）。`,
        "success",
      );
      closeUpgradeDialog(true);
      notifyCreated();
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "账号升级失败。";
      const message = rawMessage.includes("Session信息或账号异常")
        ? `${rawMessage} 请复制全部内容重新提交。`
        : rawMessage;
      upgradeFeedback.value = message;
      setTableFeedback(message, "error");
    } finally {
      upgradeSubmitting.value = false;
      upgradeBusyAccountId.value = null;
    }
  };

  return {
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
  };
};
