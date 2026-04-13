<script setup lang="ts">
import { ref } from "vue";
import { Separator } from "reka-ui";
import AccountCreateForm from "./AccountCreateForm.vue";
import {
  deleteAccount,
  fetchCdkOptions,
  updateAccount,
  upgradeAccountSubscription,
  type AccountRow,
  type AccountStatus,
  type AuthMode,
  type CdkProductOption,
  type SubscriptionStatus,
  type WorkspaceKind,
} from "../../services/gateway-api.ts";

defineProps<{
  accounts: AccountRow[];
}>();

const emit = defineEmits<{
  created: [];
}>();

const createDialogRef = ref<HTMLDialogElement | null>(null);
const editDialogRef = ref<HTMLDialogElement | null>(null);
const upgradeDialogRef = ref<HTMLDialogElement | null>(null);
const actionBusyAccountId = ref<string | null>(null);
const upgradeBusyAccountId = ref<string | null>(null);
const tableFeedback = ref("");
const tableFeedbackTone = ref<"success" | "error">("success");

const editingAccountId = ref("");
const editName = ref("");
const editStatus = ref<AccountStatus>("healthy");
const editAuthMode = ref<AuthMode>("bearer");
const editToken = ref("");
const editWorkspaceKind = ref<WorkspaceKind>("unknown");
const editWorkspaceId = ref("");
const editWorkspaceName = ref("");
const editWorkspaceHeadersPayload = ref("");
const editSubmitting = ref(false);
const editFeedback = ref("");
const editFeedbackTone = ref<"success" | "error">("success");
const upgradeTargetAccount = ref<AccountRow | null>(null);
const upgradeCdkOptions = ref<CdkProductOption[]>([]);
const upgradeSelectedProductType = ref("");
const upgradeSessionInfo = ref("");
const upgradeLoadingOptions = ref(false);
const upgradeSubmitting = ref(false);
const upgradeFeedback = ref("");
const statusOptions: AccountStatus[] = [
  "healthy",
  "cooling",
  "exhausted",
  "invalid",
];
const workspaceKindLabelMap: Record<WorkspaceKind, string> = {
  personal: "个人",
  team: "团队",
  unknown: "未识别",
};
const subscriptionStatusLabelMap: Record<SubscriptionStatus, string> = {
  active: "有效",
  trial: "试用",
  inactive: "停用",
  unknown: "未知",
};

const formatPercent = (value: number) =>
  `${Math.round(Math.max(0, value) * 100)}%`;
const formatNumber = (value: number) =>
  new Intl.NumberFormat("zh-CN").format(value);
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

const formatWorkspaceKind = (kind: WorkspaceKind) =>
  workspaceKindLabelMap[kind] ?? "未识别";
const getSubscriptionStatus = (account: AccountRow): SubscriptionStatus =>
  account.subscription?.status ?? "unknown";
const formatSubscriptionStatus = (status: SubscriptionStatus) =>
  subscriptionStatusLabelMap[status] ?? "未知";
const formatSubscriptionPlan = (planType: string | null | undefined) => {
  const normalized = planType?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return "未知";
  }

  if (normalized === "free") {
    return "免费";
  }
  if (normalized === "plus") {
    return "Plus";
  }
  if (normalized === "pro") {
    return "Pro";
  }
  if (normalized === "team" || normalized === "business") {
    return "Team";
  }
  if (normalized === "enterprise") {
    return "Enterprise";
  }
  return normalized;
};
const formatCdkProductType = (productType: string) => {
  const normalized = normalizeProductType(productType);
  if (normalized.includes("plus") && normalized.includes("1m")) {
    return "GPT Plus（月卡）";
  }
  if (normalized.includes("plus") && normalized.includes("1y")) {
    return "GPT Plus（年卡）";
  }
  return productType;
};
const hasVirtualQuotaOverlay = (account: AccountRow) =>
  account.quota.reservedUnits > 0 || account.quota.adjustedUnits > 0;
