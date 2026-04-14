<script setup lang="ts">
import RuntimeLogsPanel from "../components/settings/RuntimeLogsPanel.vue";
import { useSettingsPage } from "../composables/use-settings-page.ts";

const {
  activeBaseUrl,
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
  baseUrlInput,
  copyGatewayHeader,
  copyGatewayToken,
  copyOpenaiSnippet,
  copyProviderSnippet,
  copySessionCommand,
  copySetxCommand,
  loadCodexAutoConfigStatus,
  loadGatewayToken,
  openaiModeCompatible,
  openaiModeDiff,
  providerModeDiff,
  saveBaseUrlSetting,
  saveFeedback,
  saveCodexAutoConfigMode,
  toggleCodexAutoConfig,
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
} = useSettingsPage();
</script>

<template>
  <div class="settings-shell">
    <section class="settings-hero">
      <div class="settings-hero__copy">
        <span class="settings-kicker">Settings</span>
        <h1>设置</h1>
        <p>运行日志已经从仪表盘拆出到这里，Gateway 地址配置也会在这里统一保存。</p>
      </div>

      <div class="settings-card">
        <label class="settings-label" for="settingsGatewayBaseUrl">Gateway 地址</label>
        <div class="settings-url-row">
          <input
            id="settingsGatewayBaseUrl"
            v-model="baseUrlInput"
            class="settings-input"
            type="text"
            spellcheck="false"
          />
          <button type="button" class="secondary-btn" @click="saveBaseUrlSetting">保存地址</button>
        </div>
        <p class="settings-helper">留空时会自动回退到本地代理地址 <code>/gateway-api</code>。</p>
        <p v-if="saveFeedback" class="settings-feedback">{{ saveFeedback }}</p>
      </div>
    </section>

    <section class="settings-card settings-token-card">
      <div class="settings-token-head">
        <div>
          <span class="settings-kicker">Codex Config</span>
          <h2>自动配置</h2>
          <p class="settings-helper">
            开启后将自动备份并接管用户目录 <code>.codex/config.toml</code>，关闭或项目退出时自动还原。
          </p>
        </div>
        <button
          type="button"
          class="secondary-btn"
          :disabled="codexAutoConfigLoading"
          @click="loadCodexAutoConfigStatus"
        >
          {{ codexAutoConfigLoading ? "读取中..." : "刷新状态" }}
        </button>
      </div>

      <div class="settings-diff-grid">
        <article class="settings-diff-item">
          <strong>当前状态</strong>
          <p>
            {{ codexAutoConfigEnabled ? "已开启" : "已关闭" }} ·
            {{ codexAutoConfigActive ? "配置已接管" : "未接管" }}
          </p>
        </article>
        <article class="settings-diff-item">
          <strong>守护进程</strong>
          <p>
            {{ codexAutoConfigGuardianRunning ? "运行中" : "未运行" }}
            <template v-if="codexAutoConfigGuardianPid">（PID: {{ codexAutoConfigGuardianPid }}）</template>
          </p>
        </article>
      </div>

      <p class="settings-helper">配置文件：<code>{{ codexAutoConfigConfigPath || "-" }}</code></p>
      <p class="settings-helper">
        备份文件：<code>{{ codexAutoConfigBackupPath || "-" }}</code> ·
        {{ codexAutoConfigBackupExists ? "已存在" : "未创建" }}
      </p>
      <p v-if="codexAutoConfigLastAppliedAt" class="settings-helper">
        最近应用时间：{{ codexAutoConfigLastAppliedAt }}
      </p>
      <div class="settings-label-row">
        <label class="settings-label" for="settingsCodexAutoConfigMode">自动配置模式</label>
        <button
          type="button"
          class="secondary-btn"
          :disabled="codexAutoConfigSaving"
          @click="saveCodexAutoConfigMode"
        >
          保存模式
        </button>
      </div>
      <select
        id="settingsCodexAutoConfigMode"
        v-model="codexAutoConfigModeInput"
        class="settings-input"
      >
        <option value="openai_base_url">保留历史会话（推荐）</option>
        <option value="openai_base_url_no_forced">保留历史会话（仅 openai_base_url）</option>
      </select>
      <p class="settings-helper">
        Bun 可用性：{{ codexAutoConfigBunAvailable ? "已检测到" : "未检测到" }}。
      </p>
      <p
        v-if="codexAutoConfigResolvedMode !== codexAutoConfigModeInput"
        class="settings-helper"
      >
        已自动回退为：{{ codexAutoConfigResolvedMode }}。
      </p>
      <p class="settings-helper">
        保留历史会话模式要求网关关闭 token 强校验（`REQUIRE_GATEWAY_ACCESS_TOKEN=0`）。
        `openai_base_url_no_forced` 不强制登录方式，适合自定义登录策略。
      </p>
      <p v-if="codexAutoConfigLastError" class="settings-feedback settings-feedback--error">
        最近错误：{{ codexAutoConfigLastError }}
      </p>
      <p v-if="codexAutoConfigError" class="settings-feedback settings-feedback--error">
        {{ codexAutoConfigError }}
      </p>
      <p v-if="codexAutoConfigFeedback" class="settings-feedback">{{ codexAutoConfigFeedback }}</p>

      <div class="settings-actions">
        <button
          type="button"
          class="secondary-btn"
          :disabled="codexAutoConfigSaving"
          @click="toggleCodexAutoConfig"
        >
          {{
            codexAutoConfigSaving
              ? "处理中..."
              : codexAutoConfigEnabled
                ? "关闭自动配置"
                : "开启自动配置"
          }}
        </button>
      </div>
    </section>

    <section class="settings-card settings-token-card">
      <div class="settings-token-head">
        <div>
          <span class="settings-kicker">Gateway Token</span>
          <h2>访问 Token</h2>
          <p class="settings-helper">用于下层 Codex/插件访问本地网关代理端点。</p>
        </div>
        <button type="button" class="secondary-btn" :disabled="tokenLoading" @click="loadGatewayToken">
          {{ tokenLoading ? "读取中..." : "刷新 Token" }}
        </button>
      </div>

      <p v-if="tokenError" class="settings-feedback settings-feedback--error">{{ tokenError }}</p>

      <template v-else>
        <label class="settings-label" for="settingsGatewayToken">Token</label>
        <div class="settings-url-row">
          <input
            id="settingsGatewayToken"
            :value="tokenValue"
            class="settings-input"
            type="text"
            readonly
            spellcheck="false"
          />
          <button type="button" class="secondary-btn" :disabled="!tokenValue" @click="copyGatewayToken">
            复制 Token
          </button>
        </div>
        <p class="settings-helper">
          状态：{{ tokenRequired ? "已启用鉴权" : "未启用鉴权" }} · 来源：{{ tokenSource || "unknown" }}
        </p>
        <p v-if="tokenFilePath" class="settings-helper">Token 文件：<code>{{ tokenFilePath }}</code></p>

        <label class="settings-label" for="settingsGatewayAuthHeader">Authorization Header</label>
        <div class="settings-url-row">
          <input
            id="settingsGatewayAuthHeader"
            :value="tokenHeader"
            class="settings-input"
            type="text"
            readonly
            spellcheck="false"
          />
          <button type="button" class="secondary-btn" :disabled="!tokenHeader" @click="copyGatewayHeader">
            复制 Header
          </button>
        </div>

        <div class="settings-label-row">
          <label class="settings-label" for="settingsGatewaySetx">Windows 持久化变量（setx）</label>
          <button type="button" class="secondary-btn" :disabled="!tokenSetxCommand" @click="copySetxCommand">
            复制 setx
          </button>
        </div>
        <input
          id="settingsGatewaySetx"
          :value="tokenSetxCommand"
          class="settings-input"
          type="text"
          readonly
          spellcheck="false"
        />

        <div class="settings-label-row">
          <label class="settings-label" for="settingsGatewaySessionEnv">当前终端变量</label>
          <button
            type="button"
            class="secondary-btn"
            :disabled="!tokenSessionCommand"
            @click="copySessionCommand"
          >
            复制当前会话命令
          </button>
        </div>
        <input
          id="settingsGatewaySessionEnv"
          :value="tokenSessionCommand"
          class="settings-input"
          type="text"
          readonly
          spellcheck="false"
        />

        <div class="settings-label-row">
          <label class="settings-label" for="settingsGatewaySnippetProvider">
            方案 A：env_key + model_provider
          </label>
          <button
            type="button"
            class="secondary-btn"
            :disabled="!tokenSnippetProvider"
            @click="copyProviderSnippet"
          >
            复制方案 A
          </button>
        </div>
        <textarea
          id="settingsGatewaySnippetProvider"
          :value="tokenSnippetProvider"
          class="settings-input settings-textarea"
          rows="8"
          readonly
          spellcheck="false"
        />

        <div class="settings-label-row">
          <label class="settings-label" for="settingsGatewaySnippetOpenai">
            方案 B：openai_base_url（可选）
          </label>
          <button
            type="button"
            class="secondary-btn"
            :disabled="!tokenSnippetOpenai"
            @click="copyOpenaiSnippet"
          >
            复制方案 B
          </button>
        </div>
        <textarea
          id="settingsGatewaySnippetOpenai"
          :value="tokenSnippetOpenai"
          class="settings-input settings-textarea"
          rows="6"
          readonly
          spellcheck="false"
        />
        <p class="settings-helper">
          方案 B 兼容状态：
          {{
            openaiModeCompatible
              ? "当前网关已兼容（可直接使用 openai_base_url）。"
              : "当前网关开启了 token 强校验；若要使用方案 B，请先把 REQUIRE_GATEWAY_ACCESS_TOKEN 设为 0。"
          }}
        </p>

        <div class="settings-diff-grid">
          <article class="settings-diff-item">
            <strong>方案 A 差异</strong>
            <p>{{ providerModeDiff }}</p>
          </article>
          <article class="settings-diff-item">
            <strong>方案 B 差异</strong>
            <p>{{ openaiModeDiff }}</p>
          </article>
        </div>

        <p v-if="tokenCopiedFeedback" class="settings-feedback">{{ tokenCopiedFeedback }}</p>
      </template>
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
  position: relative;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 30px;
  background: rgba(255, 253, 248, 0.82);
  box-shadow: var(--shadow);
  backdrop-filter: blur(16px);
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
  background: radial-gradient(circle, rgba(216, 109, 57, 0.12), transparent 70%);
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

.settings-token-head h2 {
  margin-top: 10px;
  font-family: var(--font-heading);
  font-size: 1.7rem;
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
  background: linear-gradient(135deg, rgba(17, 33, 59, 0.96), rgba(10, 23, 48, 0.96));
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

.secondary-btn {
  padding: 14px 18px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.1);
  color: #fffef9;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background-color 180ms ease;
}

.secondary-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.24);
  background: rgba(255, 255, 255, 0.16);
}

.secondary-btn:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}

.settings-helper {
  color: rgba(246, 239, 230, 0.72);
}

.settings-actions {
  display: flex;
  justify-content: flex-end;
}

.settings-token-card {
  gap: 12px;
}

.settings-token-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
}

.settings-token-head .secondary-btn {
  white-space: nowrap;
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
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
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

  .settings-url-row {
    flex-direction: column;
    align-items: stretch;
  }

  .settings-url-row .secondary-btn {
    width: 100%;
  }
}
</style>
