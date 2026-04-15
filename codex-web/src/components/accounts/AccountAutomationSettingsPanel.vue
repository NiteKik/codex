<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  SwitchRoot,
  SwitchThumb,
  ToastDescription,
  ToastProvider,
  ToastRoot,
  ToastTitle,
  ToastViewport,
} from "reka-ui";
import { useAccountAutomationSettings } from "../../composables/use-account-automation-settings.ts";

const {
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
  managedBrowserExecutablePathInput,
  registrationError,
  registrationFeedback,
  registrationSaving,
  ruleError,
  ruleFeedback,
  ruleSaving,
  saveAutoRegisterEnabledToggle,
  saveRegistrationSettings,
  saveRuleSettings,
  tempMailAdminPasswordInput,
  tempMailBaseUrlInput,
  tempMailDefaultDomainInput,
  tempMailSitePasswordInput,
} = useAccountAutomationSettings();

type SettingsToastTone = "success" | "error";

const toastOpen = ref(false);
const toastTitle = ref("保存成功");
const toastMessage = ref("");
const toastTone = ref<SettingsToastTone>("success");
const toastKey = ref(0);

const toastClass = computed(() => ({
  "settings-toast": true,
  "settings-toast--error": toastTone.value === "error",
  "settings-toast--success": toastTone.value === "success",
}));

const showToast = (message: string, tone: SettingsToastTone) => {
  if (!message) {
    return;
  }

  toastTone.value = tone;
  toastTitle.value = tone === "success" ? "保存成功" : "保存失败";
  toastMessage.value = message;
  toastKey.value += 1;
  toastOpen.value = true;
};

watch(ruleFeedback, (message) => {
  showToast(message, "success");
});

watch(registrationFeedback, (message) => {
  showToast(message, "success");
});

watch(ruleError, (message) => {
  showToast(message, "error");
});

watch(registrationError, (message) => {
  showToast(message, "error");
});
</script>

