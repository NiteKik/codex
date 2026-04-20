<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from "reka-ui";
import AccountAutomationSettingsPanel from "../components/accounts/AccountAutomationSettingsPanel.vue";
import RuntimeLogsPanel from "../components/settings/RuntimeLogsPanel.vue";
import { useAccountAutomationSettings } from "../composables/use-account-automation-settings.ts";
import { useSettingsPage } from "../composables/use-settings-page.ts";

const {
  activeBaseUrl,
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
  codexAutoConfigSaving,
  toggleCodexAutoConfig,
} = useSettingsPage();

const {
  controlError,
  controlFeedback,
  enableFreeAccountScheduling,
  freeSchedulingToggleSaving,
  saveFreeSchedulingToggle,
} = useAccountAutomationSettings();
</script>

<template>
  <div class="settings-shell">
    <section class="settings-card settings-schedule-card">
      <div class="settings-token-head">
        <div>
          <span class="settings-kicker">Scheduler</span>
          <h2>调度与采集</h2>
        </div>
      </div>

      <div class="settings-control-grid">
        <strong>免费账号调度</strong>
        <SwitchRoot
          v-model="enableFreeAccountScheduling"
          class="settings-switch"
          :disabled="freeSchedulingToggleSaving"
          @update:model-value="saveFreeSchedulingToggle"
        >
          <SwitchThumb class="settings-switch-thumb" />
        </SwitchRoot>
      </div>
      <p class="settings-helper">额度采集频率已固定为每 45 秒一次（每个账号依次刷新）。</p>
      <p v-if="controlError" class="settings-feedback settings-feedback--error">
        {{ controlError }}
      </p>
      <p v-if="controlFeedback" class="settings-feedback">
        {{ controlFeedback }}
      </p>
    </section>

    <AccountAutomationSettingsPanel />

    <section class="settings-card">
      <div class="settings-token-head">
        <div>
          <span class="settings-kicker">Codex Config</span>

          <h2>自动配置</h2>
          <p class="settings-helper">
            开启后将自动备份并接管用户目录
            <code>.codex/config.toml</code>，关闭或项目退出时自动还原。
          </p>
        </div>
        <SwitchRoot
          v-model="codexAutoConfigEnabled"
          class="settings-switch"
          :disabled="codexAutoConfigSaving"
          @update:model-value="toggleCodexAutoConfig"
        >
          <SwitchThumb class="settings-switch-thumb" />
        </SwitchRoot>
      </div>

      <article class="settings-diff-item">
        <strong>守护进程</strong>
        <p>
          {{ codexAutoConfigGuardianRunning ? "运行中" : "未运行" }}
          <template v-if="codexAutoConfigGuardianPid"
            >（PID: {{ codexAutoConfigGuardianPid }}）</template
          >
        </p>
      </article>

      <p class="settings-helper">
        配置文件：<code>{{ codexAutoConfigConfigPath || "-" }}</code>
      </p>
      <p class="settings-helper">
        备份文件：<code>{{ codexAutoConfigBackupPath || "-" }}</code> ·
        {{ codexAutoConfigBackupExists ? "已存在" : "未创建" }}
      </p>
      <p v-if="codexAutoConfigLastAppliedAt" class="settings-helper">
        最近应用时间：{{ codexAutoConfigLastAppliedAt }}
      </p>
      <p
        v-if="codexAutoConfigLastError"
        class="settings-feedback settings-feedback--error"
      >
        最近错误：{{ codexAutoConfigLastError }}
      </p>
      <p
        v-if="codexAutoConfigError"
        class="settings-feedback settings-feedback--error"
      >
        {{ codexAutoConfigError }}
      </p>
      <p v-if="codexAutoConfigFeedback" class="settings-feedback">
        {{ codexAutoConfigFeedback }}
      </p>
    </section>

    <RuntimeLogsPanel :base-url="activeBaseUrl" />
  </div>
</template>

<style scoped>
.settings-shell {
  max-width: 1220px;
  margin: 0 auto;
  display: grid;
  gap: 22px;
}

.settings-hero,
.settings-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: 30px;
  background: rgba(255, 253, 248, 0.82);
  box-shadow: var(--shadow);
}

.settings-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
  gap: 24px;
  padding: 28px;
}

