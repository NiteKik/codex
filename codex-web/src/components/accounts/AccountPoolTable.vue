<script setup lang="ts">
import { ref } from "vue";
import { Separator } from "reka-ui";
import AccountCreateForm from "./AccountCreateForm.vue";
import AccountEditForm from "./AccountEditForm.vue";
import AccountPoolList from "./AccountPoolList.vue";
import AccountAutomationSettingsPanel from "./AccountAutomationSettingsPanel.vue";
import AccountUpgradeForm from "./AccountUpgradeForm.vue";
import { useAccountPoolTable } from "../../composables/use-account-pool-table.ts";
import { closeDialogOnBackdropClick } from "../../composables/use-dialog-backdrop-close.ts";
import { type AccountRow } from "../../services/gateway-api.ts";

withDefaults(
  defineProps<{
    accounts: AccountRow[];
    loading?: boolean;
  }>(),
  {
    loading: false,
  },
);

const emit = defineEmits<{
  created: [];
}>();
const settingsDialogRef = ref<HTMLDialogElement | null>(null);
const settingsDialogMounted = ref(false);

const {
  actionBusyAccountId,
  closeCreateDialog,
  closeEditDialog,
  closeUpgradeDialog,
  createDialogRef,
  editAuthMode,
  editDialogRef,
  editFeedback,
  editFeedbackTone,
  editName,
  editStatus,
  editSubmitting,
  editToken,
  editWorkspaceHeadersPayload,
  editWorkspaceId,
  editWorkspaceKind,
  editWorkspaceName,
  formatCdkProductType,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatSubscriptionPlan,
  formatSubscriptionStatus,
  formatWorkspaceKind,
  getQuotaTone,
  getSubscriptionStatus,
  hasVirtualQuotaOverlay,
  isFreeSubscription,
  onCreateDialogClick,
  onCreated,
  onEditDialogClick,
  onUpgradeDialogClick,
  openCreateDialog,
  openEditDialog,
  removeAccount,
  statusOptions,
  submitEdit,
  submitUpgrade,
  tableFeedback,
  tableFeedbackTone,
  upgradeAccount,
  upgradeBusyAccountId,
  upgradeCdkOptions,
  upgradeDialogRef,
  upgradeFeedback,
  upgradeLoadingOptions,
  upgradeSelectedProductType,
  upgradeSessionInfo,
  upgradeSubmitting,
  upgradeTargetAccount,
} = useAccountPoolTable(() => emit("created"));

const openSettingsDialog = () => {
  if (!settingsDialogMounted.value) {
    settingsDialogMounted.value = true;
  }
  settingsDialogRef.value?.showModal();
};

const closeSettingsDialog = () => {
  settingsDialogRef.value?.close();
};

const onSettingsDialogClick = (event: MouseEvent) => {
  closeDialogOnBackdropClick(settingsDialogRef.value, event);
};
</script>

