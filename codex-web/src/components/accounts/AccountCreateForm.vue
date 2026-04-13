<script setup lang="ts">
import { onUnmounted, ref } from "vue";
import { parseSessionAuthPayload } from "../../utils/session-parser.ts";
import {
  createAccount,
  getChatgptCaptureTask,
  saveChatgptCaptureTask,
  startChatgptCapture,
  type WorkspaceContext,
  type WorkspaceKind,
} from "../../services/gateway-api.ts";

const emit = defineEmits<{
  created: [];
}>();

const submitting = ref(false);
const formFeedback = ref("");
const formFeedbackTone = ref<"success" | "error">("success");

const credentialsEmail = ref("");
const credentialsPassword = ref("");
const sessionPayload = ref("");
const captureProfileKey = ref("default");
const captureTaskId = ref("");
const captureState = ref<"idle" | "running" | "completed" | "failed">("idle");
const captureProgressMessage = ref("");
const captureBusy = ref(false);
const workspaceKind = ref<WorkspaceKind>("unknown");
const workspaceId = ref("");
const workspaceName = ref("");
const workspaceHeadersPayload = ref("");
let captureTimer: number | null = null;

const makeAccountIdFromEmail = (email: string) =>
  `acc_${email
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replaceAll(/^_+|_+$/g, "")}_${Date.now().toString(36)}`;

const setFormFeedback = (message: string, tone: "success" | "error") => {
  formFeedback.value = message;
  formFeedbackTone.value = tone;
};

