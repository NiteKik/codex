<script setup lang="ts">
const props = defineProps<{
  captureState: "idle" | "running" | "completed" | "failed";
  captureStateLabel: string;
  captureBusy: boolean;
  captureTaskId: string;
  captureProgressMessage: string;
}>();

const emit = defineEmits<{
  start: [];
}>();
</script>

<template>
  <section class="account-add-panel">
    <div class="account-add-panel__head">
      <h3 class="account-add-panel__title">方式二：浏览器登录自动采集</h3>
      <span class="account-state-chip" :class="`account-state-chip--${captureState}`">
        {{ captureStateLabel }}
      </span>
    </div>
    <p class="account-add-panel__hint">
      适合你手动同步已注册账号。点击后自动打开浏览器，登录完成后系统自动保存登录态与
      token。
    </p>
    <p class="account-action-tip">切换到本方式后，需要点击“启动浏览器登录采集”才会开始。</p>

    <div class="dashboard-form__grid account-credentials-grid">
      <div class="dashboard-toolbar">
        <button
          type="button"
          class="primary-btn dashboard-primary-btn account-save-btn"
          :disabled="captureBusy"
          @click="emit('start')"
        >
          <span v-if="captureBusy" class="btn-spinner" aria-hidden="true"></span>
          <span>{{ captureBusy ? "采集中..." : "启动浏览器登录采集" }}</span>
        </button>
      </div>

      <div v-if="captureTaskId" class="account-progress-panel">
        <div class="account-meta-row">
          <span class="account-meta-pill">任务 {{ captureTaskId }}</span>
          <span class="account-meta-pill">状态 {{ captureStateLabel }}</span>
        </div>
        <p class="account-capture-meta account-capture-meta--latest">
          当前进度：{{ captureProgressMessage || "等待任务状态更新..." }}
        </p>
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
