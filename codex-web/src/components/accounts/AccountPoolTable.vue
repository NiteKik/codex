<script setup lang="ts">
import { ref } from "vue";
import { Separator } from "reka-ui";
import AccountCreateForm from "./AccountCreateForm.vue";
import {
  deleteAccount,
  updateAccount,
  type AccountRow,
  type AccountStatus,
  type AuthMode,
} from "../../services/gateway-api.ts";

defineProps<{
  accounts: AccountRow[];
}>();

const emit = defineEmits<{
  created: [];
}>();

const createDialogRef = ref<HTMLDialogElement | null>(null);
const editDialogRef = ref<HTMLDialogElement | null>(null);
const actionBusyAccountId = ref<string | null>(null);
const tableFeedback = ref("");
const tableFeedbackTone = ref<"success" | "error">("success");

const editingAccountId = ref("");
const editName = ref("");
const editStatus = ref<AccountStatus>("healthy");
const editAuthMode = ref<AuthMode>("bearer");
const editToken = ref("");
const editSubmitting = ref(false);
const editFeedback = ref("");
const editFeedbackTone = ref<"success" | "error">("success");
const statusOptions: AccountStatus[] = ["healthy", "cooling", "exhausted", "invalid"];

const formatPercent = (value: number) => `${Math.round(Math.max(0, value) * 100)}%`;
const formatNumber = (value: number) => new Intl.NumberFormat("zh-CN").format(value);
const formatDateTime = (value: string | null) => {
  if (!value) {
    return "等待首次更新";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "时间未知";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(parsed);
};

const getQuotaTone = (ratio: number) => {
  if (ratio <= 0.2) {
    return "danger";
  }

  if (ratio <= 0.5) {
    return "warning";
  }

  return "healthy";
};

const openCreateDialog = () => {
  createDialogRef.value?.showModal();
};

const closeCreateDialog = () => {
  createDialogRef.value?.close();
};

const setTableFeedback = (message: string, tone: "success" | "error") => {
  tableFeedback.value = message;
  tableFeedbackTone.value = tone;
};

const setEditFeedback = (message: string, tone: "success" | "error") => {
  editFeedback.value = message;
  editFeedbackTone.value = tone;
};

const closeOnBackdropClick = (dialog: HTMLDialogElement | null, event: MouseEvent) => {
  if (!dialog) {
    return;
  }

  const rect = dialog.getBoundingClientRect();
  const isInsideDialog =
    rect.top <= event.clientY &&
    event.clientY <= rect.top + rect.height &&
    rect.left <= event.clientX &&
    event.clientX <= rect.left + rect.width;

  if (!isInsideDialog) {
    dialog.close();
  }
};

const onCreateDialogClick = (event: MouseEvent) => {
  closeOnBackdropClick(createDialogRef.value, event);
};

const openEditDialog = (account: AccountRow) => {
  editingAccountId.value = account.id;
  editName.value = account.name;
  editStatus.value = account.status;
  editAuthMode.value = account.auth.mode;
  editToken.value = "";
  editSubmitting.value = false;
  editFeedback.value = "";
  editDialogRef.value?.showModal();
};

const closeEditDialog = () => {
  editDialogRef.value?.close();
};

const onEditDialogClick = (event: MouseEvent) => {
  closeOnBackdropClick(editDialogRef.value, event);
};

const submitEdit = async () => {
  const accountId = editingAccountId.value;
  if (!accountId) {
    return;
  }

  const name = editName.value.trim();
  if (name.length === 0) {
    setEditFeedback("账号名称不能为空。", "error");
    return;
  }

  editSubmitting.value = true;
  editFeedback.value = "";

  try {
    await updateAccount(accountId, {
      id: accountId,
      name,
      status: editStatus.value,
      ...(editAuthMode.value === "bearer" && editToken.value.trim().length > 0
        ? {
            auth: {
              mode: "bearer" as const,
              token: editToken.value.trim(),
            },
          }
        : {}),
    });
    closeEditDialog();
    setTableFeedback("账号已更新。", "success");
    emit("created");
  } catch (error) {
    setEditFeedback(error instanceof Error ? error.message : "账号更新失败。", "error");
  } finally {
    editSubmitting.value = false;
  }
};

const removeAccount = async (account: AccountRow) => {
  const confirmed = window.confirm(`确认删除账号「${account.name}」吗？此操作不可恢复。`);
  if (!confirmed) {
    return;
  }

  actionBusyAccountId.value = account.id;
  try {
    await deleteAccount(account.id);
    setTableFeedback("账号已删除。", "success");
    emit("created");
  } catch (error) {
    setTableFeedback(error instanceof Error ? error.message : "账号删除失败。", "error");
  } finally {
    actionBusyAccountId.value = null;
  }
};

const onCreated = () => {
  closeCreateDialog();
  emit("created");
};
</script>

<template>
  <section class="dashboard-panel">
    <div class="section-heading">
      <div>
        <span class="section-kicker">Accounts Pool</span>
        <h2>账号池列表</h2>
        <p>支持按行编辑与删除账号。</p>
      </div>
      <button type="button" class="primary-btn dashboard-primary-btn account-add-btn" @click="openCreateDialog">
        添加账号
      </button>
    </div>

    <Separator class="accounts-separator" orientation="horizontal" />

    <div class="account-list">
      <div
        v-if="tableFeedback"
        class="dashboard-form__feedback"
        :class="`dashboard-form__feedback--${tableFeedbackTone}`"
      >
        {{ tableFeedback }}
      </div>

      <template v-if="accounts.length === 0">
        <div class="empty-card">暂无账号。</div>
      </template>
      <template v-else>
        <div class="account-row account-row--header">
          <div>账号名称</div>
          <div>5 小时额度</div>
          <div>周额度</div>
          <div>操作</div>
        </div>

        <div v-for="account in accounts" :key="account.id" class="account-row">
          <div class="account-row__name">
            <strong>{{ account.name }}</strong>
            <span>最后更新：{{ formatDateTime(account.quota.sampleTime) }}</span>
          </div>
          <div class="account-row__quota">
            <div class="account-row__quota-topline">
              <strong>{{ formatPercent(account.quota.window5hRemainingRatio) }}</strong>
              <span>
                {{ formatNumber(account.quota.window5hRemaining) }} /
                {{ formatNumber(account.quota.window5hTotal) }}
              </span>
            </div>
            <div class="quota-progress" :class="`quota-progress--${getQuotaTone(account.quota.window5hRemainingRatio)}`">
              <span
                class="quota-progress__value"
                :style="{ width: formatPercent(account.quota.window5hRemainingRatio) }"
              />
            </div>
            <small>刷新时间：{{ formatDateTime(account.quota.window5hResetAt) }}</small>
          </div>
          <div class="account-row__quota">
            <div class="account-row__quota-topline">
              <strong>{{ formatPercent(account.quota.weeklyRemainingRatio) }}</strong>
              <span>
                {{ formatNumber(account.quota.weeklyRemaining) }} /
                {{ formatNumber(account.quota.weeklyTotal) }}
              </span>
            </div>
            <div class="quota-progress" :class="`quota-progress--${getQuotaTone(account.quota.weeklyRemainingRatio)}`">
              <span
                class="quota-progress__value"
                :style="{ width: formatPercent(account.quota.weeklyRemainingRatio) }"
              />
            </div>
            <small>刷新时间：{{ formatDateTime(account.quota.weeklyResetAt) }}</small>
          </div>
          <div class="account-row__actions">
            <button
              type="button"
              class="secondary-btn account-row__action-btn"
              :disabled="actionBusyAccountId === account.id"
              @click="openEditDialog(account)"
            >
              编辑
            </button>
            <button
              type="button"
              class="secondary-btn account-row__action-btn account-row__action-btn--danger"
              :disabled="actionBusyAccountId === account.id"
              @click="removeAccount(account)"
            >
              {{ actionBusyAccountId === account.id ? "处理中..." : "删除" }}
            </button>
          </div>
        </div>
      </template>
    </div>

    <dialog ref="createDialogRef" class="help-dialog account-create-dialog" @click="onCreateDialogClick">
      <div class="dialog-body">
        <div class="dialog-header">
          <div>
            <p class="dialog-kicker">Account Manager</p>
            <h2>新增账号</h2>
          </div>
          <button type="button" class="dialog-close" aria-label="关闭" @click="closeCreateDialog">
            ×
          </button>
        </div>

        <AccountCreateForm @created="onCreated" />
      </div>
    </dialog>

    <dialog ref="editDialogRef" class="help-dialog account-edit-dialog" @click="onEditDialogClick">
      <div class="dialog-body">
        <div class="dialog-header">
          <div>
            <p class="dialog-kicker">Account Manager</p>
            <h2>编辑账号</h2>
          </div>
          <button type="button" class="dialog-close" aria-label="关闭" @click="closeEditDialog">
            ×
          </button>
        </div>

        <form class="account-edit-form" @submit.prevent="submitEdit">
          <label class="dashboard-field">
            <span>账号名称</span>
            <input v-model="editName" class="dashboard-input dashboard-input--light" type="text" spellcheck="false" />
          </label>

          <label class="dashboard-field">
            <span>状态</span>
            <select v-model="editStatus" class="dashboard-select">
              <option v-for="status in statusOptions" :key="status" :value="status">
                {{ status }}
              </option>
            </select>
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

          <div
            v-if="editFeedback"
            class="dashboard-form__feedback"
            :class="`dashboard-form__feedback--${editFeedbackTone}`"
          >
            {{ editFeedback }}
          </div>

          <div class="dashboard-form__footer">
            <button type="button" class="secondary-btn" :disabled="editSubmitting" @click="closeEditDialog">
              取消
            </button>
            <button type="submit" class="primary-btn dashboard-primary-btn" :disabled="editSubmitting">
              {{ editSubmitting ? "保存中..." : "保存修改" }}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  </section>
</template>

<style scoped>
.dashboard-panel {
  position: relative;
  overflow: hidden;
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: 30px;
  background: rgba(255, 253, 248, 0.82);
  box-shadow: var(--shadow);
  backdrop-filter: blur(16px);
}

.dashboard-panel::before {
  content: "";
  position: absolute;
  inset: auto auto -72px -48px;
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(216, 109, 57, 0.12), transparent 70%);
  pointer-events: none;
}

