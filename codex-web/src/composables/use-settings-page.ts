import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useAppConfigStore } from "../stores/app-config.ts";
import { normalizeGatewayBaseUrl } from "../utils/gateway-base-url.ts";
import {
  fetchCodexAutoConfigStatus,
  fetchGatewayAccessToken,
  fetchGatewaySettings,
  updateCodexAutoConfigStatus,
  updateGatewaySettings,
} from "../services/settings-page-api.ts";

export const useSettingsPage = () => {
  const appConfigStore = useAppConfigStore();
  const { gatewayBaseUrl } = storeToRefs(appConfigStore);

  const baseUrlInput = ref(gatewayBaseUrl.value);
  const activeBaseUrl = computed(() => gatewayBaseUrl.value);
  const saveFeedback = ref("");
  const tokenLoading = ref(false);
  const tokenError = ref("");
  const tokenCopiedFeedback = ref("");
  const tokenValue = ref("");
  const tokenRequired = ref(false);
  const tokenSource = ref("");
  const tokenFilePath = ref("");
  const tokenHeader = ref("");
  const tokenSnippetProvider = ref("");
  const tokenSnippetOpenai = ref("");
  const tokenSetxCommand = ref("");
  const tokenSessionCommand = ref("");
  const openaiModeCompatible = ref(false);
  const providerModeDiff = ref("");
  const openaiModeDiff = ref("");
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
  const codexAutoConfigLoading = ref(false);
  const codexAutoConfigSaving = ref(false);
  const codexAutoConfigEnabled = ref(false);
  const codexAutoConfigActive = ref(false);
  const codexAutoConfigMode = ref<
    "provider_auth" | "provider_env" | "openai_base_url" | "openai_base_url_no_forced"
  >("openai_base_url");
  const codexAutoConfigModeInput = ref<
    "provider_auth" | "provider_env" | "openai_base_url" | "openai_base_url_no_forced"
  >("openai_base_url");
  const codexAutoConfigResolvedMode = ref<
    "provider_auth" | "provider_env" | "openai_base_url" | "openai_base_url_no_forced"
  >("openai_base_url");
  const codexAutoConfigBunAvailable = ref(true);
  const codexAutoConfigConfigPath = ref("");
  const codexAutoConfigBackupPath = ref("");
  const codexAutoConfigBackupExists = ref(false);
  const codexAutoConfigGuardianRunning = ref(false);
  const codexAutoConfigGuardianPid = ref<number | null>(null);
  const codexAutoConfigLastError = ref("");
  const codexAutoConfigLastAppliedAt = ref("");
  const codexAutoConfigError = ref("");
  const codexAutoConfigFeedback = ref("");

  const loadGatewayToken = async () => {
    if (tokenLoading.value) {
      return;
    }

    tokenLoading.value = true;
    tokenError.value = "";
    tokenCopiedFeedback.value = "";

    try {
      const payload = await fetchGatewayAccessToken(activeBaseUrl.value);
      tokenValue.value = payload.token ?? "";
      tokenRequired.value = Boolean(payload.required);
      tokenSource.value = payload.source ?? "";
      tokenFilePath.value = payload.tokenFilePath ?? "";
      tokenHeader.value = payload.authHeader ?? "";
      const envVarName = payload.codexEnvVar ?? "QUOTA_GATEWAY_TOKEN";
      tokenSnippetProvider.value = payload.providerConfigSnippet ?? payload.codexConfigSnippet ?? "";
      tokenSnippetOpenai.value = payload.openaiBaseUrlConfigSnippet ?? "";
      tokenSetxCommand.value =
        payload.windowsSetxCommand ?? `setx ${envVarName} "${payload.token ?? ""}"`;
      tokenSessionCommand.value =
        payload.windowsSessionCommand ?? `$env:${envVarName} = "${payload.token ?? ""}"`;
      openaiModeCompatible.value = Boolean(payload.openaiBaseUrlCompatible);
      providerModeDiff.value =
        payload.strategyDiff?.providerMode ?? "需要 env_key token，会切到自定义 provider。";
      openaiModeDiff.value =
        payload.strategyDiff?.openaiBaseUrlMode ??
        "保持 openai provider 历史上下文；通常需要网关关闭 token 强制校验。";
    } catch (error) {
      tokenError.value = error instanceof Error ? error.message : "Token 读取失败。";
    } finally {
      tokenLoading.value = false;
    }
  };

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

  const loadGatewaySettings = async () => {
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
    } catch (error) {
      automationError.value = error instanceof Error ? error.message : "自动注册配置保存失败。";
    } finally {
      automationSaving.value = false;
    }
  };

  const copyText = async (value: string, successMessage: string) => {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      tokenCopiedFeedback.value = successMessage;
    } catch {
      tokenCopiedFeedback.value = "复制失败，请手动复制。";
    }
  };

  const copyGatewayToken = async () => copyText(tokenValue.value, "Token 已复制。");

  const copyGatewayHeader = async () =>
    copyText(tokenHeader.value, "Authorization Header 已复制。");

  const copyProviderSnippet = async () =>
    copyText(tokenSnippetProvider.value, "方案 A 配置片段已复制。");

  const copyOpenaiSnippet = async () =>
    copyText(tokenSnippetOpenai.value, "方案 B 配置片段已复制。");

  const copySetxCommand = async () => copyText(tokenSetxCommand.value, "setx 命令已复制。");

  const copySessionCommand = async () =>
    copyText(tokenSessionCommand.value, "当前终端环境变量命令已复制。");

  const applyCodexAutoConfigStatus = (
    payload: Awaited<ReturnType<typeof fetchCodexAutoConfigStatus>>,
  ) => {
    codexAutoConfigEnabled.value = Boolean(payload.enabled);
    codexAutoConfigActive.value = Boolean(payload.active);
    const rawMode = payload.mode ?? "openai_base_url";
    codexAutoConfigMode.value = rawMode;
    codexAutoConfigModeInput.value =
      rawMode === "provider_auth" || rawMode === "provider_env" ? "openai_base_url" : rawMode;
    codexAutoConfigResolvedMode.value = payload.resolvedMode ?? rawMode;
    codexAutoConfigBunAvailable.value = payload.bunAvailable ?? true;
    codexAutoConfigConfigPath.value = payload.configPath ?? "";
    codexAutoConfigBackupPath.value = payload.backupPath ?? "";
    codexAutoConfigBackupExists.value = Boolean(payload.backupExists);
    codexAutoConfigGuardianRunning.value = Boolean(payload.guardianRunning);
    codexAutoConfigGuardianPid.value = payload.guardianPid ?? null;
    codexAutoConfigLastError.value = payload.lastError ?? "";
    codexAutoConfigLastAppliedAt.value = payload.lastAppliedAt ?? "";
  };

  const loadCodexAutoConfigStatus = async () => {
    if (codexAutoConfigLoading.value) {
      return;
    }

    codexAutoConfigLoading.value = true;
    codexAutoConfigError.value = "";

    try {
      const payload = await fetchCodexAutoConfigStatus(activeBaseUrl.value);
      applyCodexAutoConfigStatus(payload);
    } catch (error) {
      codexAutoConfigError.value =
        error instanceof Error ? error.message : "自动配置状态读取失败。";
    } finally {
      codexAutoConfigLoading.value = false;
    }
  };

  const toggleCodexAutoConfig = async () => {
    if (codexAutoConfigSaving.value) {
      return;
    }

    codexAutoConfigSaving.value = true;
    codexAutoConfigError.value = "";
    codexAutoConfigFeedback.value = "";

    try {
      const nextEnabled = !codexAutoConfigEnabled.value;
      const payload = await updateCodexAutoConfigStatus(
        activeBaseUrl.value,
        nextEnabled,
        codexAutoConfigModeInput.value,
      );
      applyCodexAutoConfigStatus(payload);
      codexAutoConfigFeedback.value = nextEnabled
        ? "自动配置已开启：已备份并接管 ~/.codex/config.toml。"
        : "自动配置已关闭：已还原 ~/.codex/config.toml。";
    } catch (error) {
      codexAutoConfigError.value =
        error instanceof Error ? error.message : "自动配置更新失败。";
    } finally {
      codexAutoConfigSaving.value = false;
    }
  };

  const saveCodexAutoConfigMode = async () => {
    if (codexAutoConfigSaving.value) {
      return;
    }

    codexAutoConfigSaving.value = true;
    codexAutoConfigError.value = "";
    codexAutoConfigFeedback.value = "";

    try {
      const payload = await updateCodexAutoConfigStatus(
        activeBaseUrl.value,
        codexAutoConfigEnabled.value,
        codexAutoConfigModeInput.value,
      );
      applyCodexAutoConfigStatus(payload);
      codexAutoConfigFeedback.value = "自动配置模式已更新。";
    } catch (error) {
      codexAutoConfigError.value =
        error instanceof Error ? error.message : "自动配置模式更新失败。";
    } finally {
      codexAutoConfigSaving.value = false;
    }
  };

  const saveBaseUrlSetting = () => {
    const normalized = normalizeGatewayBaseUrl(baseUrlInput.value);
    appConfigStore.setGatewayBaseUrl(normalized);
    baseUrlInput.value = gatewayBaseUrl.value;
    saveFeedback.value =
      activeBaseUrl.value === "/gateway-api"
        ? "已保存，当前使用本地代理 /gateway-api。"
        : `已保存，当前使用 ${activeBaseUrl.value}。`;
    void loadGatewayToken();
    void loadGatewaySettings();
    void loadCodexAutoConfigStatus();
  };

  watch(
    gatewayBaseUrl,
    () => {
      baseUrlInput.value = gatewayBaseUrl.value;
      void loadGatewayToken();
      void loadGatewaySettings();
      void loadCodexAutoConfigStatus();
    },
    { immediate: true },
  );

  return {
    activeBaseUrl,
    applyPollIntervalPreset,
    autoRegisterBatchSizeInput,
    autoRegisterBatchSizeMax,
    autoRegisterBatchSizeMin,
    autoRegisterCheckIntervalInput,
    autoRegisterCheckIntervalMax,
    autoRegisterCheckIntervalMin,
    autoRegisterEnabled,
    enableFreeAccountScheduling,
    autoRegisterHeadless,
    autoRegisterThresholdInput,
    autoRegisterThresholdMax,
    autoRegisterThresholdMin,
    autoRegisterTimeoutInput,
    autoRegisterTimeoutMax,
    autoRegisterTimeoutMin,
    codexAutoConfigActive,
    codexAutoConfigBackupExists,
    codexAutoConfigBackupPath,
    codexAutoConfigConfigPath,
    codexAutoConfigEnabled,
    codexAutoConfigError,
    codexAutoConfigFeedback,
    codexAutoConfigGuardianPid,
    codexAutoConfigGuardianRunning,
    codexAutoConfigLastAppliedAt,
    codexAutoConfigLastError,
    codexAutoConfigLoading,
    codexAutoConfigMode,
    codexAutoConfigModeInput,
    codexAutoConfigResolvedMode,
    codexAutoConfigBunAvailable,
    codexAutoConfigSaving,
    automationError,
    automationFeedback,
    automationSaving,
    baseUrlInput,
    copyGatewayHeader,
    copyGatewayToken,
    copyOpenaiSnippet,
    copyProviderSnippet,
    copySessionCommand,
    copySetxCommand,
    loadCodexAutoConfigStatus,
    loadGatewaySettings,
    loadGatewayToken,
    managedBrowserExecutablePathInput,
    openaiModeCompatible,
    openaiModeDiff,
    pollIntervalError,
    pollIntervalFeedback,
    pollIntervalInput,
    pollIntervalLoading,
    pollIntervalMaxSeconds,
    pollIntervalMinSeconds,
    pollIntervalSaving,
    providerModeDiff,
    saveAutomationSettings,
    saveBaseUrlSetting,
    saveFeedback,
    savePollIntervalSetting,
    tempMailAdminPasswordInput,
    tempMailBaseUrlInput,
    tempMailDefaultDomainInput,
    tempMailSitePasswordInput,
    toggleCodexAutoConfig,
    saveCodexAutoConfigMode,
    tokenCopiedFeedback,
    tokenError,
    tokenFilePath,
    tokenHeader,
    tokenLoading,
    tokenRequired,
    tokenSessionCommand,
    tokenSetxCommand,
    tokenSnippetOpenai,
    tokenSnippetProvider,
    tokenSource,
    tokenValue,
  };
};