<template>
  <ToastProvider :duration="2600">
    <div class="account-settings-panel">
      <section class="settings-card">
        <div class="settings-head">
          <div>
            <h3>补号规则</h3>
            <p class="settings-helper">
              控制账号池何时补号，开启后会按规则自动注册补充账号。
            </p>
          </div>
          <div class="settings-switch-row">
            <span class="settings-switch-label">
              {{ autoRegisterEnabled ? "自动补号已启用" : "自动补号已关闭" }}
              <span v-if="autoRegisterToggleSaving"> · 切换中...</span>
            </span>
            <SwitchRoot
              v-model="autoRegisterEnabled"
              class="settings-switch"
              :disabled="ruleSaving || autoRegisterToggleSaving"
              @update:model-value="saveAutoRegisterEnabledToggle"
            >
              <SwitchThumb class="settings-switch-thumb" />
            </SwitchRoot>
          </div>
        </div>
        <div class="settings-grid">
          <label class="settings-field">
            <span class="settings-label">补号阈值</span>
            <input
              v-model="autoRegisterThresholdInput"
              class="settings-input"
              type="number"
              :min="autoRegisterThresholdMin"
              :max="autoRegisterThresholdMax"
              step="1"
              @change="saveRuleSettings"
            />
            <small class="settings-helper">
              范围：{{ autoRegisterThresholdMin }} -
              {{ autoRegisterThresholdMax }}
            </small>
          </label>

          <label class="settings-field">
            <span class="settings-label">单次补号数量</span>
            <input
              v-model="autoRegisterBatchSizeInput"
              class="settings-input"
              type="number"
              :min="autoRegisterBatchSizeMin"
              :max="autoRegisterBatchSizeMax"
              step="1"
              @change="saveRuleSettings"
            />
            <small class="settings-helper">
              范围：{{ autoRegisterBatchSizeMin }} -
              {{ autoRegisterBatchSizeMax }}
            </small>
          </label>

          <label class="settings-field">
            <span class="settings-label">检查间隔（秒）</span>
            <input
              v-model="autoRegisterCheckIntervalInput"
              class="settings-input"
              type="number"
              :min="autoRegisterCheckIntervalMin"
              :max="autoRegisterCheckIntervalMax"
              step="1"
              @change="saveRuleSettings"
            />
            <small class="settings-helper">
              范围：{{ autoRegisterCheckIntervalMin }} -
              {{ autoRegisterCheckIntervalMax }}
            </small>
          </label>
        </div>

        <p v-if="ruleSaving" class="settings-feedback">
          正在自动保存补号规则...
        </p>
      </section>

      <section class="settings-card">
        <div class="settings-head">
          <div>
            <h3>注册配置</h3>
            <p class="settings-helper">
              控制自动注册时的邮箱、浏览器和超时参数。
            </p>
          </div>
        </div>
        <p class="settings-helper">修改任一项后会立即自动保存。</p>

        <div class="settings-grid">
          <label class="settings-field">
            <span class="settings-label">Temp Mail 地址</span>
            <input
              v-model="tempMailBaseUrlInput"
              class="settings-input"
              type="text"
              placeholder="https://mail.example.com"
              spellcheck="false"
              @change="saveRegistrationSettings"
            />
          </label>

          <label class="settings-field">
            <span class="settings-label">Temp Mail 默认域名</span>
            <input
              v-model="tempMailDefaultDomainInput"
              class="settings-input"
              type="text"
              placeholder="example.com"
              spellcheck="false"
              @change="saveRegistrationSettings"
            />
          </label>

          <label class="settings-field">
            <span class="settings-label">Temp Mail 管理密码</span>
            <input
              v-model="tempMailAdminPasswordInput"
              class="settings-input"
              type="password"
              spellcheck="false"
              @change="saveRegistrationSettings"
            />
          </label>

          <label class="settings-field">
            <span class="settings-label">Temp Mail 站点密码</span>
            <input
              v-model="tempMailSitePasswordInput"
              class="settings-input"
              type="password"
              spellcheck="false"
              placeholder="未启用可留空"
              @change="saveRegistrationSettings"
            />
          </label>

          <label class="settings-field settings-field--full">
            <span class="settings-label">浏览器可执行文件</span>
            <input
              v-model="managedBrowserExecutablePathInput"
              class="settings-input"
              type="text"
              spellcheck="false"
              placeholder="留空时自动尝试 Edge / Chrome 默认路径"
              @change="saveRegistrationSettings"
            />
          </label>

          <label class="settings-field settings-field--inline">
            <span class="settings-label">无头浏览器</span>
            <input
              v-model="autoRegisterHeadless"
              class="settings-checkbox"
              type="checkbox"
              @change="saveRegistrationSettings"
            />
          </label>

          <label class="settings-field">
            <span class="settings-label">注册超时（秒）</span>
            <input
              v-model="autoRegisterTimeoutInput"
              class="settings-input"
              type="number"
              :min="autoRegisterTimeoutMin"
              :max="autoRegisterTimeoutMax"
              step="1"
              @change="saveRegistrationSettings"
            />
            <small class="settings-helper">
              范围：{{ autoRegisterTimeoutMin }} - {{ autoRegisterTimeoutMax }}
            </small>
          </label>
        </div>

        <p v-if="registrationSaving" class="settings-feedback">
          正在自动保存注册配置...
        </p>
      </section>
    </div>

    <ToastRoot
      :key="toastKey"
      v-model:open="toastOpen"
      :class="toastClass"
      :duration="2600"
    >
      <ToastTitle class="settings-toast__title">{{ toastTitle }}</ToastTitle>
      <ToastDescription class="settings-toast__desc">{{
        toastMessage
      }}</ToastDescription>
    </ToastRoot>
    <ToastViewport class="settings-toast-viewport" />
  </ToastProvider>
</template>

<style scoped>
.account-settings-panel {
  display: grid;
  gap: 16px;
}

.settings-card {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid rgba(20, 33, 61, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.65);
}

.settings-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
}

.settings-switch-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.settings-switch-label {
  color: var(--muted);
  font-size: 0.86rem;
}

