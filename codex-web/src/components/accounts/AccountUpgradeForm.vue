<script setup lang="ts">
import type { AccountRow, CdkProductOption } from "../../services/gateway-api.ts";

defineProps<{
  formatCdkProductType: (productType: string) => string;
  upgradeCdkOptions: CdkProductOption[];
  upgradeFeedback: string;
  upgradeLoadingOptions: boolean;
  upgradeSubmitting: boolean;
  upgradeTargetAccount: AccountRow | null;
}>();

defineEmits<{
  cancel: [];
  submit: [];
}>();

const upgradeSelectedProductType = defineModel<string>("selectedProductType", {
  required: true,
});
const upgradeSessionInfo = defineModel<string>("sessionInfo", {
  required: true,
});
</script>

<template>
  <form class="account-upgrade-form" @submit.prevent="$emit('submit')">
    <p class="upgrade-warning">
      存在封号风险，升级账号需为一次性账号，点击确认后继续。
    </p>
    <p v-if="upgradeTargetAccount" class="upgrade-account">
      当前账号：{{ upgradeTargetAccount.name }}
    </p>

    <div v-if="upgradeLoadingOptions" class="empty-card">
      正在加载可用 CDK...
    </div>
    <div v-else-if="upgradeCdkOptions.length === 0" class="empty-card">
      当前暂无可用 CDK。
    </div>
    <div v-else class="upgrade-cdk-list">
      <label
        v-for="option in upgradeCdkOptions"
        :key="option.productType"
        class="upgrade-cdk-item"
      >
        <input
          v-model="upgradeSelectedProductType"
          type="radio"
          :value="option.productType"
          :disabled="upgradeSubmitting"
        />
        <div class="upgrade-cdk-item__body">
          <strong>{{ formatCdkProductType(option.productType) }}</strong>
          <small>类型标识：{{ option.productType }} · 可用数量：{{ option.count }}</small>
        </div>
      </label>
    </div>

    <label class="dashboard-field">
      <span>Session 信息（可选，不填则沿用已保存）</span>
      <textarea
        v-model="upgradeSessionInfo"
        class="dashboard-textarea dashboard-input--light"
        rows="4"
        spellcheck="false"
        placeholder="粘贴完整 session_info JSON"
      />
    </label>

    <div
      v-if="upgradeFeedback"
      class="dashboard-form__feedback dashboard-form__feedback--error"
    >
      {{ upgradeFeedback }}
    </div>

    <div class="dashboard-form__footer">
      <button
        type="button"
        class="secondary-btn"
        :disabled="upgradeSubmitting"
        @click="$emit('cancel')"
      >
        取消
      </button>
      <button
        type="submit"
        class="primary-btn dashboard-primary-btn"
        :disabled="
          upgradeSubmitting ||
          upgradeLoadingOptions ||
          upgradeCdkOptions.length === 0 ||
          !upgradeSelectedProductType
        "
      >
        {{ upgradeSubmitting ? "升级中..." : "确认升级" }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.account-upgrade-form {
  display: grid;
  gap: 12px;
}

.upgrade-warning {
  margin: 8px 0 0;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(170, 61, 55, 0.24);
  background: rgba(253, 227, 224, 0.75);
  color: #8e2f2a;
  font-weight: 700;
}

.upgrade-account {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
}

.upgrade-cdk-list {
  display: grid;
  gap: 8px;
  max-height: 280px;
  overflow: auto;
  padding-right: 4px;
}

.upgrade-cdk-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(20, 33, 61, 0.12);
  background: rgba(255, 255, 255, 0.86);
}

.upgrade-cdk-item:hover {
  border-color: rgba(216, 109, 57, 0.3);
}

.upgrade-cdk-item__body {
  display: grid;
  gap: 4px;
}

.upgrade-cdk-item__body strong {
  font-family: var(--font-heading);
  letter-spacing: 0.03em;
}

.upgrade-cdk-item__body small {
  color: var(--muted);
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
