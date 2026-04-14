import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useAppConfigStore } from "../stores/app-config.ts";
import {
  fetchGatewaySettings,
  updateGatewaySettings,
} from "../services/settings-page-api.ts";

export const useAccountAutomationSettings = () => {
  const appConfigStore = useAppConfigStore();
  const { gatewayBaseUrl } = storeToRefs(appConfigStore);
  const activeBaseUrl = computed(() => gatewayBaseUrl.value);

  const pollIntervalLoading = ref(false);
  const pollIntervalSaving = ref(false);
  const pollIntervalError = ref("");
  const pollIntervalFeedback = ref("");
  const pollIntervalInput = ref("30");
  const pollIntervalMinSeconds = ref(5);
  const pollIntervalMaxSeconds = ref(3600);

  const automationSaving = ref(false);
  const automationError = ref("");
  const automationFeedback = ref("");
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
    automationError.value = "";

    try {
      await applySettingsPayload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "设置读取失败。";
      pollIntervalError.value = message;
      automationError.value = message;
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
      return;
    }

    pollIntervalError.value = "";
    pollIntervalFeedback.value = "";

    const parsed = Number(pollIntervalInput.value);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      pollIntervalError.value = "采集频率必须是整数秒。";
      return;
    }

    if (parsed < pollIntervalMinSeconds.value || parsed > pollIntervalMaxSeconds.value) {
      pollIntervalError.value = `采集频率需在 ${pollIntervalMinSeconds.value}-${pollIntervalMaxSeconds.value} 秒之间。`;
      return;
    }

    pollIntervalSaving.value = true;

    try {
      const payload = await updateGatewaySettings(activeBaseUrl.value, {
        pollIntervalSeconds: parsed,
      });
      pollIntervalInput.value = String(payload.pollIntervalSeconds);
      pollIntervalFeedback.value = `已保存，当前采集频率 ${payload.pollIntervalSeconds} 秒。`;
    } catch (error) {
      pollIntervalError.value = error instanceof Error ? error.message : "采集频率保存失败。";
    } finally {
      pollIntervalSaving.value = false;
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

  const saveAutomationSettings = async () => {
    if (automationSaving.value) {
      return;
    }

    automationSaving.value = true;
    automationError.value = "";
    automationFeedback.value = "";

    try {
      const pollIntervalSeconds = parseBoundedInt(
        pollIntervalInput.value,
        "采集频率",
        pollIntervalMinSeconds.value,
        pollIntervalMaxSeconds.value,
      );
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
      const autoRegisterTimeoutSeconds = parseBoundedInt(
        autoRegisterTimeoutInput.value,
        "注册超时",
        autoRegisterTimeoutMin.value,
        autoRegisterTimeoutMax.value,
      );

      const payload = await updateGatewaySettings(activeBaseUrl.value, {
        pollIntervalSeconds,
        tempMailBaseUrl: tempMailBaseUrlInput.value.trim(),
        tempMailAdminPassword: tempMailAdminPasswordInput.value.trim(),
        tempMailSitePassword: tempMailSitePasswordInput.value.trim(),
        tempMailDefaultDomain: tempMailDefaultDomainInput.value.trim(),
        managedBrowserExecutablePath: managedBrowserExecutablePathInput.value.trim(),
        autoRegisterEnabled: autoRegisterEnabled.value,
        enableFreeAccountScheduling: enableFreeAccountScheduling.value,
        autoRegisterThreshold,
        autoRegisterBatchSize,
        autoRegisterCheckIntervalSeconds,
        autoRegisterTimeoutSeconds,
        autoRegisterHeadless: autoRegisterHeadless.value,
      });

      pollIntervalInput.value = String(payload.pollIntervalSeconds);
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
      automationFeedback.value = "自动注册与补号配置已保存。";
      pollIntervalFeedback.value = `已保存，当前采集频率 ${payload.pollIntervalSeconds} 秒。`;
    } catch (error) {
      automationError.value = error instanceof Error ? error.message : "自动注册配置保存失败。";
    } finally {
      automationSaving.value = false;
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
    autoRegisterTimeoutInput,
    autoRegisterTimeoutMax,
    autoRegisterTimeoutMin,
    automationError,
    automationFeedback,
    automationSaving,
    enableFreeAccountScheduling,
    loadAutomationSettings,
    managedBrowserExecutablePathInput,
    pollIntervalError,
    pollIntervalFeedback,
    pollIntervalInput,
    pollIntervalLoading,
    pollIntervalMaxSeconds,
    pollIntervalMinSeconds,
    pollIntervalSaving,
    saveAutomationSettings,
    savePollIntervalSetting,
    tempMailAdminPasswordInput,
    tempMailBaseUrlInput,
    tempMailDefaultDomainInput,
    tempMailSitePasswordInput,
  };
};