.settings-hero::before,
.settings-card::before {
  content: "";
  position: absolute;
  inset: auto auto -72px -48px;
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(216, 109, 57, 0.12),
    transparent 70%
  );
  pointer-events: none;
}

.settings-hero__copy,
.settings-card {
  position: relative;
  z-index: 1;
}

.settings-kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--accent-strong);
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.settings-hero__copy h1 {
  margin-top: 12px;
  font-family: var(--font-heading);
  font-size: clamp(2.2rem, 4vw, 3.6rem);
  line-height: 0.95;
}

.settings-token-head {
  position: relative;
}

.settings-hero__copy p,
.settings-helper {
  color: var(--muted);
}

.settings-hero__copy p {
  max-width: 42rem;
  margin-top: 16px;
}

.settings-card {
  display: grid;
  gap: 14px;
  padding: 22px;
  background: linear-gradient(
    135deg,
    rgba(17, 33, 59, 0.96),
    rgba(10, 23, 48, 0.96)
  );
  color: var(--card-text);
}

.settings-label {
  font-size: 0.9rem;
  font-weight: 700;
}

.settings-url-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.settings-input {
  flex: 1 1 240px;
  min-height: 50px;
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);
  color: #fffef9;
}

.settings-input:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.28);
  box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.08);
}

.settings-helper {
  color: rgba(246, 239, 230, 0.72);
}

.settings-schedule-card {
  gap: 14px;
}

.settings-control-grid {
  display: flex;
  gap: 12px;
}

.settings-control-item {
  display: grid;
  gap: 10px;
}

.settings-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.settings-switch-row p {
  color: rgba(246, 239, 230, 0.78);
  font-size: 0.9rem;
}

.settings-switch {
  width: 52px;
  height: 30px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  cursor: pointer;
  transition:
    background-color 180ms ease,
    border-color 180ms ease;
}

.settings-switch-a {
  position: absolute;
  top: 10px;
  right: 0;
  width: 52px;
  height: 30px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  cursor: pointer;
  transition:
    background-color 180ms ease,
    border-color 180ms ease;
}

.settings-switch[data-state="checked"] {
  border-color: rgba(216, 109, 57, 0.8);
  background: rgba(216, 109, 57, 0.55);
}

.settings-switch[data-disabled] {
  opacity: 0.6;
  cursor: not-allowed;
}

.settings-switch-thumb {
  display: block;
  width: 24px;
  height: 24px;
  margin: 2px;
  border-radius: 999px;
  background: #fffef8;
  box-shadow: 0 2px 6px rgba(10, 23, 48, 0.25);
  transition: transform 180ms ease;
}

.settings-switch-thumb[data-state="checked"] {
  transform: translateX(22px);
}

.settings-token-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
}

.settings-corner-status {
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.24);
  background: rgba(255, 255, 255, 0.12);
  color: rgba(246, 239, 230, 0.9);
  font-size: 0.82rem;
  font-weight: 700;
  line-height: 1;
}

.settings-corner-status--enabled {
  border-color: rgba(136, 230, 203, 0.6);
  background: rgba(136, 230, 203, 0.18);
  color: #dcfff5;
}

.settings-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.settings-textarea {
  min-height: 180px;
  resize: vertical;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
}

.settings-diff-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.settings-diff-item {
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);
}

.settings-diff-item strong {
  display: block;
  margin-bottom: 6px;
}

.settings-diff-item p {
  color: rgba(246, 239, 230, 0.78);
  font-size: 0.9rem;
}

.settings-feedback {
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(222, 245, 239, 0.16);
  color: #dff8f2;
  font-size: 0.94rem;
  font-weight: 700;
}

.settings-feedback--error {
  background: rgba(170, 61, 55, 0.2);
  color: #ffe6e2;
}

@media (max-width: 920px) {
  .settings-hero {
    grid-template-columns: 1fr;
    padding: 20px;
  }

  .settings-token-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .settings-token-card {
    padding-top: 54px;
  }

  .settings-corner-status {
    top: 14px;
    right: 14px;
    font-size: 0.78rem;
    padding: 7px 11px;
  }

  .settings-label-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .settings-presets {
    width: 100%;
  }

  .settings-diff-grid {
    grid-template-columns: 1fr;
  }

  .settings-control-grid {
    grid-template-columns: 1fr;
  }

  .settings-url-row {
    flex-direction: column;
    align-items: stretch;
  }

}
</style>
