<script setup lang="ts">
import { useAccountAutomationSettings } from "../../composables/use-account-automation-settings.ts";

const {
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
} = useAccountAutomationSettings();
</script>

<template>
  <div class="account-settings-panel">
    <section class="settings-card">
      <div class="settings-head">
        <div>
          <h3>额度采集频率</h3>
          <p class="settings-helper">后端会按此频率自动采集额度，支持秒级配置。</p>
        </div>
        <button
          type="button"
          class="secondary-btn"
          :disabled="pollIntervalLoading"
          @click="loadAutomationSettings"
        >
          {{ pollIntervalLoading ? "读取中..." : "刷新设置" }}
        </button>
      </div>

      <div class="settings-label-row">
        <label class="settings-label" for="accountPollIntervalSeconds">采集频率（秒）</label>
        <div class="settings-presets">
          <button type="button" class="secondary-btn secondary-btn--compact" @click="applyPollIntervalPreset(30)">
            30s
          </button>
          <button type="button" class="secondary-btn secondary-btn--compact" @click="applyPollIntervalPreset(60)">
            60s
          </button>
        </div>
      </div>

      <div class="settings-row">
        <input
          id="accountPollIntervalSeconds"
          v-model="pollIntervalInput"
          class="settings-input"
          type="number"
          :min="pollIntervalMinSeconds"
          :max="pollIntervalMaxSeconds"
          step="1"
        />
        <button
          type="button"
          class="secondary-btn"
          :disabled="pollIntervalSaving"
          @click="savePollIntervalSetting"
        >
          {{ pollIntervalSaving ? "保存中..." : "保存频率" }}
        </button>
      </div>

      <p class="settings-helper">可配置范围：{{ pollIntervalMinSeconds }} - {{ pollIntervalMaxSeconds }} 秒。</p>
      <p v-if="pollIntervalError" class="settings-feedback settings-feedback--error">{{ pollIntervalError }}</p>
      <p v-if="pollIntervalFeedback" class="settings-feedback">{{ pollIntervalFeedback }}</p>
    </section>

    <section class="settings-card">
      <div class="settings-head">
        <div>
          <h3>自动注册与补号</h3>
          <p class="settings-helper">
            配置 Temp Mail 与补号规则后，账号池低于阈值时会自动完成注册流程补足账号。
          </p>
        </div>
        <button
          type="button"
          class="secondary-btn"
          :disabled="pollIntervalLoading"
          @click="loadAutomationSettings"
        >
          {{ pollIntervalLoading ? "读取中..." : "刷新设置" }}
        </button>
      </div>

      <div class="settings-grid">
        <label class="settings-field">
          <span class="settings-label">Temp Mail 地址</span>
          <input
            v-model="tempMailBaseUrlInput"
            class="settings-input"
            type="text"
            placeholder="https://mail.example.com"
            spellcheck="false"
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
          />
        </label>

        <label class="settings-field">
          <span class="settings-label">Temp Mail 管理密码</span>
          <input
            v-model="tempMailAdminPasswordInput"
            class="settings-input"
            type="password"
            spellcheck="false"
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
          />
        </label>

        <label class="settings-field settings-field--inline">
          <span class="settings-label">启用自动补号</span>
          <input v-model="autoRegisterEnabled" class="settings-checkbox" type="checkbox" />
        </label>

        <label class="settings-field settings-field--inline">
          <span class="settings-label">启用免费账号调度</span>
          <input
            v-model="enableFreeAccountScheduling"
            class="settings-checkbox"
            type="checkbox"
          />
        </label>

        <label class="settings-field settings-field--inline">
          <span class="settings-label">无头浏览器</span>
          <input v-model="autoRegisterHeadless" class="settings-checkbox" type="checkbox" />
        </label>

        <p class="settings-helper settings-field settings-field--full">
          关闭后，调度器不会再把 <code>free</code> 账号放进候选池。
        </p>

        <label class="settings-field">
          <span class="settings-label">补号阈值</span>
          <input
            v-model="autoRegisterThresholdInput"
            class="settings-input"
            type="number"
            :min="autoRegisterThresholdMin"
            :max="autoRegisterThresholdMax"
            step="1"
          />
          <small class="settings-helper">
            范围：{{ autoRegisterThresholdMin }} - {{ autoRegisterThresholdMax }}
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
          />
          <small class="settings-helper">
            范围：{{ autoRegisterBatchSizeMin }} - {{ autoRegisterBatchSizeMax }}
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
          />
          <small class="settings-helper">
            范围：{{ autoRegisterCheckIntervalMin }} - {{ autoRegisterCheckIntervalMax }}
          </small>
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
          />
          <small class="settings-helper">
            范围：{{ autoRegisterTimeoutMin }} - {{ autoRegisterTimeoutMax }}
          </small>
        </label>
      </div>

      <p v-if="automationError" class="settings-feedback settings-feedback--error">{{ automationError }}</p>
      <p v-if="automationFeedback" class="settings-feedback">{{ automationFeedback }}</p>

      <div class="settings-actions">
        <button
          type="button"
          class="secondary-btn"
          :disabled="automationSaving"
          @click="saveAutomationSettings"
        >
          {{ automationSaving ? "保存中..." : "保存自动注册配置" }}
        </button>
      </div>
    </section>
  </div>
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

.settings-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.settings-presets {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-row {
  display: flex;
  align-items: center;
  gap: 10px;
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

.secondary-btn {
  padding: 10px 14px;
  border: 1px solid rgba(20, 33, 61, 0.12);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.85);
  color: var(--ink);
  font-weight: 700;
  cursor: pointer;
}

.secondary-btn:hover:not(:disabled) {
  background: #fff;
}

.secondary-btn:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.secondary-btn--compact {
  padding: 8px 12px;
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

.settings-actions {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 920px) {
  .settings-head,
  .settings-label-row,
  .settings-row {
    flex-direction: column;
    align-items: stretch;
  }

  .settings-grid {
    grid-template-columns: 1fr;
  }

  .settings-actions .secondary-btn {
    width: 100%;
  }
}
</style>
