<script setup lang="ts">
const props = defineProps<{
  sessionApiUrl: string;
  sessionPayload: string;
  sessionApiCopied: boolean;
  submitting: boolean;
}>();

const emit = defineEmits<{
  "update:sessionPayload": [value: string];
  copySessionApiUrl: [];
  importSession: [];
}>();
</script>

<template>
  <section class="account-add-panel">
    <h3 class="account-add-panel__title">方式三：Session JSON（手动导入）</h3>
    <p class="account-add-panel__hint">
      直接粘贴
      <button
        type="button"
        class="inline-copy-link"
        @click="emit('copySessionApiUrl')"
      >
        {{ sessionApiUrl }}
      </button>
      返回的完整 JSON（点击链接可复制）。
    </p>
    <label class="dashboard-field dashboard-field--full">
      <span>Session JSON</span>
      <textarea
        :value="sessionPayload"
        class="dashboard-textarea"
        rows="8"
        spellcheck="false"
        :placeholder="`粘贴 ${sessionApiUrl} 返回的完整 JSON`"
        @input="
          emit('update:sessionPayload', ($event.target as HTMLTextAreaElement).value)
        "
      />
    </label>
    <p v-if="sessionApiCopied" class="account-copy-feedback">
      Session 接口地址已复制到剪贴板。
    </p>

    <div class="dashboard-toolbar">
      <button
        type="button"
        class="primary-btn dashboard-primary-btn account-save-btn"
        :disabled="submitting"
        @click="emit('importSession')"
      >
        <span v-if="submitting" class="btn-spinner" aria-hidden="true"></span>
        <span>{{ submitting ? "导入中..." : "导入 Session JSON" }}</span>
      </button>
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

.account-add-panel__title {
  font-family: var(--font-heading);
  font-size: 1.12rem;
}

.account-add-panel__hint {
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.5;
}

.inline-copy-link {
  display: inline;
  margin: 0 4px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #8b3f1f;
  font: inherit;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.inline-copy-link:hover {
  color: #b45125;
}

.inline-copy-link:focus-visible {
  outline: 2px solid rgba(216, 109, 57, 0.35);
  outline-offset: 2px;
  border-radius: 4px;
}

.account-copy-feedback {
  margin: 0;
  color: var(--success);
  font-size: 0.88rem;
  font-weight: 700;
}

.dashboard-field {
  display: grid;
  gap: 8px;
  color: var(--ink);
  font-weight: 700;
}

.dashboard-field span {
  font-size: 0.92rem;
}

.dashboard-field--full {
  grid-column: 1 / -1;
}

.dashboard-textarea {
  width: 100%;
  min-height: 130px;
  resize: vertical;
  padding: 12px 14px;
  border: 1px solid rgba(20, 33, 61, 0.14);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.78);
  color: var(--ink);
}

.dashboard-textarea:focus {
  outline: none;
  border-color: rgba(216, 109, 57, 0.34);
  box-shadow: 0 0 0 4px rgba(216, 109, 57, 0.08);
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
}
</style>

