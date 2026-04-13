<script setup lang="ts">
import { ref } from "vue";
import RuntimeLogsPanel from "../components/settings/RuntimeLogsPanel.vue";
import {
  getStoredGatewayBaseUrl,
  normalizeGatewayBaseUrl,
  saveGatewayBaseUrl,
} from "../utils/gateway-base-url.ts";

const initialBaseUrl = getStoredGatewayBaseUrl();
const baseUrlInput = ref(initialBaseUrl);
const activeBaseUrl = ref(initialBaseUrl);
const saveFeedback = ref("");

const saveBaseUrlSetting = () => {
  const normalized = normalizeGatewayBaseUrl(baseUrlInput.value);
  baseUrlInput.value = normalized;
  activeBaseUrl.value = saveGatewayBaseUrl(normalized);
  saveFeedback.value =
    activeBaseUrl.value === "/gateway-api"
      ? "已保存，当前使用本地代理 /gateway-api。"
      : `已保存，当前使用 ${activeBaseUrl.value}。`;
};
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

.secondary-btn:hover {
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.24);
  background: rgba(255, 255, 255, 0.16);
}

.settings-helper {
  color: rgba(246, 239, 230, 0.72);
}

.settings-feedback {
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(222, 245, 239, 0.16);
  color: #dff8f2;
  font-size: 0.94rem;
  font-weight: 700;
}

@media (max-width: 920px) {
  .settings-hero {
    grid-template-columns: 1fr;
    padding: 20px;
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