const isFreeSubscription = (account: AccountRow) =>
  (account.subscription?.planType?.trim().toLowerCase() ?? "") === "free";
const normalizeProductType = (value: string) => value.trim().toLowerCase();

const parseWorkspaceHeadersPayload = (payload: string) => {
  const trimmed = payload.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("工作空间请求头必须是 JSON 对象。");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("工作空间请求头必须是 JSON 对象。");
  }

  const entries = Object.entries(parsed).map(([key, value]) => {
    if (typeof value !== "string") {
      throw new Error(`工作空间请求头 "${key}" 的值必须是字符串。`);
    }
    return [key, value] as const;
  });

  return entries.length > 0 ? Object.fromEntries(entries) : null;
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

const closeOnBackdropClick = (
  dialog: HTMLDialogElement | null,
  event: MouseEvent,
) => {
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
  editWorkspaceKind.value = account.workspace.kind;
  editWorkspaceId.value = account.workspace.id ?? "";
  editWorkspaceName.value = account.workspace.name ?? "";
  editWorkspaceHeadersPayload.value = account.workspace.headers
    ? JSON.stringify(account.workspace.headers, null, 2)
    : "";
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

const onUpgradeDialogClick = (event: MouseEvent) => {
  closeOnBackdropClick(upgradeDialogRef.value, event);
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
    const workspaceHeaders = parseWorkspaceHeadersPayload(
      editWorkspaceHeadersPayload.value,
    );
    await updateAccount(accountId, {
      id: accountId,
      name,
      status: editStatus.value,
      workspace: {
        kind: editWorkspaceKind.value,
        id: editWorkspaceId.value.trim() || null,
        name: editWorkspaceName.value.trim() || null,
        headers: workspaceHeaders,
      },
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
    setEditFeedback(
      error instanceof Error ? error.message : "账号更新失败。",
      "error",
    );
  } finally {
    editSubmitting.value = false;
  }
};

const upgradeAccount = async (account: AccountRow) => {
  if (!isFreeSubscription(account)) {
    return;
  }

  upgradeTargetAccount.value = account;
  upgradeFeedback.value = "";
  upgradeSessionInfo.value = "";
  upgradeCdkOptions.value = [];
  upgradeSelectedProductType.value = "";
  upgradeLoadingOptions.value = true;
  upgradeDialogRef.value?.showModal();

  try {
    const payload = await fetchCdkOptions();
    const options = payload.options ?? [];
    upgradeCdkOptions.value = options;

    if (options.length === 0) {
      upgradeFeedback.value = `当前暂无可用 ${payload.defaultProductType} CDK。`;
      return;
    }

    const defaultOption =
      options.find(
        (option) =>
          normalizeProductType(option.productType) ===
          normalizeProductType(payload.defaultProductType),
      ) ?? options[0];
    upgradeSelectedProductType.value = defaultOption.productType;
  } catch (error) {
    upgradeFeedback.value =
      error instanceof Error ? error.message : "获取可用 CDK 失败。";
  } finally {
    upgradeLoadingOptions.value = false;
  }
};

const closeUpgradeDialog = (force = false) => {
  if (upgradeSubmitting.value && !force) {
    return;
  }
  upgradeDialogRef.value?.close();
  upgradeTargetAccount.value = null;
  upgradeFeedback.value = "";
  upgradeSessionInfo.value = "";
  upgradeCdkOptions.value = [];
  upgradeSelectedProductType.value = "";
};

const submitUpgrade = async () => {
  const account = upgradeTargetAccount.value;
  if (!account) {
    return;
  }

  const selected = upgradeCdkOptions.value.find(
    (option) => option.productType === upgradeSelectedProductType.value,
  );
  if (!selected) {
    upgradeFeedback.value = "请选择要使用的 CDK 类型。";
    return;
  }

  upgradeSubmitting.value = true;
  upgradeBusyAccountId.value = account.id;
  try {
    const response = await upgradeAccountSubscription(account.id, {
      productType: selected.productType,
      sessionInfo: upgradeSessionInfo.value.trim() || undefined,
    });
    setTableFeedback(
      `升级完成（${response.activation.productType}，剩余 CDK：${response.activation.remainingCdks}）。`,
      "success",
    );
    closeUpgradeDialog(true);
    emit("created");
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "账号升级失败。";
    const message = rawMessage.includes("Session信息或账号异常")
      ? `${rawMessage} 请复制全部内容重新提交。`
      : rawMessage;
    upgradeFeedback.value = message;
    setTableFeedback(message, "error");
  } finally {
    upgradeSubmitting.value = false;
    upgradeBusyAccountId.value = null;
  }
};

const removeAccount = async (account: AccountRow) => {
  const confirmed = window.confirm(
    `确认删除账号「${account.name}」吗？此操作不可恢复。`,
  );
  if (!confirmed) {
    return;
  }

  actionBusyAccountId.value = account.id;
  try {
    await deleteAccount(account.id);
    setTableFeedback("账号已删除。", "success");
    emit("created");
  } catch (error) {
    setTableFeedback(
      error instanceof Error ? error.message : "账号删除失败。",
      "error",
    );
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
      </div>
      <button
        type="button"
        class="primary-btn dashboard-primary-btn account-add-btn"
        @click="openCreateDialog"
      >
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
          <div>空间</div>
          <div>订阅</div>
          <div>5 小时额度</div>
          <div>周额度</div>
          <div>操作</div>
        </div>

        <div v-for="account in accounts" :key="account.id" class="account-row">
          <div class="account-row__name">
            <strong>{{ account.name }}</strong>
            <span
              >最后更新：{{ formatDateTime(account.quota.sampleTime) }}</span
            >
          </div>
          <div class="account-row__workspace">
            <span
              class="workspace-badge"
              :class="`workspace-badge--${account.workspace.kind}`"
            >
              {{ formatWorkspaceKind(account.workspace.kind) }}
            </span>
            <small v-if="account.workspace.name">{{
              account.workspace.name
            }}</small>
            <small v-if="account.workspace.id"
              >ID: {{ account.workspace.id }}</small
            >
          </div>
          <div class="account-row__subscription">
            <span
              class="subscription-badge"
              :class="`subscription-badge--${getSubscriptionStatus(account)}`"
            >
              {{ formatSubscriptionStatus(getSubscriptionStatus(account)) }}
            </span>
            <small>计划：{{ formatSubscriptionPlan(account.subscription?.planType) }}</small>
            <button
              v-if="isFreeSubscription(account)"
              type="button"
              class="secondary-btn subscription-upgrade-btn"
              :disabled="upgradeBusyAccountId === account.id || actionBusyAccountId === account.id"
              @click="upgradeAccount(account)"
            >
              {{ upgradeBusyAccountId === account.id ? "升级中..." : "升级" }}
            </button>
          </div>
          <div class="account-row__quota">
            <div class="account-row__quota-topline">
              <strong>{{
                formatPercent(account.quota.window5hRemainingRatio)
              }}</strong>
              <span>
                {{ formatNumber(account.quota.window5hRemaining) }} /
                {{ formatNumber(account.quota.window5hTotal) }}
              </span>
            </div>
            <div
              class="quota-progress"
              :class="`quota-progress--${getQuotaTone(account.quota.window5hRemainingRatio)}`"
            >
              <span
                class="quota-progress__value"
                :style="{
                  width: formatPercent(account.quota.window5hRemainingRatio),
                }"
              />
            </div>
            <small v-if="hasVirtualQuotaOverlay(account)">
              虚拟占用：预留 {{ formatNumber(account.quota.reservedUnits) }} ·
              待对账
              {{ formatNumber(account.quota.adjustedUnits) }}
            </small>
            <small
              >刷新时间：{{
                formatDateTime(account.quota.window5hResetAt)
              }}</small
            >
          </div>
          <div class="account-row__quota">
            <div class="account-row__quota-topline">
              <strong>{{
                formatPercent(account.quota.weeklyRemainingRatio)
              }}</strong>
              <span>
                {{ formatNumber(account.quota.weeklyRemaining) }} /
                {{ formatNumber(account.quota.weeklyTotal) }}
              </span>
            </div>
            <div
              class="quota-progress"
              :class="`quota-progress--${getQuotaTone(account.quota.weeklyRemainingRatio)}`"
            >
              <span
                class="quota-progress__value"
                :style="{
                  width: formatPercent(account.quota.weeklyRemainingRatio),
                }"
              />
            </div>
            <small v-if="hasVirtualQuotaOverlay(account)">
              已用 {{ formatNumber(account.quota.weeklyUsed) }} /
              {{ formatNumber(account.quota.weeklyTotal) }}
            </small>
            <small
              >刷新时间：{{
                formatDateTime(account.quota.weeklyResetAt)
              }}</small
            >
          </div>
          <div class="account-row__actions">
            <button
              type="button"
              class="secondary-btn account-row__action-btn"
              :disabled="actionBusyAccountId === account.id || upgradeBusyAccountId === account.id"
              @click="openEditDialog(account)"
            >
              编辑
            </button>
            <button
              type="button"
              class="secondary-btn account-row__action-btn account-row__action-btn--danger"
              :disabled="actionBusyAccountId === account.id || upgradeBusyAccountId === account.id"
              @click="removeAccount(account)"
            >
              {{ actionBusyAccountId === account.id ? "处理中..." : "删除" }}
            </button>
          </div>
        </div>
      </template>
    </div>

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

        <form class="account-edit-form" @submit.prevent="submitEdit">
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
              <option
                v-for="status in statusOptions"
                :key="status"
                :value="status"
              >
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
              @click="closeEditDialog"
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

        <form class="account-upgrade-form" @submit.prevent="submitUpgrade">
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
              @click="closeUpgradeDialog()"
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
  grid-template-columns:
    minmax(180px, 1.15fr)
    minmax(150px, 0.95fr)
    minmax(120px, 0.8fr)
    minmax(140px, 1fr)
    minmax(140px, 1fr)
    minmax(140px, auto);
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

.account-row__workspace {
  display: grid;
  gap: 4px;
}

.workspace-badge {
  display: inline-flex;
  width: fit-content;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.workspace-badge--team {
  background: rgba(26, 117, 255, 0.12);
  color: #145cd1;
}

.workspace-badge--personal {
  background: rgba(15, 123, 108, 0.12);
  color: #0f7b6c;
}

.workspace-badge--unknown {
  background: rgba(20, 33, 61, 0.08);
  color: var(--muted);
}

.account-row__workspace small {
  color: var(--muted);
  font-size: 0.82rem;
  word-break: break-all;
}

.account-row__subscription {
  display: grid;
  gap: 4px;
}

.subscription-badge {
  display: inline-flex;
  width: fit-content;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.subscription-badge--active {
  background: rgba(15, 123, 108, 0.12);
  color: #0f7b6c;
}

.subscription-badge--trial {
  background: rgba(216, 109, 57, 0.12);
  color: #b94d1d;
}

.subscription-badge--inactive {
  background: rgba(170, 61, 55, 0.12);
  color: #aa3d37;
}

.subscription-badge--unknown {
  background: rgba(20, 33, 61, 0.08);
  color: var(--muted);
}

.account-row__subscription small {
  color: var(--muted);
  font-size: 0.82rem;
}

.subscription-upgrade-btn {
  width: fit-content;
  min-width: 74px;
  padding: 8px 12px;
  border-radius: 12px;
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

.account-upgrade-dialog {
  width: min(92vw, 700px);
}

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
