<script setup lang="ts">
import type { TaskProgressItem } from "./create-form-types.ts";

const props = defineProps<{
  registrationState: "idle" | "running" | "completed" | "failed";
  registrationStateLabel: string;
  registrationBusy: boolean;
  registrationStopping: boolean;
  registrationTaskId: string;
  registrationElapsedSeconds: number;
  registrationProgressMessage: string;
  registrationProgressHistory: TaskProgressItem[];
  formatProgressTime: (value: string) => string;
}>();

const emit = defineEmits<{
  start: [];
  stop: [];
}>();
</script>

<template>
  <section class="account-add-panel">
    <div class="account-add-panel__head">
      <h3 class="account-add-panel__title">方式一：自动注册新账号</h3>
      <span
        class="account-state-chip"
        :class="`account-state-chip--${registrationState}`"
      >
        {{ registrationStateLabel }}
      </span>
    </div>
    <p class="account-add-panel__hint">
      使用设置页中配置的 Temp Mail 与浏览器路径自动完成注册、收验证码并写入账号池。
    </p>
    <p class="account-action-tip">切换到本方式后，需要点击“自动注册”才会启动任务。</p>

    <div class="dashboard-form__grid account-credentials-grid">
      <div class="dashboard-toolbar">
        <button
          type="button"
          class="primary-btn dashboard-primary-btn account-save-btn"
          :disabled="registrationBusy || registrationStopping"
          @click="emit('start')"
        >
          <span
            v-if="registrationBusy"
            class="btn-spinner"
            aria-hidden="true"
          ></span>
          <span>{{ registrationBusy ? "自动注册中..." : "自动注册" }}</span>
        </button>
        <button
          type="button"
          class="secondary-btn secondary-btn--danger account-save-btn"
          :disabled="
            !registrationTaskId ||
            registrationState !== 'running' ||
            !registrationBusy ||
            registrationStopping
          "
          @click="emit('stop')"
        >
          <span>{{ registrationStopping ? "终止中..." : "手动终止" }}</span>
        </button>
      </div>

      <div v-if="registrationTaskId" class="account-progress-panel">
        <div class="account-meta-row">
          <span class="account-meta-pill">任务 {{ registrationTaskId }}</span>
          <span class="account-meta-pill">状态 {{ registrationStateLabel }}</span>
          <span class="account-meta-pill"
            >已运行 {{ registrationElapsedSeconds }}s</span
          >
        </div>
        <p class="account-capture-meta account-capture-meta--latest">
          当前进度：{{ registrationProgressMessage || "等待任务状态更新..." }}
        </p>
        <ul class="account-progress-list">
          <li
            v-for="(entry, index) in registrationProgressHistory"
            :key="`${entry.at}-${entry.message}-${index}`"
            class="account-progress-list__item"
          >
            <span class="account-progress-list__time">{{
              formatProgressTime(entry.at)
            }}</span>
            <span class="account-progress-list__message">{{ entry.message }}</span>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.account-add-panel {
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 1px solid rgba(20, 33, 61, 0.1);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.7);
}

.account-add-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.account-add-panel__title {
  font-family: var(--font-heading);
  font-size: 1.12rem;
}

.account-add-panel__hint {
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.5;
}

.account-action-tip {
  margin: -4px 0 0;
  color: #8b3f1f;
  font-size: 0.84rem;
  font-weight: 700;
}

.account-state-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 72px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(20, 33, 61, 0.14);
  background: rgba(255, 255, 255, 0.92);
  color: var(--ink);
  font-size: 0.82rem;
  font-weight: 700;
}

.account-state-chip--running {
  border-color: rgba(184, 95, 52, 0.34);
  background: rgba(216, 109, 57, 0.12);
  color: #8b3f1f;
}

.account-state-chip--completed {
  border-color: rgba(35, 140, 92, 0.3);
  background: rgba(35, 140, 92, 0.12);
  color: #1c6e47;
}

.account-state-chip--failed {
  border-color: rgba(184, 31, 31, 0.3);
  background: rgba(184, 31, 31, 0.1);
  color: #9d1f1f;
}

.account-capture-meta {
  color: var(--muted);
  font-size: 0.9rem;
  word-break: break-all;
  line-height: 1.45;
}

.account-capture-meta--latest {
  color: var(--ink);
}

.account-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.account-meta-pill {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(20, 33, 61, 0.12);
  background: rgba(245, 247, 252, 0.92);
  color: var(--ink);
  font-size: 0.8rem;
  word-break: break-all;
}

.account-progress-panel {
  display: grid;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid rgba(20, 33, 61, 0.1);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.62);
}

.account-progress-list {
  display: grid;
  gap: 6px;
  max-height: 180px;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: auto;
}

.account-progress-list__item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  align-items: flex-start;
  color: var(--ink);
  font-size: 0.86rem;
  line-height: 1.4;
  padding: 4px 0;
  border-bottom: 1px dashed rgba(20, 33, 61, 0.08);
}

.account-progress-list__item:last-child {
  border-bottom: 0;
}

.account-progress-list__time {
  flex-shrink: 0;
  color: var(--muted);
  font-family: var(
    --font-mono,
    ui-monospace,
    SFMono-Regular,
    Menlo,
    Consolas,
    "Liberation Mono",
    monospace
  );
}

.account-progress-list__message {
  word-break: break-word;
}

.dashboard-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.account-credentials-grid {
  grid-template-columns: 1fr;
}

.dashboard-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.primary-btn {
  width: 100%;
  padding: 16px 20px;
  border: 0;
  border-radius: 18px;
  background: linear-gradient(135deg, #d86d39 0%, #b94d1d 100%);
  color: #fff8f4;
  font-family: var(--font-heading);
  font-size: 1.04rem;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 16px 34px rgba(185, 77, 29, 0.28);
}

.primary-btn:disabled {
  opacity: 0.56;
  cursor: not-allowed;
  box-shadow: none;
}

.dashboard-primary-btn {
  width: auto;
  box-shadow: 0 12px 28px rgba(185, 77, 29, 0.28);
}

.secondary-btn {
  width: auto;
  padding: 16px 20px;
  border: 1px solid rgba(20, 33, 61, 0.14);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.9);
  color: var(--ink);
  font-family: var(--font-heading);
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
}

.secondary-btn:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.secondary-btn--danger {
  border-color: rgba(184, 31, 31, 0.24);
  color: #a11d1d;
}

.account-save-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 248, 244, 0.45);
  border-top-color: rgba(255, 248, 244, 0.95);
  border-radius: 50%;
  animation: btn-spin 0.85s linear infinite;
}

@keyframes btn-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 920px) {
  .dashboard-toolbar,
  .dashboard-primary-btn {
    width: 100%;
  }

  .account-state-chip {
    width: auto;
  }
}
</style>