const parseWorkspaceHeaders = (payload: string) => {
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

const mergeWorkspaceContext = (detected: WorkspaceContext | null): WorkspaceContext => {
  const headers = parseWorkspaceHeaders(workspaceHeadersPayload.value) ?? detected?.headers ?? null;
  const resolvedKind =
    workspaceKind.value === "unknown" ? (detected?.kind ?? "unknown") : workspaceKind.value;

  return {
    kind: resolvedKind,
    id: workspaceId.value.trim() || detected?.id || null,
    name: workspaceName.value.trim() || detected?.name || null,
    headers,
  };
};

const stopCapturePolling = () => {
  if (captureTimer !== null) {
    window.clearInterval(captureTimer);
    captureTimer = null;
  }
};

const pollCaptureTask = async () => {
  if (!captureTaskId.value) {
    return;
  }

  try {
    const { task } = await getChatgptCaptureTask(captureTaskId.value);
    captureState.value = task.state;
    captureProgressMessage.value = task.progressMessage;

    if (task.state === "completed") {
      stopCapturePolling();
      captureBusy.value = false;
      const saveResult = await saveChatgptCaptureTask(task.id, {
        workspace: mergeWorkspaceContext(task.result?.workspace ?? null),
      });
      setFormFeedback(`浏览器登录采集成功，已保存账号 ${saveResult.account.name}。`, "success");
      emit("created");
    } else if (task.state === "failed") {
      stopCapturePolling();
      captureBusy.value = false;
      setFormFeedback(task.errorMessage ?? "浏览器登录采集失败。", "error");
    }
  } catch (error) {
    stopCapturePolling();
    captureBusy.value = false;
    setFormFeedback(error instanceof Error ? error.message : "登录采集状态查询失败。", "error");
  }
};

const startBrowserCaptureFlow = async () => {
  if (captureBusy.value) {
    return;
  }

  stopCapturePolling();
  captureBusy.value = true;
  captureTaskId.value = "";
  captureState.value = "idle";
  captureProgressMessage.value = "";
  formFeedback.value = "";

  try {
    const { task } = await startChatgptCapture({
      profileKey: captureProfileKey.value.trim() || "default",
    });
    captureTaskId.value = task.id;
    captureState.value = task.state;
    captureProgressMessage.value = task.progressMessage;
    setFormFeedback("浏览器已打开，请完成登录，系统会自动采集并保存账号。", "success");

    captureTimer = window.setInterval(() => {
      void pollCaptureTask();
    }, 3_000);
    void pollCaptureTask();
  } catch (error) {
    captureBusy.value = false;
    setFormFeedback(error instanceof Error ? error.message : "启动浏览器登录采集失败。", "error");
  }
};

const createAccountBySessionPayload = async (payload: string) => {
  const result = parseSessionAuthPayload(payload);
  if (!result.ok) {
    throw new Error(result.message);
  }

  await createAccount({
    id: makeAccountIdFromEmail(result.email),
    name: result.email,
    status: "healthy",
    auth: {
      mode: "bearer",
      token: result.accessToken,
    },
    workspace: mergeWorkspaceContext(result.workspace),
    sessionInfo: payload.trim(),
  });
};

const submitAccount = async () => {
  formFeedback.value = "";
  submitting.value = true;

  try {
    if (sessionPayload.value.trim()) {
      await createAccountBySessionPayload(sessionPayload.value);
    } else if (credentialsEmail.value.trim() && credentialsPassword.value.trim()) {
      throw new Error("方式一自动登录流程尚未接入，请先使用方式二 Session JSON。");
    } else {
      throw new Error("请填写方式一（账号密码）或方式二（Session JSON）。");
    }

    credentialsEmail.value = "";
    credentialsPassword.value = "";
    sessionPayload.value = "";
    setFormFeedback("账号创建成功。", "success");
    emit("created");
  } catch (error) {
    setFormFeedback(error instanceof Error ? error.message : "账号保存失败。", "error");
  } finally {
    submitting.value = false;
  }
};

onUnmounted(() => {
  stopCapturePolling();
});
</script>

<template>
  <form class="dashboard-form" @submit.prevent="submitAccount">
    <section class="account-add-panel">
      <h3 class="account-add-panel__title">方式一：浏览器登录自动采集（推荐）</h3>
      <p class="account-add-panel__hint">点击后自动打开浏览器，手动完成登录，系统自动保存登录态与 token。</p>

      <div class="dashboard-form__grid account-credentials-grid">
        <label class="dashboard-field">
          <span>浏览器配置档（profile）</span>
          <input
            v-model="captureProfileKey"
            class="dashboard-input dashboard-input--light"
            type="text"
            spellcheck="false"
            placeholder="default"
          />
        </label>

        <div class="dashboard-toolbar">
          <button
            type="button"
            class="primary-btn dashboard-primary-btn account-save-btn"
            :disabled="captureBusy"
            @click="startBrowserCaptureFlow"
          >
            <span v-if="captureBusy" class="btn-spinner" aria-hidden="true"></span>
            <span>{{ captureBusy ? "采集中..." : "启动浏览器登录采集" }}</span>
          </button>
        </div>

        <p v-if="captureTaskId" class="account-capture-meta">
          任务 {{ captureTaskId }} · 状态 {{ captureState }} · {{ captureProgressMessage }}
        </p>
      </div>
    </section>

    <section class="account-add-panel">
      <h3 class="account-add-panel__title">方式二：账号密码（预留）</h3>
      <p class="account-add-panel__hint">后续可接入自动化账号密码登录流程。</p>

      <div class="dashboard-form__grid account-credentials-grid">
        <label class="dashboard-field">
          <span>账号（邮箱）</span>
          <input
            v-model="credentialsEmail"
            class="dashboard-input dashboard-input--light"
            type="email"
            spellcheck="false"
          />
        </label>

        <label class="dashboard-field">
          <span>密码</span>
          <input
            v-model="credentialsPassword"
            class="dashboard-input dashboard-input--light"
            type="password"
            spellcheck="false"
          />
        </label>
      </div>
    </section>

    <section class="account-add-panel">
      <h3 class="account-add-panel__title">方式三：Session JSON（手动导入）</h3>
      <p class="account-add-panel__hint">直接粘贴 /api/auth/session 返回的完整 JSON。</p>
      <label class="dashboard-field dashboard-field--full">
        <span>Session JSON</span>
        <textarea
          v-model="sessionPayload"
          class="dashboard-textarea"
          rows="8"
          spellcheck="false"
          placeholder="粘贴 /api/auth/session 返回的完整 JSON"
        />
      </label>
    </section>

    <section class="account-add-panel">
      <h3 class="account-add-panel__title">团队空间配置（可选）</h3>
      <p class="account-add-panel__hint">
        用于显式标记账号属于个人/团队空间，并可配置 workspace 请求头以稳定拉取团队 Codex 额度。
      </p>

      <div class="dashboard-form__grid account-workspace-grid">
        <label class="dashboard-field">
          <span>空间类型</span>
          <select v-model="workspaceKind" class="dashboard-select">
            <option value="unknown">自动识别</option>
            <option value="personal">个人空间</option>
            <option value="team">团队空间</option>
          </select>
        </label>

        <label class="dashboard-field">
          <span>空间名称（可选）</span>
          <input
            v-model="workspaceName"
            class="dashboard-input dashboard-input--light"
            type="text"
            spellcheck="false"
            placeholder="例如：codexcn 团队空间"
          />
        </label>

        <label class="dashboard-field">
          <span>空间 ID（可选）</span>
          <input
            v-model="workspaceId"
            class="dashboard-input dashboard-input--light"
            type="text"
            spellcheck="false"
            placeholder="例如：ws_xxx / org_xxx"
          />
        </label>

        <label class="dashboard-field dashboard-field--full">
          <span>空间请求头 JSON（可选）</span>
          <textarea
            v-model="workspaceHeadersPayload"
            class="dashboard-textarea"
            rows="4"
            spellcheck="false"
            placeholder='例如：{"x-openai-account-id":"ws_xxx"}'
          />
        </label>
      </div>
    </section>

    <div class="dashboard-form__footer">
      <div>
        <div
          v-if="formFeedback"
          class="dashboard-form__feedback"
          :class="`dashboard-form__feedback--${formFeedbackTone}`"
        >
          {{ formFeedback }}
        </div>
      </div>

      <div class="dashboard-toolbar">
        <button
          type="submit"
          class="primary-btn dashboard-primary-btn account-save-btn"
          :disabled="submitting"
        >
          <span v-if="submitting" class="btn-spinner" aria-hidden="true"></span>
          <span>{{ submitting ? "保存中..." : "保存账号" }}</span>
        </button>
      </div>
    </div>
  </form>
</template>

<style scoped>
.dashboard-form {
  display: grid;
  gap: 16px;
}

.account-add-panel {
  display: grid;
  gap: 14px;
}

.account-add-panel__title {
  font-family: var(--font-heading);
  font-size: 1.12rem;
}

.account-add-panel__hint {
  color: var(--muted);
  font-size: 0.92rem;
}

.account-capture-meta {
  color: var(--muted);
  font-size: 0.9rem;
  word-break: break-all;
}

.dashboard-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.account-credentials-grid {
  grid-template-columns: 1fr;
}

.account-workspace-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
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

.dashboard-input,
.dashboard-select,
.dashboard-textarea {
  width: 100%;
  min-height: 50px;
  padding: 12px 14px;
  border: 1px solid rgba(20, 33, 61, 0.14);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.78);
  color: var(--ink);
}

.dashboard-textarea {
  min-height: 130px;
  resize: vertical;
}

.dashboard-input:focus,
.dashboard-select:focus,
.dashboard-textarea:focus {
  outline: none;
  border-color: rgba(216, 109, 57, 0.34);
  box-shadow: 0 0 0 4px rgba(216, 109, 57, 0.08);
}

.dashboard-form__footer {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  padding-top: 6px;
}

.dashboard-form__feedback {
  margin-top: 10px;
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

.dashboard-toolbar {
  display: flex;
  align-items: center;
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
  .account-workspace-grid {
    grid-template-columns: 1fr;
  }

  .dashboard-form__footer {
    flex-direction: column;
    align-items: stretch;
  }

  .dashboard-toolbar,
  .dashboard-primary-btn {
    width: 100%;
  }
}
</style>