.section-heading {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.section-kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--accent-strong);
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.section-heading h2 {
  margin-top: 10px;
  font-family: var(--font-heading);
  font-size: 1.7rem;
}

.section-heading p {
  color: var(--muted);
}

.accounts-separator {
  margin: 2px 0 14px;
  background: rgba(20, 33, 61, 0.1);
  height: 1px;
}

.account-list {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 10px;
}

.account-row {
  display: grid;
  grid-template-columns: minmax(180px, 1.2fr) minmax(140px, 1fr) minmax(140px, 1fr) minmax(160px, auto);
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  border: 1px solid rgba(20, 33, 61, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.74);
}

.account-row--header {
  color: var(--muted);
  font-size: 0.84rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.account-row__name {
  display: grid;
  gap: 4px;
}

.account-row__name strong {
  font-family: var(--font-heading);
  font-size: 1rem;
}

.account-row__name span {
  color: var(--muted);
  font-size: 0.82rem;
}

.account-row__quota {
  display: grid;
  gap: 6px;
}

.account-row__quota-topline {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.account-row__quota strong {
  font-family: var(--font-heading);
  font-size: 1.02rem;
}

.account-row__quota span,
.account-row__quota small {
  color: var(--muted);
  font-size: 0.84rem;
}

.quota-progress {
  position: relative;
  overflow: hidden;
  height: 8px;
  border-radius: 999px;
  background: rgba(20, 33, 61, 0.08);
}

.quota-progress__value {
  display: block;
  height: 100%;
  min-width: 8px;
  border-radius: inherit;
  background: linear-gradient(90deg, #59a98f 0%, #0f7b6c 100%);
}

.quota-progress--warning .quota-progress__value {
  background: linear-gradient(90deg, #d7a24f 0%, #a0671d 100%);
}

.quota-progress--danger .quota-progress__value {
  background: linear-gradient(90deg, #d8766d 0%, #aa3d37 100%);
}

.account-row__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.account-row__action-btn {
  min-width: 66px;
  padding: 9px 12px;
}

.account-row__action-btn--danger {
  border-color: rgba(170, 61, 55, 0.24);
  color: var(--critical);
}

.account-row__action-btn--danger:hover:not(:disabled) {
  border-color: rgba(170, 61, 55, 0.44);
  background: rgba(253, 227, 224, 0.78);
}

.empty-card {
  padding: 22px;
  border: 1px dashed rgba(20, 33, 61, 0.16);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.56);
  color: var(--muted);
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

.account-add-btn {
  min-width: 110px;
}

.help-dialog {
  width: min(92vw, 540px);
  padding: 0;
  border: 1px solid rgba(20, 33, 61, 0.08);
  border-radius: 24px;
  background: #fffdfa;
  box-shadow: 0 30px 80px rgba(10, 23, 48, 0.2);
}

.help-dialog::backdrop {
  background: rgba(10, 23, 48, 0.4);
  backdrop-filter: blur(6px);
}

.dialog-body {
  padding: 24px;
}

.dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.dialog-kicker {
  color: var(--accent-strong);
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.dialog-header h2 {
  margin-top: 8px;
  font-family: var(--font-heading);
  font-size: 1.55rem;
}

.dialog-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(20, 33, 61, 0.08);
  color: var(--ink);
  cursor: pointer;
}

.account-create-dialog {
  width: min(94vw, 920px);
}

.account-create-dialog .dialog-body {
  max-height: min(86vh, 880px);
  overflow: auto;
}

.account-edit-dialog {
  width: min(92vw, 620px);
}

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

.dashboard-select {
  font: inherit;
}

.dashboard-input:focus,
.dashboard-select:focus {
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

@media (max-width: 920px) {
  .account-row {
    grid-template-columns: 1fr;
  }

  .account-row__actions {
    justify-content: flex-start;
  }

  .section-heading {
    flex-direction: column;
    align-items: stretch;
  }

  .account-add-btn {
    width: 100%;
  }

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
