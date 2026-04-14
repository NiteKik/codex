<script setup lang="ts">
import type { AccountStatus, AuthMode, WorkspaceKind } from "../../services/gateway-api.ts";

type FeedbackTone = "success" | "error";

defineProps<{
  editAuthMode: AuthMode;
  editFeedback: string;
  editFeedbackTone: FeedbackTone;
  editSubmitting: boolean;
  statusOptions: AccountStatus[];
}>();

defineEmits<{
  cancel: [];
  submit: [];
}>();

const editName = defineModel<string>("name", { required: true });
const editStatus = defineModel<AccountStatus>("status", { required: true });
const editWorkspaceKind = defineModel<WorkspaceKind>("workspaceKind", { required: true });
const editWorkspaceName = defineModel<string>("workspaceName", { required: true });
const editWorkspaceId = defineModel<string>("workspaceId", { required: true });
const editToken = defineModel<string>("token", { required: true });
const editWorkspaceHeadersPayload = defineModel<string>("workspaceHeadersPayload", {
  required: true,
});
</script>

<template>
  <form class="account-edit-form" @submit.prevent="$emit('submit')">
    <label class="dashboard-field">
      <span>账号名称</span>
      <input
        v-model="editName"
        class="dashboard-input dashboard-input--light"
        type="text"
        spellcheck="false"
      />
    </label>

    <label class="dashboard-field">
      <span>状态</span>
      <select v-model="editStatus" class="dashboard-select">
        <option v-for="status in statusOptions" :key="status" :value="status">
          {{ status }}
        </option>
      </select>
    </label>

    <label class="dashboard-field">
      <span>空间类型</span>
      <select v-model="editWorkspaceKind" class="dashboard-select">
        <option value="unknown">未识别</option>
        <option value="personal">个人空间</option>
        <option value="team">团队空间</option>
      </select>
    </label>

    <label class="dashboard-field">
      <span>空间名称（可选）</span>
      <input
        v-model="editWorkspaceName"
        class="dashboard-input dashboard-input--light"
        type="text"
        spellcheck="false"
      />
    </label>

    <label class="dashboard-field">
      <span>空间 ID（可选）</span>
      <input
        v-model="editWorkspaceId"
        class="dashboard-input dashboard-input--light"
        type="text"
        spellcheck="false"
      />
    </label>

    <label v-if="editAuthMode === 'bearer'" class="dashboard-field">
      <span>Bearer Token（留空则不修改）</span>
      <input
        v-model="editToken"
        class="dashboard-input dashboard-input--light"
        type="password"
        autocomplete="off"
        spellcheck="false"
      />
    </label>

    <label class="dashboard-field">
      <span>空间请求头 JSON（可选）</span>
      <textarea
        v-model="editWorkspaceHeadersPayload"
        class="dashboard-textarea dashboard-input--light"
        rows="4"
        spellcheck="false"
        placeholder='例如：{"x-openai-account-id":"ws_xxx"}'
      />
    </label>

    <div
      v-if="editFeedback"
      class="dashboard-form__feedback"
      :class="`dashboard-form__feedback--${editFeedbackTone}`"
    >
      {{ editFeedback }}
    </div>

    <div class="dashboard-form__footer">
      <button
        type="button"
        class="secondary-btn"
        :disabled="editSubmitting"
        @click="$emit('cancel')"
      >
        取消
      </button>
      <button
        type="submit"
        class="primary-btn dashboard-primary-btn"
        :disabled="editSubmitting"
      >
        {{ editSubmitting ? "保存中..." : "保存修改" }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.account-edit-form {
  display: grid;
  gap: 14px;
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

.dashboard-input,
.dashboard-select {
  width: 100%;
  min-height: 46px;
  padding: 10px 12px;
  border: 1px solid rgba(20, 33, 61, 0.12);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--ink);
}

.dashboard-textarea {
  width: 100%;
  min-height: 110px;
  padding: 10px 12px;
  border: 1px solid rgba(20, 33, 61, 0.12);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--ink);
  resize: vertical;
}

.dashboard-select {
  font: inherit;
}

.dashboard-input:focus,
.dashboard-select:focus,
.dashboard-textarea:focus {
  outline: none;
  border-color: rgba(216, 109, 57, 0.34);
  box-shadow: 0 0 0 4px rgba(216, 109, 57, 0.08);
}

.dashboard-form__feedback {
  margin-top: 6px;
  padding: 12px 14px;
  border-radius: 16px;
  font-size: 0.94rem;
  font-weight: 700;
}

.dashboard-form__feedback--success {
  background: var(--success-soft);
  color: var(--success);
}

.dashboard-form__feedback--error {
  background: var(--critical-soft);
  color: var(--critical);
}

.dashboard-form__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.primary-btn {
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
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    opacity 180ms ease;
}

.primary-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 20px 42px rgba(185, 77, 29, 0.32);
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
  padding: 14px 18px;
  border: 1px solid rgba(20, 33, 61, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.75);
  color: var(--ink);
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background-color 180ms ease;
}

.secondary-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(216, 109, 57, 0.26);
  background: rgba(255, 246, 240, 0.96);
}

.secondary-btn:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}

@media (max-width: 920px) {
  .dashboard-form__footer {
    justify-content: stretch;
    flex-direction: column;
  }

  .dashboard-form__footer .secondary-btn,
  .dashboard-form__footer .dashboard-primary-btn {
    width: 100%;
  }
}
</style>
