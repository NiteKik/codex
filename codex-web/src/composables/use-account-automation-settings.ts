import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useAppConfigStore } from "../stores/app-config.ts";
import {
  fetchGatewaySettings,
  updateGatewaySettings,
} from "../services/settings-page-api.ts";

export const useAccountAutomationSettings = () => {
  const pollIntervalMinSecondsWhenEnabled = 5;
  const appConfigStore = useAppConfigStore();
  const { gatewayBaseUrl } = storeToRefs(appConfigStore);
  const activeBaseUrl = computed(() => gatewayBaseUrl.value);

  const pollIntervalLoading = ref(false);
  const pollIntervalSaving = ref(false);
  const pollIntervalError = ref("");
  const pollIntervalFeedback = ref("");
  const pollIntervalInput = ref("30");
  const pollIntervalStableSeconds = ref(30);
  const pollIntervalLastNonZeroSeconds = ref(30);
  const pendingPollIntervalSave = ref(false);
  const pollingEnabled = ref(true);
  const pollingToggleSaving = ref(false);
  const controlError = ref("");
  const controlFeedback = ref("");
  const pollIntervalMinSeconds = ref(0);
  const pollIntervalMaxSeconds = ref(3600);

  const ruleSaving = ref(false);
  const pendingRuleSave = ref(false);
  const ruleError = ref("");
  const ruleFeedback = ref("");
  const registrationSaving = ref(false);
  const registrationError = ref("");
  const registrationFeedback = ref("");
  const pendingRegistrationSave = ref(false);
  const autoRegisterToggleSaving = ref(false);
  const freeSchedulingToggleSaving = ref(false);
  const tempMailBaseUrlInput = ref("");
  const tempMailAdminPasswordInput = ref("");
  const tempMailSitePasswordInput = ref("");
  const tempMailDefaultDomainInput = ref("");
  const managedBrowserExecutablePathInput = ref("");
  const autoRegisterEnabled = ref(false);
  const enableFreeAccountScheduling = ref(true);
  const autoRegisterHeadless = ref(false);
  const autoRegisterThresholdInput = ref("15");
  const autoRegisterBatchSizeInput = ref("1");
  const autoRegisterCheckIntervalInput = ref("60");
  const autoRegisterTimeoutInput = ref("480");
  const autoRegisterThresholdMin = ref(1);
  const autoRegisterThresholdMax = ref(200);
  const autoRegisterBatchSizeMin = ref(1);
  const autoRegisterBatchSizeMax = ref(20);
  const autoRegisterCheckIntervalMin = ref(10);
  const autoRegisterCheckIntervalMax = ref(3600);
  const autoRegisterTimeoutMin = ref(60);
  const autoRegisterTimeoutMax = ref(1800);

  const applySettingsPayload = async () => {
    const payload = await fetchGatewaySettings(activeBaseUrl.value);
    pollIntervalInput.value = String(payload.pollIntervalSeconds);
    pollIntervalStableSeconds.value = payload.pollIntervalSeconds;
    if (payload.pollIntervalSeconds > 0) {
      pollIntervalLastNonZeroSeconds.value = payload.pollIntervalSeconds;
    }
    pollingEnabled.value = Boolean(payload.pollingEnabled);
    pollIntervalMinSeconds.value = payload.pollIntervalRange.minSeconds;
    pollIntervalMaxSeconds.value = payload.pollIntervalRange.maxSeconds;
    tempMailBaseUrlInput.value = payload.tempMailBaseUrl ?? "";
    tempMailAdminPasswordInput.value = payload.tempMailAdminPassword ?? "";
    tempMailSitePasswordInput.value = payload.tempMailSitePassword ?? "";
    tempMailDefaultDomainInput.value = payload.tempMailDefaultDomain ?? "";
    managedBrowserExecutablePathInput.value = payload.managedBrowserExecutablePath ?? "";
    autoRegisterEnabled.value = Boolean(payload.autoRegisterEnabled);
    enableFreeAccountScheduling.value = Boolean(payload.enableFreeAccountScheduling);
    autoRegisterHeadless.value = Boolean(payload.autoRegisterHeadless);
    autoRegisterThresholdInput.value = String(payload.autoRegisterThreshold);
    autoRegisterBatchSizeInput.value = String(payload.autoRegisterBatchSize);
    autoRegisterCheckIntervalInput.value = String(payload.autoRegisterCheckIntervalSeconds);
    autoRegisterTimeoutInput.value = String(payload.autoRegisterTimeoutSeconds);
    autoRegisterThresholdMin.value = payload.autoRegisterRanges.threshold.min;
    autoRegisterThresholdMax.value = payload.autoRegisterRanges.threshold.max;
    autoRegisterBatchSizeMin.value = payload.autoRegisterRanges.batchSize.min;
    autoRegisterBatchSizeMax.value = payload.autoRegisterRanges.batchSize.max;
    autoRegisterCheckIntervalMin.value = payload.autoRegisterRanges.checkIntervalSeconds.min;
    autoRegisterCheckIntervalMax.value = payload.autoRegisterRanges.checkIntervalSeconds.max;
    autoRegisterTimeoutMin.value = payload.autoRegisterRanges.timeoutSeconds.min;
    autoRegisterTimeoutMax.value = payload.autoRegisterRanges.timeoutSeconds.max;
  };

  const loadAutomationSettings = async () => {
    if (pollIntervalLoading.value) {
      return;
    }

    pollIntervalLoading.value = true;
    pollIntervalError.value = "";
    ruleError.value = "";
    registrationError.value = "";
    controlError.value = "";

    try {
      await applySettingsPayload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "设置读取失败。";
      pollIntervalError.value = message;
      ruleError.value = message;
      registrationError.value = message;
    } finally {
      pollIntervalLoading.value = false;
    }
  };

  const applyPollIntervalPreset = (seconds: number) => {
    pollIntervalInput.value = String(seconds);
    pollIntervalFeedback.value = "";
    pollIntervalError.value = "";
  };

  const savePollIntervalSetting = async () => {
    if (pollIntervalSaving.value) {
      pendingPollIntervalSave.value = true;
      return;
    }

    pollIntervalError.value = "";
    pollIntervalFeedback.value = "";

    const parsed = Number(pollIntervalInput.value);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      pollIntervalError.value = "采集频率必须是整数秒。";
      return;
    }

    if (
      parsed !== 0 &&
      (parsed < pollIntervalMinSecondsWhenEnabled || parsed > pollIntervalMaxSeconds.value)
    ) {
      pollIntervalError.value = `采集频率需为 0（关闭）或 ${pollIntervalMinSecondsWhenEnabled}-${pollIntervalMaxSeconds.value} 秒。`;
      return;
    }

    pollIntervalSaving.value = true;

    try {
      const nextPollingEnabled = parsed > 0;
      const payload = await updateGatewaySettings(activeBaseUrl.value, {
        pollIntervalSeconds: parsed,
        pollingEnabled: nextPollingEnabled,
      });
      pollIntervalInput.value = String(payload.pollIntervalSeconds);
      pollIntervalStableSeconds.value = payload.pollIntervalSeconds;
      if (payload.pollIntervalSeconds > 0) {
        pollIntervalLastNonZeroSeconds.value = payload.pollIntervalSeconds;
      }
      pollingEnabled.value = Boolean(payload.pollingEnabled);
      pollIntervalFeedback.value = payload.pollingEnabled
        ? `已保存，当前采集频率 ${payload.pollIntervalSeconds} 秒。`
        : "已关闭额度采集。";
    } catch (error) {
      pollIntervalFeedback.value = "";
      pollIntervalError.value = error instanceof Error ? error.message : "采集频率保存失败。";
    } finally {
      pollIntervalSaving.value = false;
      if (pendingPollIntervalSave.value) {
        pendingPollIntervalSave.value = false;
        void savePollIntervalSetting();
      }
    }
  };

  const savePollingEnabledToggle = async (nextValue?: boolean) => {
    if (pollingToggleSaving.value) {
      return;
    }

    const previousEnabled = pollingEnabled.value;
    const nextEnabled = typeof nextValue === "boolean" ? nextValue : !previousEnabled;
    pollingEnabled.value = nextEnabled;
    pollingToggleSaving.value = true;
    controlError.value = "";
    controlFeedback.value = "";

    const parsedInput = Number(pollIntervalInput.value);
    const hasPositiveInput =
      Number.isFinite(parsedInput) &&
      Number.isInteger(parsedInput) &&
      parsedInput >= pollIntervalMinSecondsWhenEnabled;
    const fallbackInterval = Math.max(
      pollIntervalMinSecondsWhenEnabled,
      pollIntervalLastNonZeroSeconds.value || 30,
    );
    const nextIntervalSeconds = nextEnabled ? (hasPositiveInput ? parsedInput : fallbackInterval) : 0;

    try {
      const payload = await updateGatewaySettings(activeBaseUrl.value, {
        pollIntervalSeconds: nextIntervalSeconds,
        pollingEnabled: nextEnabled,
      });
      pollIntervalInput.value = String(payload.pollIntervalSeconds);
      pollIntervalStableSeconds.value = payload.pollIntervalSeconds;
      if (payload.pollIntervalSeconds > 0) {
        pollIntervalLastNonZeroSeconds.value = payload.pollIntervalSeconds;
      }
      pollingEnabled.value = Boolean(payload.pollingEnabled);
      controlFeedback.value = payload.pollingEnabled
        ? `已开启额度采集（${payload.pollIntervalSeconds} 秒）。`
        : "已关闭额度采集。";
    } catch (error) {
      pollingEnabled.value = previousEnabled;
      controlError.value = error instanceof Error ? error.message : "采集开关保存失败。";
    } finally {
      pollingToggleSaving.value = false;
    }
  };

  const parseBoundedInt = (
    value: string,
    label: string,
    min: number,
    max: number,
  ) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      throw new Error(`${label}必须是整数。`);
    }

    if (parsed < min || parsed > max) {
      throw new Error(`${label}需在 ${min}-${max} 之间。`);
    }

    return parsed;
  };

  const saveRuleSettings = async () => {
    if (ruleSaving.value) {
      pendingRuleSave.value = true;
      return;
    }

    ruleSaving.value = true;
    ruleError.value = "";
    ruleFeedback.value = "";

    try {
      const autoRegisterThreshold = parseBoundedInt(
        autoRegisterThresholdInput.value,
        "补号阈值",
        autoRegisterThresholdMin.value,
        autoRegisterThresholdMax.value,
      );
      const autoRegisterBatchSize = parseBoundedInt(
        autoRegisterBatchSizeInput.value,
        "单次补号数量",
        autoRegisterBatchSizeMin.value,
        autoRegisterBatchSizeMax.value,
      );
      const autoRegisterCheckIntervalSeconds = parseBoundedInt(
        autoRegisterCheckIntervalInput.value,
        "补号检查间隔",
        autoRegisterCheckIntervalMin.value,
        autoRegisterCheckIntervalMax.value,
      );

      const payload = await updateGatewaySettings(activeBaseUrl.value, {
        autoRegisterThreshold,
        autoRegisterBatchSize,
        autoRegisterCheckIntervalSeconds,
      });

      pollIntervalInput.value = String(payload.pollIntervalSeconds);
      pollIntervalStableSeconds.value = payload.pollIntervalSeconds;
      if (payload.pollIntervalSeconds > 0) {
        pollIntervalLastNonZeroSeconds.value = payload.pollIntervalSeconds;
      }
      pollingEnabled.value = Boolean(payload.pollingEnabled);
      autoRegisterThresholdInput.value = String(payload.autoRegisterThreshold);
      autoRegisterBatchSizeInput.value = String(payload.autoRegisterBatchSize);
      autoRegisterCheckIntervalInput.value = String(payload.autoRegisterCheckIntervalSeconds);
      ruleFeedback.value = "补号规则已保存。";
    } catch (error) {
      ruleError.value = error instanceof Error ? error.message : "补号规则保存失败。";
    } finally {
      ruleSaving.value = false;
      if (pendingRuleSave.value) {
        pendingRuleSave.value = false;
        void saveRuleSettings();
      }
    }
  };

  const saveRegistrationSettings = async () => {
    if (registrationSaving.value) {
      pendingRegistrationSave.value = true;
      return;
    }

    registrationSaving.value = true;
    registrationError.value = "";
    registrationFeedback.value = "";

    try {
      const autoRegisterTimeoutSeconds = parseBoundedInt(
        autoRegisterTimeoutInput.value,
        "注册超时",
        autoRegisterTimeoutMin.value,
        autoRegisterTimeoutMax.value,
      );

      const payload = await updateGatewaySettings(activeBaseUrl.value, {
        tempMailBaseUrl: tempMailBaseUrlInput.value.trim(),
        tempMailAdminPassword: tempMailAdminPasswordInput.value.trim(),
        tempMailSitePassword: tempMailSitePasswordInput.value.trim(),
        tempMailDefaultDomain: tempMailDefaultDomainInput.value.trim(),
        managedBrowserExecutablePath: managedBrowserExecutablePathInput.value.trim(),
        autoRegisterHeadless: autoRegisterHeadless.value,
        autoRegisterTimeoutSeconds,
      });

      pollIntervalInput.value = String(payload.pollIntervalSeconds);
      pollIntervalStableSeconds.value = payload.pollIntervalSeconds;
      if (payload.pollIntervalSeconds > 0) {
        pollIntervalLastNonZeroSeconds.value = payload.pollIntervalSeconds;
      }
      pollingEnabled.value = Boolean(payload.pollingEnabled);
      tempMailBaseUrlInput.value = payload.tempMailBaseUrl ?? "";
      tempMailAdminPasswordInput.value = payload.tempMailAdminPassword ?? "";
      tempMailSitePasswordInput.value = payload.tempMailSitePassword ?? "";
      tempMailDefaultDomainInput.value = payload.tempMailDefaultDomain ?? "";
      managedBrowserExecutablePathInput.value = payload.managedBrowserExecutablePath ?? "";
      autoRegisterHeadless.value = Boolean(payload.autoRegisterHeadless);
      autoRegisterTimeoutInput.value = String(payload.autoRegisterTimeoutSeconds);
      registrationFeedback.value = "注册配置已自动保存。";
    } catch (error) {
      registrationFeedback.value = "";
      registrationError.value = error instanceof Error ? error.message : "注册配置保存失败。";
    } finally {
      registrationSaving.value = false;
      if (pendingRegistrationSave.value) {
        pendingRegistrationSave.value = false;
        void saveRegistrationSettings();
      }
    }
  };

  const saveAutoRegisterEnabledToggle = async (nextValue?: boolean) => {
    if (autoRegisterToggleSaving.value || ruleSaving.value) {
      return;
    }

    const previousValue = autoRegisterEnabled.value;
    const targetValue = typeof nextValue === "boolean" ? nextValue : !previousValue;
    autoRegisterEnabled.value = targetValue;
    autoRegisterToggleSaving.value = true;
    ruleError.value = "";
    ruleFeedback.value = "";

    try {
      const payload = await updateGatewaySettings(activeBaseUrl.value, {
        autoRegisterEnabled: targetValue,
      });
      pollIntervalInput.value = String(payload.pollIntervalSeconds);
      pollIntervalStableSeconds.value = payload.pollIntervalSeconds;
      if (payload.pollIntervalSeconds > 0) {
        pollIntervalLastNonZeroSeconds.value = payload.pollIntervalSeconds;
      }
      pollingEnabled.value = Boolean(payload.pollingEnabled);
      autoRegisterEnabled.value = Boolean(payload.autoRegisterEnabled);
      ruleFeedback.value = `已${payload.autoRegisterEnabled ? "启用" : "关闭"}自动补号。`;
    } catch (error) {
      autoRegisterEnabled.value = previousValue;
      ruleError.value = error instanceof Error ? error.message : "自动补号开关保存失败。";
    } finally {
      autoRegisterToggleSaving.value = false;
    }
  };

  const saveFreeSchedulingToggle = async (nextValue?: boolean) => {
    if (freeSchedulingToggleSaving.value) {
      return;
    }

    const previousValue = enableFreeAccountScheduling.value;
    const targetValue = typeof nextValue === "boolean" ? nextValue : !previousValue;
    enableFreeAccountScheduling.value = targetValue;
    freeSchedulingToggleSaving.value = true;
    controlError.value = "";
    controlFeedback.value = "";

    try {
      const payload = await updateGatewaySettings(activeBaseUrl.value, {
        enableFreeAccountScheduling: targetValue,
      });
      pollIntervalInput.value = String(payload.pollIntervalSeconds);
      pollIntervalStableSeconds.value = payload.pollIntervalSeconds;
      enableFreeAccountScheduling.value = Boolean(payload.enableFreeAccountScheduling);
      if (payload.pollIntervalSeconds > 0) {
        pollIntervalLastNonZeroSeconds.value = payload.pollIntervalSeconds;
      }
      pollingEnabled.value = Boolean(payload.pollingEnabled);
      controlFeedback.value = `已${payload.enableFreeAccountScheduling ? "启用" : "关闭"}免费账号调度。`;
    } catch (error) {
      enableFreeAccountScheduling.value = previousValue;
      controlError.value = error instanceof Error ? error.message : "免费调度开关保存失败。";
    } finally {
      freeSchedulingToggleSaving.value = false;
    }
  };

  watch(
    gatewayBaseUrl,
    () => {
      void loadAutomationSettings();
    },
    { immediate: true },
  );

  return {
    applyPollIntervalPreset,
    autoRegisterBatchSizeInput,
    autoRegisterBatchSizeMax,
    autoRegisterBatchSizeMin,
    autoRegisterCheckIntervalInput,
    autoRegisterCheckIntervalMax,
    autoRegisterCheckIntervalMin,
    autoRegisterEnabled,
    autoRegisterHeadless,
    autoRegisterThresholdInput,
    autoRegisterThresholdMax,
    autoRegisterThresholdMin,
    autoRegisterToggleSaving,
    autoRegisterTimeoutInput,
    autoRegisterTimeoutMax,
    autoRegisterTimeoutMin,
    enableFreeAccountScheduling,
    freeSchedulingToggleSaving,
    loadAutomationSettings,
    managedBrowserExecutablePathInput,
    pollIntervalError,
    pollIntervalFeedback,
    pollIntervalInput,
    pollIntervalLoading,
    pollIntervalMaxSeconds,
    pollIntervalMinSeconds,
    pollIntervalSaving,
    pollingEnabled,
    pollingToggleSaving,
    controlError,
    controlFeedback,
    registrationError,
    registrationFeedback,
    registrationSaving,
    ruleError,
    ruleFeedback,
    ruleSaving,
    saveAutoRegisterEnabledToggle,
    saveFreeSchedulingToggle,
    savePollingEnabledToggle,
    saveRegistrationSettings,
    saveRuleSettings,
    savePollIntervalSetting,
    tempMailAdminPasswordInput,
    tempMailBaseUrlInput,
    tempMailDefaultDomainInput,
    tempMailSitePasswordInput,
  };
};