<template>
  <section class="dashboard-panel">
    <div class="section-heading">
      <div>
        <span class="section-kicker">Accounts Pool</span>
        <h2>账号池列表</h2>
      </div>
      <div class="section-actions">
        <button
          type="button"
          class="secondary-btn dashboard-secondary-btn account-settings-btn"
          @click="openSettingsDialog"
        >
          设置
        </button>
        <button
          type="button"
          class="primary-btn dashboard-primary-btn account-add-btn"
          @click="openCreateDialog"
        >
          添加账号
        </button>
      </div>
    </div>

    <Separator class="accounts-separator" orientation="horizontal" />
    <AccountPoolList
      :accounts="accounts"
      :loading="loading"
      :table-feedback="tableFeedback"
      :table-feedback-tone="tableFeedbackTone"
      :action-busy-account-id="actionBusyAccountId"
      :upgrade-busy-account-id="upgradeBusyAccountId"
      :format-date-time="formatDateTime"
      :format-workspace-kind="formatWorkspaceKind"
      :get-subscription-status="getSubscriptionStatus"
      :format-subscription-status="formatSubscriptionStatus"
      :format-subscription-plan="formatSubscriptionPlan"
      :is-free-subscription="isFreeSubscription"
      :format-percent="formatPercent"
      :format-number="formatNumber"
      :get-quota-tone="getQuotaTone"
      :has-virtual-quota-overlay="hasVirtualQuotaOverlay"
      @edit="openEditDialog"
      @remove="removeAccount"
      @upgrade="upgradeAccount"
    />

    <dialog
      ref="createDialogRef"
      class="help-dialog account-create-dialog"
      @click="onCreateDialogClick"
    >
      <div class="dialog-body">
        <div class="dialog-header">
          <div>
            <p class="dialog-kicker">Account Manager</p>
            <h2>新增账号</h2>
          </div>
          <button
            type="button"
            class="dialog-close"
            aria-label="关闭"
            @click="closeCreateDialog"
          >
            ×
          </button>
        </div>

        <AccountCreateForm @created="onCreated" />
      </div>
    </dialog>

    <dialog
      ref="editDialogRef"
      class="help-dialog account-edit-dialog"
      @click="onEditDialogClick"
    >
      <div class="dialog-body">
        <div class="dialog-header">
          <div>
            <p class="dialog-kicker">Account Manager</p>
            <h2>编辑账号</h2>
          </div>
          <button
            type="button"
            class="dialog-close"
            aria-label="关闭"
            @click="closeEditDialog"
          >
            ×
          </button>
        </div>

        <AccountEditForm
          v-model:name="editName"
          v-model:status="editStatus"
          v-model:workspace-kind="editWorkspaceKind"
          v-model:workspace-name="editWorkspaceName"
          v-model:workspace-id="editWorkspaceId"
          v-model:token="editToken"
          v-model:workspace-headers-payload="editWorkspaceHeadersPayload"
          :edit-auth-mode="editAuthMode"
          :edit-feedback="editFeedback"
          :edit-feedback-tone="editFeedbackTone"
          :edit-submitting="editSubmitting"
          :status-options="statusOptions"
          @cancel="closeEditDialog"
          @submit="submitEdit"
        />
      </div>
    </dialog>

    <dialog
      ref="settingsDialogRef"
      class="help-dialog account-settings-dialog"
      @click="onSettingsDialogClick"
    >
      <div class="dialog-body">
        <div class="dialog-header">
          <div>
            <p class="dialog-kicker">Account Settings</p>
            <h2>自动注册与采集设置</h2>
          </div>
          <button
            type="button"
            class="dialog-close"
            aria-label="关闭"
            @click="closeSettingsDialog"
          >
            ×
          </button>
        </div>

        <AccountAutomationSettingsPanel v-if="settingsDialogMounted" />
      </div>
    </dialog>

    <dialog
      ref="upgradeDialogRef"
      class="help-dialog account-upgrade-dialog"
      @click="onUpgradeDialogClick"
    >
      <div class="dialog-body">
        <div class="dialog-header">
          <div>
            <p class="dialog-kicker">Account Upgrade</p>
            <h2>升级账号</h2>
          </div>
          <button
            type="button"
            class="dialog-close"
            aria-label="关闭"
            @click="closeUpgradeDialog()"
          >
            ×
          </button>
        </div>

        <AccountUpgradeForm
          v-model:selected-product-type="upgradeSelectedProductType"
          v-model:session-info="upgradeSessionInfo"
          :format-cdk-product-type="formatCdkProductType"
          :upgrade-cdk-options="upgradeCdkOptions"
          :upgrade-feedback="upgradeFeedback"
          :upgrade-loading-options="upgradeLoadingOptions"
          :upgrade-submitting="upgradeSubmitting"
          :upgrade-target-account="upgradeTargetAccount"
          @cancel="closeUpgradeDialog()"
          @submit="submitUpgrade"
        />
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
  background: radial-gradient(
    circle,
    rgba(216, 109, 57, 0.12),
    transparent 70%
  );
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

.section-actions {
  display: flex;
  align-items: center;
  gap: 10px;
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

.secondary-btn {
  padding: 16px 20px;
  border: 1px solid rgba(20, 33, 61, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.88);
  color: var(--ink);
  font-family: var(--font-heading);
  font-size: 1.02rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease;
}

.secondary-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 10px 22px rgba(10, 23, 48, 0.12);
}

.secondary-btn:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.dashboard-primary-btn {
  width: auto;
  box-shadow: 0 12px 28px rgba(185, 77, 29, 0.28);
}

.dashboard-secondary-btn {
  width: auto;
}

.account-add-btn {
  min-width: 110px;
}

.account-settings-btn {
  min-width: 92px;
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

.account-upgrade-dialog {
  width: min(92vw, 700px);
}

.account-settings-dialog {
  width: min(94vw, 920px);
}

.account-settings-dialog .dialog-body {
  max-height: min(86vh, 900px);
  overflow: auto;
}

@media (max-width: 920px) {
  .section-heading {
    flex-direction: column;
    align-items: stretch;
  }

  .section-actions {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
  }

  .section-actions .secondary-btn,
  .account-add-btn {
    width: 100%;
  }
}
</style>