.settings-switch {
  position: relative;
  width: 50px;
  min-width: 50px;
  height: 28px;
  border: 1px solid rgba(20, 33, 61, 0.2);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.68);
  cursor: pointer;
  transition:
    background-color 180ms ease,
    border-color 180ms ease;
}

.settings-switch[data-state="checked"] {
  border-color: rgba(216, 109, 57, 0.75);
  background: rgba(216, 109, 57, 0.45);
}

.settings-switch[data-disabled] {
  opacity: 0.6;
  cursor: not-allowed;
}

.settings-switch-thumb {
  display: block;
  width: 22px;
  height: 22px;
  margin: 2px;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 2px 6px rgba(20, 33, 61, 0.18);
  transition: transform 180ms ease;
}

.settings-switch-thumb[data-state="checked"] {
  transform: translateX(22px);
}

.settings-head h3 {
  font-family: var(--font-heading);
  font-size: 1.2rem;
}

.settings-helper {
  color: var(--muted);
  font-size: 0.88rem;
}

.settings-label {
  font-size: 0.9rem;
  font-weight: 700;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.settings-field {
  display: grid;
  gap: 8px;
}

.settings-field--full {
  grid-column: 1 / -1;
}

.settings-field--inline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(20, 33, 61, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.75);
}

.settings-checkbox {
  width: 18px;
  height: 18px;
}

.settings-input {
  flex: 1;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid rgba(20, 33, 61, 0.16);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.85);
  color: var(--ink);
}

.settings-input:focus {
  outline: none;
  border-color: rgba(216, 109, 57, 0.34);
  box-shadow: 0 0 0 4px rgba(216, 109, 57, 0.08);
}

.settings-feedback {
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--success-soft);
  color: var(--success);
  font-size: 0.9rem;
  font-weight: 700;
}

.settings-feedback--error {
  background: var(--critical-soft);
  color: var(--critical);
}

.settings-toast-viewport {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 80;
  display: flex;
  width: min(360px, calc(100vw - 24px));
  margin: 0;
  padding: 0;
  list-style: none;
  outline: none;
}

.settings-toast {
  width: 100%;
  display: grid;
  gap: 4px;
  border: 1px solid rgba(222, 245, 239, 0.52);
  border-radius: 14px;
  background: rgba(16, 37, 57, 0.96);
  color: #e8fff7;
  box-shadow: 0 14px 38px rgba(8, 20, 37, 0.32);
  padding: 12px 14px;
}

.settings-toast--error {
  border-color: rgba(255, 159, 152, 0.6);
  color: #ffe6e2;
}

.settings-toast--success {
  border-color: rgba(136, 230, 203, 0.56);
}

.settings-toast__title {
  font-size: 0.9rem;
  font-weight: 800;
}

.settings-toast__desc {
  color: rgba(233, 245, 255, 0.9);
  font-size: 0.86rem;
  line-height: 1.4;
}

.settings-toast[data-state="open"] {
  animation: settings-toast-in 180ms ease-out;
}

.settings-toast[data-state="closed"] {
  animation: settings-toast-out 160ms ease-in;
}

.settings-toast[data-swipe="move"] {
  transform: translateX(var(--reka-toast-swipe-move-x));
}

.settings-toast[data-swipe="end"] {
  animation: settings-toast-swipe-out 120ms ease-out;
}

@keyframes settings-toast-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes settings-toast-out {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(8px);
  }
}

@keyframes settings-toast-swipe-out {
  from {
    opacity: 1;
    transform: translateX(var(--reka-toast-swipe-end-x));
  }
  to {
    opacity: 0;
    transform: translateX(calc(var(--reka-toast-swipe-end-x) + 8px));
  }
}

@media (max-width: 920px) {
  .settings-head {
    flex-direction: column;
    align-items: stretch;
  }

  .settings-switch-row {
    justify-content: space-between;
    width: 100%;
  }

  .settings-grid {
    grid-template-columns: 1fr;
  }
}
</style>
